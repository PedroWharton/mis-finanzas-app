import { describe, it, expect, vi, beforeEach } from 'vitest'
import { correrCronDiario, type EvaluacionesDoc } from './cronDiario'
import type { Storage, Doc } from './storage'
import type { PrediccionesDoc } from './registroPredicciones'
import type { Snapshot } from './tipos'
import { _resetCache as resetPrecios } from './precios'
import { _resetCache as resetHistoricos } from './historicos'

function storageEnMemoria(docs: Partial<Record<Doc, unknown>>): Storage & { docs: Partial<Record<Doc, unknown>> } {
  return {
    docs,
    async leer(doc) {
      return docs[doc] ?? null
    },
    async escribir(doc, valor) {
      docs[doc] = valor
    },
  }
}

const portfolio = {
  monedaBase: 'USD',
  plataformas: [
    {
      nombre: 'DolarApp',
      efectivoUSD: 100,
      posiciones: [{ ticker: 'VOO', nombre: 'Vanguard', tipo: 'acciones', cantidad: 2, costoUSD: 1000, fecha: '2026-03-07' }],
    },
  ],
  operaciones: [],
}

// 300 ruedas: suficiente para indicadores Y para predecir (250 mínimo).
const DIAS = 300
const BASE_TS = Date.UTC(2025, 0, 1) / 1000
function chartJson(): unknown {
  const timestamp = Array.from({ length: DIAS }, (_, i) => BASE_TS + i * 86400)
  const adjclose = Array.from({ length: DIAS }, (_, i) => 100 * Math.exp(0.0004 * i) + (i % 5) * 0.3)
  return { chart: { result: [{ timestamp, indicators: { adjclose: [{ adjclose }] }, meta: { regularMarketPrice: 520, chartPreviousClose: 510 } }] } }
}

// Sirve CoinGecko y Yahoo (chart 2y para históricos, 1d para precios).
function fetchFalso() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('coingecko')) return new Response(JSON.stringify({}))
    if (u.includes('finance.yahoo.com')) return new Response(JSON.stringify(chartJson()))
    throw new Error(`URL inesperada: ${u}`)
  }) as unknown as typeof fetch
}

function fetchRoto() {
  return vi.fn(async () => {
    throw new Error('sin red')
  }) as unknown as typeof fetch
}

const pushInerte = async () => {}

beforeEach(() => {
  resetPrecios()
  resetHistoricos()
})

describe('correrCronDiario', () => {
  it('con datos frescos registra snapshot, da de alta predicciones y guarda veredictos', async () => {
    const storage = storageEnMemoria({ portfolio, watchlist: { agregados: [], ocultos: [] } })
    const r = await correrCronDiario(storage, fetchFalso(), pushInerte)

    expect(r.snapshot).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((storage.docs.snapshots as Snapshot[]).length).toBe(1)

    expect(r.prediccionesActualizadas).toBe(true)
    const pred = storage.docs.predicciones as PrediccionesDoc
    // VOO en cartera + los 25 curados de la watchlist, 2 horizontes cada uno.
    expect(pred.registros.length).toBeGreaterThanOrEqual(2)
    expect(pred.registros.every((x) => x.resultado === null)).toBe(true)

    expect(r.veredictosGuardados).toBeGreaterThan(0)
    const evals = storage.docs.evaluaciones as EvaluacionesDoc
    expect(evals.veredictos.VOO).toBeTruthy()
    // Sin registro previo no hay cambios ni push.
    expect(r.cambios).toEqual([])
    expect(r.push).toBeNull()
  })

  it('es idempotente en el snapshot: dos corridas el mismo día no duplican', async () => {
    const storage = storageEnMemoria({ portfolio, watchlist: { agregados: [], ocultos: [] } })
    await correrCronDiario(storage, fetchFalso(), pushInerte)
    resetPrecios()
    resetHistoricos()
    await correrCronDiario(storage, fetchFalso(), pushInerte)
    expect((storage.docs.snapshots as Snapshot[]).length).toBe(1)
  })

  it('detecta cambios de veredicto contra el registro previo y los avisa por push', async () => {
    const storage = storageEnMemoria({ portfolio, watchlist: { agregados: [], ocultos: [] } })
    // Primera corrida para saber el veredicto real que produce la serie.
    await correrCronDiario(storage, fetchFalso(), pushInerte)
    const veredictoReal = (storage.docs.evaluaciones as EvaluacionesDoc).veredictos.VOO
    // Plantar un previo distinto y una suscripción de push.
    const otro = veredictoReal === 'vender' ? 'comprar' : 'vender'
    storage.docs.evaluaciones = { fecha: '2026-01-01', veredictos: { VOO: otro } }
    storage.docs['push-subs'] = { subs: [{ endpoint: 'https://push/x', keys: { p256dh: 'a', auth: 'b' } }] }

    const payloads: string[] = []
    resetPrecios()
    resetHistoricos()
    const r = await correrCronDiario(storage, fetchFalso(), async (_s, payload) => {
      payloads.push(payload)
    })

    expect(r.cambios).toEqual([{ ticker: 'VOO', antes: otro, ahora: veredictoReal }])
    expect(r.push).toEqual({ enviados: 1, podadas: 0 })
    expect(payloads).toHaveLength(1)
    expect(JSON.parse(payloads[0]).body).toContain(`VOO: ${otro} → ${veredictoReal}`)
    // El doc quedó actualizado: el mismo cambio no se re-avisa mañana.
    expect((storage.docs.evaluaciones as EvaluacionesDoc).veredictos.VOO).toBe(veredictoReal)
  })

  it('sin red no registra predicciones ni veredictos (históricos desactualizados) pero sí el snapshot', async () => {
    const storage = storageEnMemoria({ portfolio, watchlist: { agregados: [], ocultos: [] } })
    const r = await correrCronDiario(storage, fetchRoto(), pushInerte)
    expect(r.snapshot).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.prediccionesActualizadas).toBe(false)
    expect(r.veredictosGuardados).toBe(0)
    expect(storage.docs.predicciones).toBeUndefined()
    expect(storage.docs.evaluaciones).toBeUndefined()
    expect(r.advertencias.join(' ')).toContain('históricos desactualizados')
  })

  it('si la lectura de veredictos previos falla, NO sobreescribe el doc', async () => {
    const docs: Partial<Record<Doc, unknown>> = { portfolio, watchlist: { agregados: [], ocultos: [] } }
    const storage: Storage = {
      async leer(doc) {
        if (doc === 'evaluaciones') throw new Error('blob caído')
        return docs[doc] ?? null
      },
      async escribir(doc, valor) {
        if (doc === 'evaluaciones') throw new Error('no debería escribirse')
        docs[doc] = valor
      },
    }
    const r = await correrCronDiario(storage, fetchFalso(), pushInerte)
    expect(r.veredictosGuardados).toBe(0)
    expect(r.advertencias.join(' ')).toContain('no se pudo leer el registro de veredictos')
    // El resto de la corrida no se vio afectado.
    expect(r.snapshot).not.toBeNull()
    expect(r.prediccionesActualizadas).toBe(true)
  })
})

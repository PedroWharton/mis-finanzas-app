import { describe, it, expect, vi, beforeEach } from 'vitest'
import { armarContexto } from './contextoAgente'
import type { Storage, Doc } from './storage'
import { _resetCache as resetPrecios } from './precios'
import { _resetCache as resetHistoricos } from './historicos'
import { _resetCache as resetInsiders } from './insiders'

function storageEnMemoria(docs: Partial<Record<Doc, unknown>>): Storage {
  return {
    async leer(doc) {
      return docs[doc] ?? null
    },
    async escribir(doc, valor) {
      docs[doc] = valor
    },
  }
}

// Muestra real de data/historicos.json (últimas 40 ruedas de VOO): alcanza
// para indicadores/evaluación pero NO para predecir (pide 250 días).
const serieVOO = {
  fechas: [
    '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08', '2026-06-09',
    '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-15', '2026-06-16', '2026-06-17',
    '2026-06-18', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
    '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-06', '2026-07-07',
    '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13', '2026-07-14', '2026-07-15',
    '2026-07-16', '2026-07-17', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
    '2026-07-24', '2026-07-27', '2026-07-28', '2026-07-29',
  ],
  precios: [
    696.2325, 691.3467, 694.0389, 676.0313, 677.7064, 675.7322, 665.1131, 676.2606,
    679.9698, 691.8154, 687.7472, 679.4314, 686.1119, 684.1078, 674.3762, 673.728,
    673.748, 670.26, 681.01, 686.81, 685.46, 684.84, 690.62, 687.08, 685.26, 690.69,
    693.86, 688.5, 691.1, 693.8, 690.14, 683.17, 682.21, 687.87, 687.03, 678.61,
    679.14, 679.31, 680.96, 670.63,
  ],
}

// Serie larga y determinista (≥250 días) para el camino donde sí hay predicción.
const serieLarga = {
  fechas: Array.from({ length: 300 }, (_, i) => `d${i}`),
  precios: Array.from({ length: 300 }, (_, i) => 100 * Math.exp(0.0003 * i) + (i % 5) * 0.4),
}

const portfolio = {
  monedaBase: 'USD',
  plataformas: [
    {
      nombre: 'DolarApp',
      efectivoUSD: 100,
      posiciones: [
        { ticker: 'VOO', nombre: 'Vanguard', tipo: 'acciones', cantidad: 2, costoUSD: 1000, fecha: '2026-03-07' },
        { ticker: 'BTC', nombre: 'Bitcoin', tipo: 'cripto', cantidad: 0.1, costoUSD: 5000, fecha: '2026-03-07' },
        { ticker: 'MU', nombre: 'Micron', tipo: 'acciones', cantidad: 3, costoUSD: 300, fecha: '2026-03-07' },
      ],
    },
    { nombre: 'Nexo', efectivoUSD: 50, posiciones: [] },
  ],
  operaciones: [],
}

const historicos = {
  fecha: '2026-07-29',
  series: { VOO: serieVOO, BTC: serieLarga },
}

function fetchRoto() {
  return vi.fn(async () => {
    throw new Error('sin red')
  }) as unknown as typeof fetch
}

beforeEach(() => {
  resetPrecios()
  resetHistoricos()
  resetInsiders()
})

describe('armarContexto', () => {
  it('compone cartera, precios, indicadores y evaluación por posición', async () => {
    const storage = storageEnMemoria({
      portfolio,
      'last-prices': {
        fecha: '2026-08-04',
        precios: { VOO: 520, BTC: 60000 },
        variaciones: { VOO: 1.2 },
      },
      historicos,
      watchlist: { agregados: [], ocultos: [] },
    })
    const ctx = await armarContexto(storage, fetchRoto())

    expect(ctx.monedaBase).toBe('USD')
    expect(ctx.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ctx.precios.desactualizado).toBe(true)
    expect(ctx.plataformas).toEqual(portfolio.plataformas)

    const voo = ctx.posiciones.find((p) => p.ticker === 'VOO')
    expect(voo).toBeDefined()
    expect(voo!.valorUSD).toBeCloseTo(2 * 520)
    expect(voo!.indicadores!.precio).toBeCloseTo(670.63)
    expect(voo!.evaluacion!.veredicto).toBeTruthy()
    // 40 ruedas: no alcanza para predecir.
    expect(voo!.prediccion1m).toBeNull()

    const btc = ctx.posiciones.find((p) => p.ticker === 'BTC')
    expect(btc!.prediccion1m).not.toBeNull()
    expect(btc!.prediccion1m!.h).toBe(30) // horizonte de 1 mes en cripto
    expect(btc!.prediccion1m!.p10).toBeLessThan(btc!.prediccion1m!.p90)

    // MU no tiene serie: nada de indicadores/evaluación/predicción.
    const mu = ctx.posiciones.find((p) => p.ticker === 'MU')
    expect(mu!.indicadores).toBeNull()
    expect(mu!.evaluacion).toBeNull()
    expect(mu!.prediccion1m).toBeNull()

    // Pesos sobre la cartera COMPLETA (incluye el efectivo), igual que
    // /evaluacion: las posiciones solas no suman 1.
    const valorPosiciones = ctx.posiciones.reduce((s, p) => s + p.valorUSD, 0)
    const suma = ctx.posiciones.reduce((s, p) => s + p.peso, 0)
    expect(suma).toBeCloseTo(valorPosiciones / (valorPosiciones + 150))
    expect(voo!.peso).toBeCloseTo((2 * 520) / (valorPosiciones + 150))

    expect(ctx.efectivoTotalUSD).toBe(150)
    expect(Array.isArray(ctx.watchlist)).toBe(true)
    expect(ctx.watchlist.every((e) => e.ticker && e.tipo)).toBe(true)
    // Los tickers de la cartera no aparecen en el universo de oportunidades.
    expect(ctx.watchlist.some((e) => e.ticker === 'MU')).toBe(false)
  })

  it('enriquece la watchlist con indicadores, evaluación (peso 0) y predicción 1 m', async () => {
    const storage = storageEnMemoria({
      portfolio,
      historicos: {
        fecha: '2026-07-29',
        series: { VOO: serieVOO, BTC: serieLarga, ETH: serieLarga },
      },
      watchlist: { agregados: [{ ticker: 'ETH', tipo: 'cripto' }], ocultos: [] },
    })
    const ctx = await armarContexto(storage, fetchRoto())

    const eth = ctx.watchlist.find((e) => e.ticker === 'ETH')
    expect(eth).toBeDefined()
    expect(eth!.indicadores).not.toBeNull()
    expect(eth!.evaluacion!.veredicto).toBeTruthy()
    expect(eth!.prediccion1m).not.toBeNull()
    expect(eth!.prediccion1m!.p10).toBeLessThan(eth!.prediccion1m!.p90)
    // Con peso 0 no puede haber alerta de concentración.
    expect(eth!.evaluacion!.alertas ?? []).toEqual([])

    // Candidato curado sin serie histórica: paquete analítico en null.
    const aapl = ctx.watchlist.find((e) => e.ticker === 'AAPL')
    expect(aapl).toBeDefined()
    expect(aapl!.indicadores).toBeNull()
    expect(aapl!.evaluacion).toBeNull()
    expect(aapl!.prediccion1m).toBeNull()
  })

  it('resume el track record del predictor (total y por horizonte)', async () => {
    const reg = (horizonte: '1m' | '3m', dentroBanda: boolean, errorPct: number) => ({
      fechaOrigen: '2026-06-01',
      ticker: 'VOO',
      tipo: 'acciones',
      horizonte,
      precioOrigen: 100,
      p10: 90,
      p50: 100,
      p90: 110,
      fechaVencimiento: '2026-07-01',
      resultado: { fecha: '2026-07-01', precioReal: 100, dentroBanda, errorPct },
    })
    const storage = storageEnMemoria({
      portfolio,
      historicos,
      watchlist: { agregados: [], ocultos: [] },
      predicciones: {
        registros: [
          reg('1m', true, 0.02),
          reg('1m', false, 0.12),
          reg('3m', true, 0.05),
          // Pendiente: no cuenta como vencida.
          { ...reg('1m', true, 0), resultado: null },
        ],
      },
    })
    const ctx = await armarContexto(storage, fetchRoto())

    expect(ctx.desempenoPredictor).not.toBeNull()
    const d = ctx.desempenoPredictor!
    expect(d.vencidas).toBe(3)
    expect(d.dentroBanda).toBe(2)
    expect(d.tasaDentroBanda).toBeCloseTo(2 / 3)
    expect(d.porHorizonte['1m'].vencidas).toBe(2)
    expect(d.porHorizonte['1m'].dentroBanda).toBe(1)
    expect(d.porHorizonte['1m'].errorMedianoPct).toBeCloseTo(0.07)
    expect(d.porHorizonte['3m']).toEqual({ vencidas: 1, dentroBanda: 1, errorMedianoPct: 0.05 })
  })

  it('desempenoPredictor es null sin registro o sin vencidas, y ante fallo de lectura degrada sin abortar', async () => {
    const sinDoc = await armarContexto(storageEnMemoria({ portfolio, historicos, watchlist: { agregados: [], ocultos: [] } }), fetchRoto())
    expect(sinDoc.desempenoPredictor).toBeNull()

    const storageRoto: Storage = {
      async leer(doc) {
        if (doc === 'predicciones') throw new Error('blob caído')
        if (doc === 'portfolio') return portfolio
        if (doc === 'historicos') return historicos
        if (doc === 'watchlist') return { agregados: [], ocultos: [] }
        return null
      },
      async escribir() {},
    }
    const ctx = await armarContexto(storageRoto, fetchRoto())
    expect(ctx.desempenoPredictor).toBeNull()
    expect(ctx.posiciones.length).toBeGreaterThan(0)
  })

  it('propaga un error real de lectura del portfolio en vez de degradar a cartera vacía', async () => {
    const storage: Storage = {
      async leer(doc) {
        if (doc === 'portfolio') throw new Error('blob caído')
        return null
      },
      async escribir() {},
    }
    await expect(armarContexto(storage, fetchRoto())).rejects.toThrow('blob caído')
  })

  it('propaga un error real de lectura de la watchlist', async () => {
    const storage: Storage = {
      async leer(doc) {
        if (doc === 'watchlist') throw new Error('blob caído')
        if (doc === 'portfolio') return portfolio
        return null
      },
      async escribir() {},
    }
    await expect(armarContexto(storage, fetchRoto())).rejects.toThrow('blob caído')
  })

  it('sin portfolio devuelve contexto vacío pero bien formado', async () => {
    const ctx = await armarContexto(storageEnMemoria({}), fetchRoto())
    expect(ctx.posiciones).toEqual([])
    expect(ctx.plataformas).toEqual([])
    expect(ctx.efectivoTotalUSD).toBe(0)
    expect(ctx.monedaBase).toBe('USD')
    expect(ctx.watchlist.length).toBeGreaterThan(0)
  })

  it('incluye las últimas 50 operaciones ordenadas por fecha descendente, sort estable', async () => {
    const ops = [
      { fecha: '2026-08-01', tipo: 'compra' as const, plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 600 },
      { fecha: '2026-08-03', tipo: 'deposito' as const, plataforma: 'Nexo', montoUSD: 100 },
      { fecha: '2026-08-01', tipo: 'interes' as const, plataforma: 'Nexo', montoUSD: 5 },
      ...Array.from({ length: 60 }, (_, i) => ({ fecha: '2026-07-01', tipo: 'interes' as const, plataforma: 'Nexo', montoUSD: i })),
    ]
    const docs = { portfolio: { ...portfolio, operaciones: ops } }
    const ctx = await armarContexto(storageEnMemoria(docs), fetchRoto())
    expect(ctx.operaciones).toHaveLength(50)
    expect(ctx.operaciones[0].fecha).toBe('2026-08-03')
    // sort estable: las dos del 2026-08-01 conservan el orden del portfolio
    expect(ctx.operaciones[1]).toMatchObject({ tipo: 'compra', ticker: 'VOO' })
    expect(ctx.operaciones[2]).toMatchObject({ tipo: 'interes', montoUSD: 5 })
  })

  it('reporta pares correlacionados de cartera y correlación media por posición y candidato', async () => {
    // VOO y BTC comparten exactamente la misma serie ⇒ correlación 1.
    const storage = storageEnMemoria({
      portfolio,
      historicos: {
        fecha: '2026-07-29',
        series: { VOO: serieLarga, BTC: serieLarga, ETH: serieLarga },
      },
      watchlist: { agregados: [{ ticker: 'ETH', tipo: 'cripto' }], ocultos: [] },
    })
    const ctx = await armarContexto(storage, fetchRoto())

    expect(ctx.paresCorrelacionados).toEqual([{ a: 'VOO', b: 'BTC', correlacion: 1 }])
    const voo = ctx.posiciones.find((p) => p.ticker === 'VOO')
    expect(voo!.correlacionMedia).toBe(1)
    // MU no tiene serie: sin correlación.
    expect(ctx.posiciones.find((p) => p.ticker === 'MU')!.correlacionMedia).toBeNull()
    const eth = ctx.watchlist.find((e) => e.ticker === 'ETH')
    expect(eth!.correlacionMediaVsCartera).toBe(1)
    // Candidato sin serie: null.
    expect(ctx.watchlist.find((e) => e.ticker === 'AAPL')!.correlacionMediaVsCartera).toBeNull()
  })

  it('resume la evolución del patrimonio neta de aportes', async () => {
    const snapshots = [
      { fecha: '2026-07-01', totalUSD: 10000, porPlataforma: {} },
      { fecha: '2026-07-25', totalUSD: 11000, porPlataforma: {} },
      { fecha: '2026-08-01', totalUSD: 12000, porPlataforma: {} },
    ]
    const ops = [{ fecha: '2026-07-28', tipo: 'deposito' as const, plataforma: 'DolarApp', montoUSD: 500 }]
    const storage = storageEnMemoria({
      portfolio: { ...portfolio, operaciones: ops },
      historicos,
      watchlist: { agregados: [], ocultos: [] },
      snapshots,
    })
    const ctx = await armarContexto(storage, fetchRoto())

    expect(ctx.evolucion).not.toBeNull()
    const e = ctx.evolucion!
    expect(e.snapshots).toHaveLength(3)
    expect(e.snapshots[2]).toEqual({ fecha: '2026-08-01', totalUSD: 12000 })
    // 7d atrás del 08-01 = 07-25: 12000 − 11000 − 500 de depósito = +500.
    expect(e.variacion7dUSD).toBe(500)
    // 30d atrás = 07-02 ⇒ base 07-01: 12000 − 10000 − 500 = +1500.
    expect(e.variacion30dUSD).toBe(1500)
    expect(e.dietz).not.toBeNull()
    expect(e.dietz!.desde).toBe('2026-07-01')
    // Curva siempre creciente: sin drawdown.
    expect(e.maxDrawdownCurva).toBe(0)
  })

  it('evolucion es null sin snapshots y degrada ante fallo de lectura', async () => {
    const sinDoc = await armarContexto(storageEnMemoria({ portfolio, historicos, watchlist: { agregados: [], ocultos: [] } }), fetchRoto())
    expect(sinDoc.evolucion).toBeNull()

    const storageRoto: Storage = {
      async leer(doc) {
        if (doc === 'snapshots') throw new Error('blob caído')
        if (doc === 'portfolio') return portfolio
        if (doc === 'historicos') return historicos
        if (doc === 'watchlist') return { agregados: [], ocultos: [] }
        return null
      },
      async escribir() {},
    }
    const ctx = await armarContexto(storageRoto, fetchRoto())
    expect(ctx.evolucion).toBeNull()
    expect(ctx.posiciones.length).toBeGreaterThan(0)
  })

  it('operaciones es [] con lista vacía en el portfolio', async () => {
    const ctx = await armarContexto(storageEnMemoria({ portfolio: { ...portfolio, operaciones: [] } }), fetchRoto())
    expect(ctx.operaciones).toEqual([])
  })
})

// Solo OpenInsider responde; Yahoo/CoinGecko siguen caídos como en fetchRoto.
const HTML_INSIDERS = `<table class="tinytable"><tr><th>X</th><th>Filing Date</th><th>Trade Date</th><th>Ticker</th><th>Insider Name</th><th>Title</th><th>Trade Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th><th>1d</th><th>1w</th><th>1m</th><th>6m</th></tr>
<tr><td></td><td>2026-08-10 17:00:00</td><td>2026-08-08</td><td><a>VOO</a></td><td><a>A</a></td><td>Dir</td><td>P - Purchase</td><td>$500.00</td><td>+100</td><td>100</td><td>+1%</td><td>+$50,000</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td>2026-08-10 17:00:00</td><td>2026-08-08</td><td><a>AAPL</a></td><td><a>B</a></td><td>CEO</td><td>S - Sale</td><td>$200.00</td><td>-100</td><td>100</td><td>-1%</td><td>-$20,000</td><td></td><td></td><td></td><td></td></tr>
</table>`
function fetchSoloInsiders() {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('openinsider.com')) return { ok: true, text: async () => HTML_INSIDERS } as unknown as Response
    throw new Error('sin red')
  }) as unknown as typeof fetch
}

describe('armarContexto: insiders', () => {
  const docs = () => ({ portfolio, historicos, watchlist: { agregados: [], ocultos: [] } })

  it('adjunta el resumen de insiders a posiciones y candidatos de acciones; cripto queda null', async () => {
    const ctx = await armarContexto(storageEnMemoria(docs()), fetchSoloInsiders())
    const voo = ctx.posiciones.find((p) => p.ticker === 'VOO')!
    expect(voo.insiders).toMatchObject({ compras: 1, senal: 'compras' })
    // El veredicto determinístico también ve a los insiders (misma regla que /evaluacion y el cron).
    expect(voo.evaluacion!.razones.some((r) => /insider/.test(r) && /50 mil/.test(r))).toBe(true)
    expect(ctx.posiciones.find((p) => p.ticker === 'BTC')!.insiders).toBeNull()
    // MU está en cartera pero sin operaciones: neutral, no null (sí hubo dato).
    expect(ctx.posiciones.find((p) => p.ticker === 'MU')!.insiders).toMatchObject({ senal: 'neutral' })
    expect(ctx.watchlist.find((e) => e.ticker === 'AAPL')!.insiders).toMatchObject({ ventas: 1, senal: 'ventas' })
    expect(ctx.insidersFuente).toEqual({ fecha: ctx.fecha, desactualizado: false })
  })

  it('sin OpenInsider ni persistido, insiders es null en todos lados y la fuente es null', async () => {
    const ctx = await armarContexto(storageEnMemoria(docs()), fetchRoto())
    expect(ctx.posiciones.every((p) => p.insiders === null)).toBe(true)
    expect(ctx.watchlist.every((e) => e.insiders === null)).toBe(true)
    expect(ctx.insidersFuente).toBeNull()
  })

  it('pide a OpenInsider solo los tickers de acciones (cartera ∪ watchlist), no cripto', async () => {
    const f = fetchSoloInsiders()
    await armarContexto(storageEnMemoria(docs()), f)
    const urls = (f as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('openinsider.com'))
    expect(urls.length).toBeGreaterThan(0)
    const pedidos = urls.flatMap((u) => new URL(u).searchParams.get('s')!.split(' '))
    expect(pedidos).toContain('VOO')
    expect(pedidos).toContain('MU')
    expect(pedidos).toContain('AAPL')
    expect(pedidos).not.toContain('BTC')
  })
})

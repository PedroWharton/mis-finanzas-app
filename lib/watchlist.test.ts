import { describe, it, expect } from 'vitest'
import {
  LISTA_CURADA,
  normalizarTicker,
  universoEfectivo,
  agregarTicker,
  quitarTicker,
  validarTickerYahoo,
  type WatchlistDoc,
} from './watchlist'

const vacia: WatchlistDoc = { agregados: [], ocultos: [] }

describe('LISTA_CURADA', () => {
  it('tiene 25 tickers, todos tipo acciones', () => {
    expect(LISTA_CURADA).toHaveLength(25)
    expect(LISTA_CURADA.every((e) => e.tipo === 'acciones')).toBe(true)
    expect(LISTA_CURADA.map((e) => e.ticker)).toContain('BRK-B')
  })
})

describe('normalizarTicker', () => {
  it('trim, mayúsculas y punto → guion', () => {
    expect(normalizarTicker(' brk.b ')).toBe('BRK-B')
    expect(normalizarTicker('aapl')).toBe('AAPL')
  })
  it('con tipo cripto quita un sufijo -USD tipeado por el usuario', () => {
    expect(normalizarTicker('btc-usd', 'cripto')).toBe('BTC')
    expect(normalizarTicker('SOL', 'cripto')).toBe('SOL')
    // sin tipo (o acciones) NO se toca: el chequeo de cripto mal tipada lo necesita intacto
    expect(normalizarTicker('BTC-USD')).toBe('BTC-USD')
  })
})

describe('universoEfectivo', () => {
  it('curada − ocultos ∪ agregados − cartera', () => {
    const doc: WatchlistDoc = {
      agregados: [{ ticker: 'PLTR', tipo: 'acciones' }, { ticker: 'SOL', tipo: 'cripto' }],
      ocultos: ['TSLA'],
    }
    const efectivos = universoEfectivo(doc, ['AAPL', 'BTC'])
    const tickers = efectivos.map((e) => e.ticker)
    expect(tickers).not.toContain('TSLA') // oculto
    expect(tickers).not.toContain('AAPL') // en cartera
    expect(tickers).toContain('MSFT') // curado visible
    expect(tickers).toContain('PLTR')
    expect(efectivos.find((e) => e.ticker === 'SOL')?.tipo).toBe('cripto')
    // 25 curados − 1 oculto (TSLA) − 1 en cartera (AAPL) + 2 agregados = 25
    expect(tickers).toHaveLength(25)
  })
  it('no duplica un agregado que también es curado', () => {
    const doc: WatchlistDoc = { agregados: [{ ticker: 'AAPL', tipo: 'acciones' }], ocultos: [] }
    const tickers = universoEfectivo(doc, []).map((e) => e.ticker)
    expect(tickers.filter((t) => t === 'AAPL')).toHaveLength(1)
  })
})

describe('agregarTicker', () => {
  it('suma un ticker nuevo normalizado', () => {
    const r = agregarTicker(vacia, 'pltr', 'acciones')
    expect(r).toEqual({ ok: true, doc: { agregados: [{ ticker: 'PLTR', tipo: 'acciones' }], ocultos: [] } })
  })
  it('idempotente: agregar dos veces no duplica', () => {
    const una = agregarTicker(vacia, 'PLTR', 'acciones')
    if (!una.ok) throw new Error('inesperado')
    expect(agregarTicker(una.doc, 'PLTR', 'acciones')).toEqual({ ok: true, doc: una.doc })
  })
  it('re-agregar un curado oculto lo desoculta (no lo suma a agregados)', () => {
    const r = agregarTicker({ agregados: [], ocultos: ['TSLA'] }, 'TSLA', 'acciones')
    expect(r).toEqual({ ok: true, doc: { agregados: [], ocultos: [] } })
  })
  it('agregar un curado visible es no-op', () => {
    expect(agregarTicker(vacia, 'AAPL', 'acciones')).toEqual({ ok: true, doc: vacia })
  })
  it('rechaza ticker -USD con tipo acciones (cripto mal tipada)', () => {
    expect(agregarTicker(vacia, 'BTC-USD', 'acciones')).toEqual({ ok: false, error: 'cripto-mal-tipada' })
  })
  it('cripto tipeada con -USD se guarda sin el sufijo (el sistema lo agrega)', () => {
    expect(agregarTicker(vacia, 'BTC-USD', 'cripto')).toEqual({
      ok: true,
      doc: { agregados: [{ ticker: 'BTC', tipo: 'cripto' }], ocultos: [] },
    })
  })
  it('rechaza BONO y EFECTIVO: claves reservadas de la cartera', () => {
    expect(agregarTicker(vacia, 'bono', 'acciones')).toEqual({ ok: false, error: 'reservado' })
    expect(agregarTicker(vacia, 'EFECTIVO', 'acciones')).toEqual({ ok: false, error: 'reservado' })
  })
})

describe('quitarTicker', () => {
  it('curado → ocultos', () => {
    expect(quitarTicker(vacia, 'TSLA')).toEqual({ ok: true, doc: { agregados: [], ocultos: ['TSLA'] } })
  })
  it('agregado → se elimina', () => {
    const doc: WatchlistDoc = { agregados: [{ ticker: 'PLTR', tipo: 'acciones' }], ocultos: [] }
    expect(quitarTicker(doc, 'PLTR')).toEqual({ ok: true, doc: vacia })
  })
  it('desconocido → error', () => {
    expect(quitarTicker(vacia, 'ZZZZ')).toEqual({ ok: false, error: 'desconocido' })
  })
  it('ocultar dos veces no duplica en ocultos', () => {
    const r1 = quitarTicker(vacia, 'TSLA')
    if (!r1.ok) throw new Error('inesperado')
    expect(quitarTicker(r1.doc, 'TSLA')).toEqual({ ok: true, doc: { agregados: [], ocultos: ['TSLA'] } })
  })
})

describe('validarTickerYahoo', () => {
  const chartOk = { chart: { result: [{ timestamp: [1704153600], indicators: { adjclose: [{ adjclose: [100.5] }] } }] } }
  const chartVacio = { chart: { result: [{ timestamp: [], indicators: { adjclose: [{ adjclose: [] }] } }] } }

  it('adjclose válido → ok; usa símbolo -USD para cripto y range=1mo', async () => {
    const urls: string[] = []
    const f = (async (url: RequestInfo | URL) => {
      urls.push(String(url))
      return { status: 200, json: async () => chartOk } as unknown as Response
    }) as typeof fetch
    expect(await validarTickerYahoo('SOL', 'cripto', f)).toBe('ok')
    expect(urls[0]).toContain('/v8/finance/chart/SOL-USD?range=1mo')
  })

  it('sin adjclose válido → no-encontrado', async () => {
    const f = (async () => ({ status: 404, json: async () => chartVacio } as unknown as Response)) as typeof fetch
    expect(await validarTickerYahoo('ZZZZZ', 'acciones', f)).toBe('no-encontrado')
  })

  it('429/5xx de Yahoo → yahoo-caido (NO se reporta como inexistente)', async () => {
    const f429 = (async () => ({ status: 429, json: async () => ({}) } as unknown as Response)) as typeof fetch
    const f500 = (async () => ({ status: 500, json: async () => ({}) } as unknown as Response)) as typeof fetch
    expect(await validarTickerYahoo('AAPL', 'acciones', f429)).toBe('yahoo-caido')
    expect(await validarTickerYahoo('AAPL', 'acciones', f500)).toBe('yahoo-caido')
  })

  it('error de red → yahoo-caido', async () => {
    const f = (async () => { throw new Error('red') }) as unknown as typeof fetch
    expect(await validarTickerYahoo('AAPL', 'acciones', f)).toBe('yahoo-caido')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { obtenerHistoricos, tickersDelPortfolio, simboloYahoo, _resetCache, type Serie } from './historicos'
import type { Storage, Doc } from './storage'
import type { Portfolio } from './tipos'

function storageMemoria(inicial: Partial<Record<Doc, unknown>> = {}): Storage & { datos: Partial<Record<Doc, unknown>> } {
  const datos: Partial<Record<Doc, unknown>> = { ...inicial }
  return {
    datos,
    async leer(doc) { return datos[doc] ?? null },
    async escribir(doc, valor) { datos[doc] = valor },
  }
}

const pf: Portfolio = {
  monedaBase: 'USD',
  operaciones: [],
  plataformas: [
    {
      nombre: 'A', efectivoUSD: 0, posiciones: [
        { ticker: 'VOO', nombre: 'VOO', tipo: 'acciones', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
        { ticker: 'BTC', nombre: 'BTC', tipo: 'cripto', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
        { ticker: '', nombre: 'Bono', tipo: 'bono', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
      ],
    },
    {
      nombre: 'B', efectivoUSD: 0, posiciones: [
        { ticker: 'VOO', nombre: 'VOO otra vez', tipo: 'acciones', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
      ],
    },
  ],
}

// timestamps: 2024-01-02 y 2024-01-03 UTC
const chartJson = (precios: (number | null)[]) => ({
  chart: {
    result: [{
      timestamp: [1704153600, 1704240000, null],
      indicators: { adjclose: [{ adjclose: [...precios, 99] }], quote: [{ close: [1, 1, 1] }] },
    }],
  },
})

function fetchOk(urls: string[]): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    urls.push(String(url))
    return { json: async () => chartJson([100, null]) } as unknown as Response
  }) as typeof fetch
}

function seriesPersistidas(st: { datos: Partial<Record<Doc, unknown>> }): Record<string, Serie> {
  return (st.datos.historicos as { series: Record<string, Serie> }).series
}

beforeEach(() => _resetCache())

describe('tickersDelPortfolio', () => {
  it('deduplica y excluye bono/efectivo', () => {
    expect(tickersDelPortfolio(pf)).toEqual([
      { ticker: 'VOO', tipo: 'acciones' },
      { ticker: 'BTC', tipo: 'cripto' },
    ])
  })
})

describe('simboloYahoo', () => {
  it('acciones tal cual, cripto con -USD', () => {
    expect(simboloYahoo('VOO', 'acciones')).toBe('VOO')
    expect(simboloYahoo('BTC', 'cripto')).toBe('BTC-USD')
  })
})

describe('obtenerHistoricos', () => {
  it('usa adjclose, filtra nulls y persiste', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    const res = await obtenerHistoricos(pf, [], fetchOk(urls), st)
    expect(urls.some((u) => u.includes('/v8/finance/chart/VOO?range=2y&interval=1d'))).toBe(true)
    expect(urls.some((u) => u.includes('/v8/finance/chart/BTC-USD?range=2y&interval=1d'))).toBe(true)
    // null de precio y null de timestamp filtrados en pares
    expect(res.series.VOO).toEqual({ fechas: ['2024-01-02'], precios: [100] })
    expect(res.desactualizado).toBe(false)
    expect(st.datos.historicos).toMatchObject({ series: { VOO: { precios: [100] } } })
  })

  it('baja también los extraTickers de la watchlist y los persiste', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    const res = await obtenerHistoricos(
      pf,
      [{ ticker: 'PLTR', tipo: 'acciones' }, { ticker: 'SOL', tipo: 'cripto' }],
      fetchOk(urls),
      st
    )
    expect(urls.some((u) => u.includes('/v8/finance/chart/PLTR?range=2y'))).toBe(true)
    expect(urls.some((u) => u.includes('/v8/finance/chart/SOL-USD?range=2y'))).toBe(true)
    expect(Object.keys(res.series).sort()).toEqual(['BTC', 'PLTR', 'SOL', 'VOO'])
    expect(seriesPersistidas(st).PLTR).toBeDefined()
  })

  it('un extraTicker duplicado con la cartera no se pide dos veces', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    await obtenerHistoricos(pf, [{ ticker: 'VOO', tipo: 'acciones' }], fetchOk(urls), st)
    expect(urls.filter((u) => u.includes('/chart/VOO?'))).toHaveLength(1)
  })

  it('ante fallo de red devuelve lo persistido con desactualizado=true', async () => {
    const serie: Serie = { fechas: ['2024-01-02'], precios: [100] }
    const st = storageMemoria({ historicos: { fecha: '2026-07-01', series: { VOO: serie } } })
    const fetchRoto = (async () => { throw new Error('red') }) as unknown as typeof fetch
    const res = await obtenerHistoricos(pf, [], fetchRoto, st)
    expect(res).toEqual({ fecha: '2026-07-01', series: { VOO: serie }, desactualizado: true })
  })

  it('cachea en memoria: segunda llamada con el mismo set no vuelve a pedir', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    const f = fetchOk(urls)
    await obtenerHistoricos(pf, [], f, st)
    const n = urls.length
    await obtenerHistoricos(pf, [], f, st)
    expect(urls.length).toBe(n)
  })

  it('caché inválida al cambiar el set: refetchea SOLO los faltantes', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    const f = fetchOk(urls)
    await obtenerHistoricos(pf, [], f, st) // VOO y BTC
    expect(urls).toHaveLength(2)
    const res = await obtenerHistoricos(pf, [{ ticker: 'PLTR', tipo: 'acciones' }], f, st)
    expect(urls).toHaveLength(3) // solo se pidió PLTR
    expect(urls[2]).toContain('/chart/PLTR?')
    expect(Object.keys(res.series).sort()).toEqual(['BTC', 'PLTR', 'VOO'])
    // mismo set otra vez: no pide nada
    await obtenerHistoricos(pf, [{ ticker: 'PLTR', tipo: 'acciones' }], f, st)
    expect(urls).toHaveLength(3)
  })

  it('quitar un ticker del set poda lo persistido sin refetch', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    const f = fetchOk(urls)
    await obtenerHistoricos(pf, [{ ticker: 'PLTR', tipo: 'acciones' }], f, st)
    expect(urls).toHaveLength(3)
    const res = await obtenerHistoricos(pf, [], f, st)
    expect(urls).toHaveLength(3) // sin requests nuevos
    expect(res.series.PLTR).toBeUndefined()
    expect(seriesPersistidas(st).PLTR).toBeUndefined()
  })

  it('un faltante que falló se reintenta en la llamada siguiente (no queda cacheado como servido)', async () => {
    const st = storageMemoria()
    const urls: string[] = []
    let fallaPLTR = true
    const f = (async (url: RequestInfo | URL) => {
      urls.push(String(url))
      if (String(url).includes('PLTR') && fallaPLTR) throw new Error('yahoo caído')
      return { json: async () => chartJson([100, null]) } as unknown as Response
    }) as typeof fetch
    await obtenerHistoricos(pf, [], f, st) // VOO y BTC
    const res1 = await obtenerHistoricos(pf, [{ ticker: 'PLTR', tipo: 'acciones' }], f, st)
    expect(res1.series.PLTR).toBeUndefined() // falló y queda "sin datos"…
    expect(urls.filter((u) => u.includes('PLTR'))).toHaveLength(1)
    fallaPLTR = false
    const res2 = await obtenerHistoricos(pf, [{ ticker: 'PLTR', tipo: 'acciones' }], f, st)
    expect(urls.filter((u) => u.includes('PLTR'))).toHaveLength(2) // …pero se reintentó
    expect(res2.series.PLTR).toBeDefined()
  })

  it('poda series huérfanas del persistido al escribir', async () => {
    const huerfana: Serie = { fechas: ['2024-01-02'], precios: [1] }
    const st = storageMemoria({ historicos: { fecha: '2026-07-01', series: { ZZZ: huerfana } } })
    const res = await obtenerHistoricos(pf, [], fetchOk([]), st)
    expect(res.series.ZZZ).toBeUndefined()
    expect(seriesPersistidas(st).ZZZ).toBeUndefined()
  })

  it('redondea los precios a 4 decimales al persistir', async () => {
    const st = storageMemoria()
    const f = (async () => ({ json: async () => chartJson([100.123456789012, null]) } as unknown as Response)) as typeof fetch
    const res = await obtenerHistoricos(pf, [], f, st)
    // Math.round(100.123456789012 · 10⁴) / 10⁴ = 100.1235
    expect(res.series.VOO.precios).toEqual([100.1235])
    expect(seriesPersistidas(st).VOO.precios).toEqual([100.1235])
  })

  it('baja en lotes de a 5 en paralelo', async () => {
    let enVuelo = 0
    let maxEnVuelo = 0
    const f = (async () => {
      enVuelo++
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
      await new Promise((r) => setTimeout(r, 5))
      enVuelo--
      return { json: async () => chartJson([100, null]) } as unknown as Response
    }) as typeof fetch
    // 2 de cartera + 10 extra = 12 tickers → lotes de 5, 5 y 2
    const extra = Array.from({ length: 10 }, (_, i) => ({ ticker: `T${i}`, tipo: 'acciones' as const }))
    await obtenerHistoricos(pf, extra, f, storageMemoria())
    expect(maxEnVuelo).toBeGreaterThan(1) // en paralelo…
    expect(maxEnVuelo).toBeLessThanOrEqual(5) // …pero acotado a 5
  })

  it('fusiona con persistido previo en fallo parcial: BTC viejo se conserva, VOO se actualiza', async () => {
    const btcViejo: Serie = { fechas: ['2024-01-01'], precios: [40000] }
    const st = storageMemoria({ historicos: { fecha: '2026-07-25', series: { BTC: btcViejo } } })
    _resetCache()

    const fetchParcial = (async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('BTC-USD')) throw new Error('BTC-USD no disponible')
      return { json: async () => chartJson([100, null]) } as unknown as Response
    }) as typeof fetch

    const res = await obtenerHistoricos(pf, [], fetchParcial, st)

    expect(res.series.VOO).toEqual({ fechas: ['2024-01-02'], precios: [100] })
    expect(res.series.BTC).toEqual(btcViejo)
    expect(res.desactualizado).toBe(false)

    const persistido = seriesPersistidas(st)
    expect(persistido.VOO).toEqual({ fechas: ['2024-01-02'], precios: [100] })
    expect(persistido.BTC).toEqual(btcViejo)
  })
})

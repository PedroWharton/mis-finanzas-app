import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { obtenerPrecios, _resetCache } from './precios'
import { _resetCache as _resetCacheDolar } from './dolar'
import { crearStorageFs } from './storage'
import type { Storage } from './storage'

type FetchMock = typeof fetch & Mock<(url: string) => Promise<Response>>

function mockFetch(fn: (url: string) => Promise<Response>): FetchMock {
  return vi.fn(fn) as unknown as FetchMock
}

function urlsYahoo(f: FetchMock): string[] {
  return f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('yahoo'))
}

function fetchOk(): FetchMock {
  return mockFetch(async (url) => {
    const u = String(url)
    if (u.includes('coingecko')) {
      return new Response(JSON.stringify({
        bitcoin: { usd: 60000, usd_24h_change: 1.5 },
        ethereum: { usd: 2000, usd_24h_change: -3.2 },
        nexo: { usd: 1.2, usd_24h_change: 0 },
      }))
    }
    const t = u.match(/chart\/(\w+)\?/)![1]
    const precio = { VOO: 600, MELI: 1700, VIST: 66, MU: 930 }[t]
    const previo = { VOO: 590, MELI: 1750, VIST: 66, MU: 900 }[t]
    return new Response(
      JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: precio, chartPreviousClose: previo } }] } })
    )
  })
}

function fetchFalla(): FetchMock {
  return mockFetch(async () => { throw new Error('sin red') })
}

function portfolioConAcciones(tickers: string[]) {
  return {
    monedaBase: 'USD',
    plataformas: [
      {
        nombre: 'Broker',
        efectivoUSD: 0,
        posiciones: tickers.map((t) => ({
          ticker: t,
          nombre: t,
          tipo: 'acciones',
          cantidad: 1,
          costoUSD: 100,
          fecha: '2026-01-01',
        })),
      },
    ],
    operaciones: [],
  }
}

let storage: Storage

beforeEach(async () => {
  _resetCache()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'precios-test-'))
  storage = crearStorageFs(dir)
  await storage.escribir('portfolio', portfolioConAcciones(['VOO', 'MELI', 'VIST', 'MU']))
})

describe('obtenerPrecios', () => {
  it('junta yahoo + coingecko con tickers mapeados', async () => {
    const { precios, desactualizado } = await obtenerPrecios(fetchOk(), storage)
    expect(precios.VOO).toBe(600)
    expect(precios.BTC).toBe(60000)
    expect(precios.NEXO).toBe(1.2)
    expect(desactualizado).toBe(false)
  })

  it('deriva los tickers de acciones del portfolio (no lista hardcodeada)', async () => {
    await storage.escribir('portfolio', portfolioConAcciones(['UNH']))
    const f = mockFetch(async (url) => {
      const u = String(url)
      if (u.includes('coingecko')) return new Response(JSON.stringify({}))
      return new Response(
        JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 250, chartPreviousClose: 240 } }] } })
      )
    })
    const { precios } = await obtenerPrecios(f, storage)
    expect(precios.UNH).toBe(250)
    expect(urlsYahoo(f)).toHaveLength(1)
    expect(urlsYahoo(f)[0]).toContain('/chart/UNH')
  })

  it('sin portfolio no consulta yahoo pero sí devuelve precios cripto', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'precios-test-'))
    const storageVacio = crearStorageFs(dir)
    const f = fetchOk()
    const { precios } = await obtenerPrecios(f, storageVacio)
    expect(precios.BTC).toBe(60000)
    expect(precios.VOO).toBeUndefined()
    expect(urlsYahoo(f)).toHaveLength(0)
  })

  it('calcula variaciones % desde yahoo (chartPreviousClose) y coingecko (usd_24h_change)', async () => {
    const { variaciones } = await obtenerPrecios(fetchOk(), storage)
    expect(variaciones.VOO).toBeCloseTo(((600 - 590) / 590) * 100, 5)
    expect(variaciones.MELI).toBeCloseTo(((1700 - 1750) / 1750) * 100, 5)
    expect(variaciones.VIST).toBe(0)
    expect(variaciones.BTC).toBe(1.5)
    expect(variaciones.ETH).toBe(-3.2)
  })

  it('si falta chartPreviousClose no agrega variación para ese ticker', async () => {
    const f = mockFetch(async (url) => {
      const u = String(url)
      if (u.includes('coingecko')) return new Response(JSON.stringify({ bitcoin: { usd: 60000 }, ethereum: { usd: 2000 }, nexo: { usd: 1.2 } }))
      const t = u.match(/chart\/(\w+)\?/)![1]
      return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: { VOO: 600, MELI: 1700, VIST: 66, MU: 930 }[t] } }] } }))
    })
    const { variaciones, precios } = await obtenerPrecios(f, storage)
    expect(precios.VOO).toBe(600)
    expect(variaciones.VOO).toBeUndefined()
  })

  it('persiste variaciones y last-prices las devuelve en el fallback offline', async () => {
    await obtenerPrecios(fetchOk(), storage)
    _resetCache()
    const { variaciones, desactualizado } = await obtenerPrecios(fetchFalla(), storage)
    expect(desactualizado).toBe(true)
    expect(variaciones.BTC).toBe(1.5)
  })

  it('fallback sin datos persistidos devuelve variaciones vacío', async () => {
    const { variaciones } = await obtenerPrecios(fetchFalla(), storage)
    expect(variaciones).toEqual({})
  })

  it('cachea 10 min: segunda llamada no vuelve a fetchear', async () => {
    const f = fetchOk()
    await obtenerPrecios(f, storage)
    const llamadas = f.mock.calls.length
    await obtenerPrecios(f, storage)
    expect(f.mock.calls.length).toBe(llamadas)
  })

  it('marca desactualizado si falta el precio de una acción del portfolio (yahoo parcial)', async () => {
    const f = mockFetch(async (url) => {
      const u = String(url)
      if (u.includes('coingecko')) return new Response(JSON.stringify({ bitcoin: { usd: 60000 } }))
      const t = u.match(/chart\/(\w+)\?/)![1]
      if (t === 'MELI') return new Response(JSON.stringify({ chart: { result: [] } })) // sin dato
      const precio = { VOO: 600, VIST: 66, MU: 930 }[t]
      return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: precio } }] } }))
    })
    const { precios, desactualizado } = await obtenerPrecios(f, storage)
    expect(precios.VOO).toBe(600)
    expect(precios.MELI).toBeUndefined()
    expect(desactualizado).toBe(true)
  })

  it('marca desactualizado si el portfolio tiene una cripto que la app no cotiza', async () => {
    const pf = portfolioConAcciones([])
    pf.plataformas[0].posiciones.push({
      ticker: 'DOGE', nombre: 'DOGE', tipo: 'cripto', cantidad: 10, costoUSD: 100, fecha: '2026-01-01',
    })
    await storage.escribir('portfolio', pf)
    const { desactualizado } = await obtenerPrecios(fetchOk(), storage)
    expect(desactualizado).toBe(true)
  })

  it('los bonos y el efectivo no cuentan como tickers faltantes', async () => {
    const pf = portfolioConAcciones(['VOO'])
    pf.plataformas[0].posiciones.push({
      ticker: '', nombre: 'Bono', tipo: 'bono', cantidad: 1, costoUSD: 1000, fecha: '2026-01-01',
    })
    await storage.escribir('portfolio', pf)
    const { desactualizado } = await obtenerPrecios(fetchOk(), storage)
    expect(desactualizado).toBe(false)
  })

  it('si todo falla devuelve last-prices con desactualizado=true', async () => {
    const { desactualizado, precios } = await obtenerPrecios(fetchFalla(), storage)
    expect(desactualizado).toBe(true)
    expect(typeof precios).toBe('object')
  })
})

describe('tickers de BYMA', () => {
  // Balanz opera la acción local (PAMP), no el ADR. Yahoo la publica como
  // PAMP.BA y en pesos, así que hay que convertirla con el dólar.
  function fetchByma(dolar: number | null): FetchMock {
    return mockFetch(async (url) => {
      const u = String(url)
      if (u.includes('coingecko')) return new Response(JSON.stringify({ bitcoin: { usd: 60000 } }))
      if (u.includes('dolarapi')) {
        if (dolar === null) return new Response('nope', { status: 500 })
        // El cripto cotiza distinto al MEP a propósito: PAMP tiene que salir
        // por el MEP, que es a lo que la valúa el broker.
        if (u.includes('/cripto')) return new Response(JSON.stringify({ venta: 1600 }))
        return new Response(JSON.stringify({ venta: dolar, fechaActualizacion: '2026-09-03' }))
      }
      const t = u.match(/chart\/([\w.]+)\?/)![1]
      if (t === 'YM44O.BA') {
        // Obligación negociable: BYMA la cotiza en pesos por cada 100 nominales.
        return new Response(
          JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 156350, chartPreviousClose: 155000 } }] } })
        )
      }
      if (t !== 'PAMP.BA') throw new Error(`ticker inesperado: ${t}`)
      return new Response(
        JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 5510, chartPreviousClose: 5400 } }] } })
      )
    })
  }

  beforeEach(async () => {
    _resetCacheDolar()
    await storage.escribir('portfolio', portfolioConAcciones(['PAMP']))
  })

  it('cotiza PAMP desde PAMP.BA convirtiendo pesos a dólares al MEP', async () => {
    const { precios, desactualizado } = await obtenerPrecios(fetchByma(1529.5), storage)
    expect(precios.PAMP).toBeCloseTo(5510 / 1529.5, 4)
    expect(desactualizado).toBe(false)
  })

  it('la variación diaria no se distorsiona por la conversión', async () => {
    const { variaciones } = await obtenerPrecios(fetchByma(1529.5), storage)
    expect(variaciones.PAMP).toBeCloseTo(((5510 - 5400) / 5400) * 100, 6)
  })

  it('cotiza la ON YM44O desde YM44O.BA dividiendo por 100 nominales y por el MEP', async () => {
    await storage.escribir('portfolio', portfolioConAcciones(['YM44O']))
    const { precios, variaciones, desactualizado } = await obtenerPrecios(fetchByma(1536), storage)
    expect(precios.YM44O).toBeCloseTo(156350 / 100 / 1536, 6)
    expect(variaciones.YM44O).toBeCloseTo(((156350 - 155000) / 155000) * 100, 6)
    expect(desactualizado).toBe(false)
  })

  it('sin cotización del dólar no inventa precio y queda desactualizado', async () => {
    const { precios, desactualizado } = await obtenerPrecios(fetchByma(null), storage)
    expect(precios.PAMP).toBeUndefined()
    expect(desactualizado).toBe(true)
  })
})

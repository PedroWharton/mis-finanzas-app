import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetCache } from '@/lib/insiders'

const mockStorage = { leer: vi.fn(), escribir: vi.fn() }
vi.mock('@/lib/storage', () => ({ crearStorage: () => mockStorage }))

import { GET } from './route'

const portfolio = {
  monedaBase: 'USD',
  operaciones: [],
  plataformas: [{
    nombre: 'A', efectivoUSD: 0, posiciones: [
      { ticker: 'VOO', nombre: 'VOO', tipo: 'acciones', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
      { ticker: 'BTC', nombre: 'BTC', tipo: 'cripto', cantidad: 1, costoUSD: 1, fecha: '2026-01-01' },
    ],
  }],
}

const HTML = `<table class="tinytable"><tr><th>X</th><th>Filing Date</th><th>Trade Date</th><th>Ticker</th><th>Insider Name</th><th>Title</th><th>Trade Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th></tr>
<tr><td></td><td>2026-08-10 17:00:00</td><td>2026-08-08</td><td><a>VOO</a></td><td><a>A</a></td><td>Dir</td><td>P - Purchase</td><td>$500.00</td><td>+100</td><td>100</td><td>+1%</td><td>+$50,000</td></tr></table>`

beforeEach(() => {
  _resetCache()
  mockStorage.leer.mockReset()
  mockStorage.escribir.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    ;(globalThis as unknown as { urls: string[] }).urls ??= []
    ;(globalThis as unknown as { urls: string[] }).urls.push(String(url))
    return { ok: true, text: async () => HTML } as unknown as Response
  }))
})

describe('GET /api/insiders', () => {
  it('devuelve el resumen por ticker de acciones de cartera ∪ watchlist (sin cripto)', async () => {
    mockStorage.leer.mockImplementation(async (doc: string) => {
      if (doc === 'portfolio') return portfolio
      if (doc === 'watchlist') return { agregados: [{ ticker: 'ETH', tipo: 'cripto' }], ocultos: [] }
      return null
    })
    const r = await GET()
    expect(r.status).toBe(200)
    const body = (await r.json()) as { porTicker: Record<string, { senal: string }>; desactualizado: boolean }
    expect(body.desactualizado).toBe(false)
    expect(body.porTicker.VOO.senal).toBe('compras')
    expect(body.porTicker.AAPL.senal).toBe('neutral') // de la lista curada
    expect(body.porTicker.BTC).toBeUndefined()
    expect(body.porTicker.ETH).toBeUndefined()
  })

  it('sin portfolio responde vacío sin pedir nada', async () => {
    mockStorage.leer.mockResolvedValue(null)
    const r = await GET()
    expect(r.status).toBe(200)
    expect((await r.json()).porTicker).toEqual({})
  })

  it('503 si falla la lectura del portfolio (error real, no "no existe")', async () => {
    mockStorage.leer.mockRejectedValue(new Error('blob caído'))
    expect((await GET()).status).toBe(503)
  })

  it('sin OpenInsider ni persistido responde 200 con porTicker vacío y desactualizado', async () => {
    mockStorage.leer.mockImplementation(async (doc: string) => (doc === 'portfolio' ? portfolio : null))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red') }))
    const r = await GET()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ fecha: '', porTicker: {}, desactualizado: true })
  })
})

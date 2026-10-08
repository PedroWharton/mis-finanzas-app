import { describe, it, expect, vi, beforeEach } from 'vitest'
import { obtenerDolar, obtenerDolarBolsa, _resetCache } from './dolar'

beforeEach(() => _resetCache())

describe('obtenerDolar', () => {
  it('usa el dólar cripto cuando responde', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/cripto')
      return new Response(JSON.stringify({ venta: 1480.5, fechaActualizacion: '2026-08-28T12:00:00Z' }))
    }) as unknown as typeof fetch
    const d = await obtenerDolar(fetchFn)
    expect(d).toEqual({ valor: 1480.5, nombre: 'cripto', fecha: '2026-08-28T12:00:00Z' })
  })

  it('cae al MEP si cripto falla, y null si fallan ambos', async () => {
    const soloMep = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/cripto')
        ? new Response('caído', { status: 500 })
        : new Response(JSON.stringify({ venta: 1450 }))
    ) as unknown as typeof fetch
    const d = await obtenerDolar(soloMep)
    expect(d!.nombre).toBe('MEP')
    expect(d!.valor).toBe(1450)

    _resetCache()
    const roto = vi.fn(async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    expect(await obtenerDolar(roto)).toBeNull()
  })

  it('rechaza cotizaciones inválidas (venta no numérica o <= 0)', async () => {
    const invalido = vi.fn(async () => new Response(JSON.stringify({ venta: -1 }))) as unknown as typeof fetch
    expect(await obtenerDolar(invalido)).toBeNull()
  })

  it('cachea el resultado', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ venta: 1480 }))) as unknown as typeof fetch
    await obtenerDolar(fetchFn)
    await obtenerDolar(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('obtenerDolarBolsa', () => {
  // Las acciones de BYMA se valúan al MEP: es el tipo de cambio implícito
  // entre la especie en pesos y la especie en dólares. El cripto daría otro
  // número y la tenencia no coincidiría con la del broker.
  it('pide el MEP y no el cripto', async () => {
    const pedidas: string[] = []
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      pedidas.push(String(url))
      return new Response(JSON.stringify({ venta: 1529.5, fechaActualizacion: '2026-09-03T12:00:00Z' }))
    }) as unknown as typeof fetch
    const d = await obtenerDolarBolsa(fetchFn)
    expect(d).toEqual({ valor: 1529.5, nombre: 'MEP', fecha: '2026-09-03T12:00:00Z' })
    expect(pedidas.every((u) => u.includes('/bolsa'))).toBe(true)
  })

  it('devuelve null si la fuente falla', async () => {
    const roto = vi.fn(async () => new Response('caído', { status: 500 })) as unknown as typeof fetch
    expect(await obtenerDolarBolsa(roto)).toBeNull()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Portfolio } from '@/lib/tipos'

const mockStorage = { leer: vi.fn(), escribir: vi.fn() }
vi.mock('@/lib/storage', () => ({ crearStorage: () => mockStorage }))

import { POST, GET } from './route'

function pf(): Portfolio {
  return {
    monedaBase: 'USD',
    plataformas: [{ nombre: 'DolarApp', efectivoUSD: 1000, posiciones: [] }],
    operaciones: [{ fecha: '2026-06-18', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 1000 }],
  }
}

function req(metodo: 'GET' | 'POST', opts: { auth?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest('http://localhost/api/agente/movimientos', {
    method: metodo,
    headers: opts.auth ? { authorization: opts.auth } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

const auth = 'Bearer token-de-test'

beforeEach(() => {
  vi.stubEnv('AGENTE_TOKEN', 'token-de-test')
  mockStorage.leer.mockReset()
  mockStorage.escribir.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/agente/movimientos', () => {
  it('401 sin Bearer válido', async () => {
    expect((await POST(req('POST', { body: {} }))).status).toBe(401)
    expect((await POST(req('POST', { auth: 'Bearer otro', body: {} }))).status).toBe(401)
  })
  it('400 con payload inválido y el error nombra el campo', async () => {
    const res = await POST(req('POST', { auth, body: { operaciones: [{ tipo: 'apostar' }] } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('operaciones[0]')
  })
  it('503 si la lectura del portfolio falla (no pisar datos)', async () => {
    mockStorage.leer.mockRejectedValue(new Error('red'))
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 10 }] } }))
    expect(res.status).toBe(503)
    expect(mockStorage.escribir).not.toHaveBeenCalled()
  })
  it('409 con duplicados y no escribe', async () => {
    mockStorage.leer.mockResolvedValue(pf())
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-06-18', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 1000 }] } }))
    expect(res.status).toBe(409)
    expect((await res.json()).duplicados).toHaveLength(1)
    expect(mockStorage.escribir).not.toHaveBeenCalled()
  })
  it('200 aplica, escribe y devuelve resumen', async () => {
    mockStorage.leer.mockResolvedValue(pf())
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 100 }] } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.aplicadas).toBe(1)
    expect(json.plataformas[0]).toEqual({ nombre: 'DolarApp', efectivoUSD: 1100 })
    expect(mockStorage.escribir).toHaveBeenCalledWith('portfolio', expect.objectContaining({ operaciones: expect.any(Array) }))
  })
  it('503 si la escritura del portfolio falla', async () => {
    mockStorage.leer.mockResolvedValue(pf())
    mockStorage.escribir.mockRejectedValue(new Error('red'))
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 100 }] } }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('guardar')
  })
  it('ajusta los snapshots existentes cuando entra un depósito retroactivo', async () => {
    const snaps = [
      { fecha: '2026-08-09', totalUSD: 1000, porPlataforma: { DolarApp: 1000 } },
      { fecha: '2026-08-12', totalUSD: 1010, porPlataforma: { DolarApp: 1010 } },
    ]
    mockStorage.leer.mockImplementation(async (doc: string) => (doc === 'portfolio' ? pf() : snaps))
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-10', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 1500 }] } }))
    expect(res.status).toBe(200)
    expect(mockStorage.escribir).toHaveBeenCalledWith('snapshots', [
      { fecha: '2026-08-09', totalUSD: 1000, porPlataforma: { DolarApp: 1000 } },
      { fecha: '2026-08-12', totalUSD: 2510, porPlataforma: { DolarApp: 2510 } },
    ])
  })

  it('no escribe snapshots si ninguno queda afectado', async () => {
    const snaps = [{ fecha: '2026-08-01', totalUSD: 1000, porPlataforma: { DolarApp: 1000 } }]
    mockStorage.leer.mockImplementation(async (doc: string) => (doc === 'portfolio' ? pf() : snaps))
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-10', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 100 }] } }))
    expect(res.status).toBe(200)
    const escrituras = mockStorage.escribir.mock.calls.map((c) => c[0])
    expect(escrituras).not.toContain('snapshots')
  })

  it('si el ajuste de snapshots falla, el POST igual responde 200 con advertencia', async () => {
    mockStorage.leer.mockImplementation(async (doc: string) => {
      if (doc === 'portfolio') return pf()
      throw new Error('red')
    })
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 100 }] } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.advertencias.join(' ')).toContain('snapshots')
  })

  it('503 si el portfolio es malformado (sin plataformas u operaciones)', async () => {
    mockStorage.leer.mockResolvedValue({})
    const res = await POST(req('POST', { auth, body: { operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 100 }] } }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('malformado')
  })
})

describe('GET /api/agente/movimientos', () => {
  it('401 sin Bearer válido', async () => {
    expect((await GET(req('GET'))).status).toBe(401)
  })
  it('200 con lista vacía si el portfolio no existe (null ≠ error de lectura)', async () => {
    mockStorage.leer.mockResolvedValue(null)
    const res = await GET(req('GET', { auth }))
    expect(res.status).toBe(200)
    expect((await res.json()).operaciones).toEqual([])
  })
  it('200 con las últimas operaciones por fecha', async () => {
    mockStorage.leer.mockResolvedValue(pf())
    const res = await GET(req('GET', { auth }))
    expect((await res.json()).operaciones).toHaveLength(1)
  })
})

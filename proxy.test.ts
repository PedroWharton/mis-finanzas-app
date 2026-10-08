import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://app.test${path}`, { headers })

describe('proxy', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = 'clave'
    process.env.AGENTE_TOKEN = 'secreto-agente'
  })
  afterEach(() => {
    delete process.env.APP_PASSWORD
    delete process.env.AGENTE_TOKEN
  })

  it.each(['/sw.js', '/manifest.json', '/icons/icono-192.png', '/acceso'])(
    'deja pasar la ruta libre %s sin cookie',
    async (path) => {
      const res = await proxy(req(path))
      expect(res.status).toBe(200)
    }
  )

  it('deja pasar /api/agente/datos con Bearer correcto', async () => {
    const res = await proxy(req('/api/agente/datos', { authorization: 'Bearer secreto-agente' }))
    expect(res.status).toBe(200)
  })

  it('rechaza /api/agente/datos con Bearer incorrecto (401)', async () => {
    const res = await proxy(req('/api/agente/datos', { authorization: 'Bearer otro' }))
    expect(res.status).toBe(401)
  })

  it('el Bearer NO abre otras rutas de API (401 sin cookie)', async () => {
    const res = await proxy(req('/api/data', { authorization: 'Bearer secreto-agente' }))
    expect(res.status).toBe(401)
  })

  it('página sin cookie redirige a /acceso', async () => {
    const res = await proxy(req('/recomendaciones'))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.headers.get('location')).toContain('/acceso')
  })

  it('en producción sin APP_PASSWORD cierra todo (503)', async () => {
    delete process.env.APP_PASSWORD
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const res = await proxy(req('/'))
      expect(res.status).toBe(503)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

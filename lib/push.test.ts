import { describe, it, expect, vi } from 'vitest'
import { agregarSuscripcion, enviarATodos, type Suscripcion } from './push'

const sub = (n: number): Suscripcion => ({ endpoint: `https://push/${n}`, keys: { p256dh: 'k', auth: 'a' } })

describe('agregarSuscripcion', () => {
  it('agrega y dedupea por endpoint', () => {
    let doc = agregarSuscripcion(null, sub(1))
    doc = agregarSuscripcion(doc, sub(1))
    doc = agregarSuscripcion(doc, sub(2))
    expect(doc.subs).toHaveLength(2)
  })
})

describe('enviarATodos', () => {
  it('cuenta enviados y detecta vencidas (410/404) sin cortar el resto', async () => {
    const enviar = vi.fn(async (s: Suscripcion) => {
      if (s.endpoint.endsWith('/2')) throw { statusCode: 410 }
      if (s.endpoint.endsWith('/3')) throw new Error('red caída')
    })
    const r = await enviarATodos([sub(1), sub(2), sub(3)], 'hola', enviar)
    expect(r.enviados).toBe(1)
    expect(r.vencidas.map((s) => s.endpoint)).toEqual(['https://push/2'])
  })
})

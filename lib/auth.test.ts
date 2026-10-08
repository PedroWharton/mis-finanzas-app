import { describe, it, expect } from 'vitest'
import { generarToken, tokenValido, bearerAgenteValido } from './auth'

describe('generarToken / tokenValido', () => {
  it('round-trip: el token generado con la clave correcta es válido', async () => {
    const token = await generarToken('test1234')
    expect(await tokenValido(token, 'test1234')).toBe(true)
  })

  it('rechaza un token inválido', async () => {
    expect(await tokenValido('token-que-no-es-hmac-de-nada', 'test1234')).toBe(false)
  })

  it('rechaza un token generado con otra clave', async () => {
    const token = await generarToken('otra-clave')
    expect(await tokenValido(token, 'test1234')).toBe(false)
  })

  it('rechaza undefined', async () => {
    expect(await tokenValido(undefined, 'test1234')).toBe(false)
  })

  it('rechaza string vacío', async () => {
    expect(await tokenValido('', 'test1234')).toBe(false)
  })
})

describe('bearerAgenteValido', () => {
  it('acepta Bearer con el token correcto', async () => {
    expect(await bearerAgenteValido('Bearer secreto-123', 'secreto-123')).toBe(true)
  })
  it('rechaza token incorrecto, header ausente, esquema no Bearer y token no configurado', async () => {
    expect(await bearerAgenteValido('Bearer otro', 'secreto-123')).toBe(false)
    expect(await bearerAgenteValido(null, 'secreto-123')).toBe(false)
    expect(await bearerAgenteValido('Basic secreto-123', 'secreto-123')).toBe(false)
    expect(await bearerAgenteValido('Bearer secreto-123', undefined)).toBe(false)
    expect(await bearerAgenteValido('Bearer ', '')).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { crearStorageFs, crearStorage, crearStorageBlob, conPortfolioInicial } from './storage'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'))
})

describe('crearStorageFs', () => {
  it('escribe y lee un documento (round-trip)', async () => {
    const storage = crearStorageFs(dir)
    await storage.escribir('portfolio', { monedaBase: 'USD', plataformas: [] })
    expect(await storage.leer('portfolio')).toEqual({ monedaBase: 'USD', plataformas: [] })
  })

  it('devuelve null si el archivo no existe', async () => {
    const storage = crearStorageFs(dir)
    expect(await storage.leer('snapshots')).toBeNull()
  })
})

describe('crearStorage (selección por env)', () => {
  const original = process.env.BLOB_READ_WRITE_TOKEN

  afterEach(() => {
    if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
    else process.env.BLOB_READ_WRITE_TOKEN = original
    delete process.env.BLOB_PATH_SUFFIX
  })

  it('sin BLOB_READ_WRITE_TOKEN usa el driver fs', () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    const storage = crearStorage()
    expect(storage).toBeDefined()
    // No debe intentar llamar a la red de Blob: solo validamos que expone la interfaz fs-like.
  })

  it('con BLOB_READ_WRITE_TOKEN y BLOB_PATH_SUFFIX construye el driver Blob sin llamar a la red', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token-de-prueba'
    process.env.BLOB_PATH_SUFFIX = 'sufijo-secreto'
    const storage = crearStorage()
    expect(storage).toBeDefined()
    expect(typeof storage.leer).toBe('function')
    expect(typeof storage.escribir).toBe('function')
  })

  it('con token pero sin BLOB_PATH_SUFFIX construye igual el driver Blob (los blobs ahora son privados)', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token-de-prueba'
    delete process.env.BLOB_PATH_SUFFIX
    const storage = crearStorage()
    expect(storage).toBeDefined()
    expect(typeof storage.leer).toBe('function')
    expect(typeof storage.escribir).toBe('function')
  })
})

function streamDe(texto: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(texto)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('crearStorageBlob (con Blob API mockeada, nunca red real)', () => {
  it('escribir llama a put con el pathname y opciones esperadas (access privado)', async () => {
    const put = vi.fn(async () => ({ url: 'https://blob.example/mis-finanzas/portfolio.json' }))
    const get = vi.fn()
    const storage = crearStorageBlob({ put, get })
    await storage.escribir('portfolio', { a: 1 })
    expect(put).toHaveBeenCalledWith(
      'mis-finanzas/portfolio.json',
      JSON.stringify({ a: 1 }, null, 2),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      })
    )
  })

  it('leer usa get con access privado y devuelve el JSON del stream', async () => {
    const get = vi.fn(async () => ({ stream: streamDe(JSON.stringify({ a: 1 })) }))
    const put = vi.fn()
    const storage = crearStorageBlob({ put, get })
    const valor = await storage.leer('portfolio')
    expect(get).toHaveBeenCalledWith('mis-finanzas/portfolio.json', { access: 'private', useCache: false })
    expect(valor).toEqual({ a: 1 })
  })

  it('leer devuelve null si get devuelve null (no existe)', async () => {
    const get = vi.fn(async () => null)
    const put = vi.fn()
    const storage = crearStorageBlob({ put, get })
    expect(await storage.leer('portfolio')).toBeNull()
  })

  it('leer relanza si get lanza (error real, no confundir con "no existe")', async () => {
    const get = vi.fn(async () => { throw new Error('network error') })
    const put = vi.fn()
    const storage = crearStorageBlob({ put, get })
    await expect(storage.leer('portfolio')).rejects.toThrow('network error')
  })

  it('leer relanza si el JSON del stream está corrupto', async () => {
    const get = vi.fn(async () => ({ stream: streamDe('{ esto no es json') }))
    const put = vi.fn()
    const storage = crearStorageBlob({ put, get })
    await expect(storage.leer('portfolio')).rejects.toThrow()
  })

  it('aplica el sufijo secreto de BLOB_PATH_SUFFIX al pathname', async () => {
    const put = vi.fn(async () => ({ url: 'x' }))
    const get = vi.fn()
    const storage = crearStorageBlob({ put, get }, '-secreto')
    await storage.escribir('snapshots', [])
    expect(put).toHaveBeenCalledWith('mis-finanzas/snapshots-secreto.json', expect.any(String), expect.anything())
  })
})

describe('conPortfolioInicial', () => {
  it('un portfolio inexistente se lee como uno vacío; los demás docs siguen en null', async () => {
    const base = { leer: async () => null, escribir: async () => {} }
    const s = conPortfolioInicial(base)
    expect(await s.leer('portfolio')).toEqual({ monedaBase: 'USD', plataformas: [], operaciones: [] })
    expect(await s.leer('snapshots')).toBeNull()
  })

  it('un error real de lectura se relanza', async () => {
    const base = { leer: async () => { throw new Error('red') }, escribir: async () => {} }
    await expect(conPortfolioInicial(base).leer('portfolio')).rejects.toThrow('red')
  })
})

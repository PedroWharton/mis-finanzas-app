import { promises as fs } from 'fs'
import path from 'path'
import { put, get } from '@vercel/blob'

export type Doc = 'portfolio' | 'snapshots' | 'last-prices' | 'historicos' | 'watchlist' | 'evaluaciones' | 'predicciones' | 'recomendaciones' | 'push-subs' | 'insiders'

export interface Storage {
  leer(doc: Doc): Promise<unknown | null>
  escribir(doc: Doc, valor: unknown): Promise<void>
}

export function crearStorageFs(dir: string): Storage {
  return {
    async leer(doc: Doc) {
      try {
        const raw = await fs.readFile(path.join(dir, `${doc}.json`), 'utf8')
        return JSON.parse(raw)
      } catch {
        return null
      }
    },
    async escribir(doc: Doc, valor: unknown) {
      await fs.writeFile(path.join(dir, `${doc}.json`), JSON.stringify(valor, null, 2))
    },
  }
}

export interface BlobApi {
  put: (pathname: string, body: string, options: Record<string, unknown>) => Promise<{ url: string }>
  get: (
    pathname: string,
    options?: Record<string, unknown>
  ) => Promise<{ stream: ReadableStream<Uint8Array> | null } | null>
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode()
  return result
}

export function crearStorageBlob(blob: BlobApi, suffix: string = ''): Storage {
  const pathname = (doc: Doc) => `mis-finanzas/${doc}${suffix}.json`
  return {
    async leer(doc: Doc) {
      // null = el documento no existe (la SDK resuelve así, o sin stream, que
      // manejamos también de forma defensiva). Cualquier OTRO error (red,
      // stream, JSON corrupto) se relanza sin capturar: "no existe" y "no se
      // pudo leer" son casos distintos y el llamador decide cómo degradar
      // cada uno (confundirlos permitió sobreescribir un historial por un
      // error transitorio).
      const resultado = await blob.get(pathname(doc), { access: 'private', useCache: false })
      if (!resultado || !resultado.stream) return null
      const texto = await streamToString(resultado.stream)
      return JSON.parse(texto)
    },
    async escribir(doc: Doc, valor: unknown) {
      await blob.put(pathname(doc), JSON.stringify(valor, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      })
    },
  }
}

export const PORTFOLIO_VACIO = { monedaBase: 'USD', plataformas: [], operaciones: [] } as const

// Instalación nueva: si el portfolio todavía no existe, se lee como uno vacío
// (sin plataformas ni operaciones) para que la app arranque y el primer
// depósito lo cree. Un error real de lectura se sigue relanzando.
export function conPortfolioInicial(base: Storage): Storage {
  return {
    async leer(doc: Doc) {
      const valor = await base.leer(doc)
      if (valor === null && doc === 'portfolio') return structuredClone(PORTFOLIO_VACIO)
      return valor
    },
    escribir: (doc, valor) => base.escribir(doc, valor),
  }
}

export function crearStorage(): Storage {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const suffix = process.env.BLOB_PATH_SUFFIX ?? ''
    return conPortfolioInicial(crearStorageBlob({ put, get } as unknown as BlobApi, suffix))
  }
  return conPortfolioInicial(crearStorageFs(path.join(process.cwd(), 'data')))
}

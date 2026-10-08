// Baja los documentos del Blob de producción a data/ para trabajar en el
// repo con datos al día. Uso: npm run bajar-datos (lee BLOB_READ_WRITE_TOKEN
// de .env.local). push-subs se omite a propósito: es estado del servidor.
import path from 'node:path'
import { put, get } from '@vercel/blob'
import { crearStorageBlob, crearStorageFs, type BlobApi, type Doc } from '../lib/storage'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Falta BLOB_READ_WRITE_TOKEN (correr con --env-file=.env.local)')
  process.exit(1)
}

const DOCS: Doc[] = ['portfolio', 'snapshots', 'last-prices', 'historicos', 'watchlist', 'evaluaciones', 'predicciones', 'recomendaciones']

const blob = crearStorageBlob({ put, get } as unknown as BlobApi, process.env.BLOB_PATH_SUFFIX ?? '')
const fs = crearStorageFs(path.join(process.cwd(), 'data'))

for (const doc of DOCS) {
  try {
    const valor = await blob.leer(doc)
    if (valor === null) {
      console.log(`- ${doc}: no existe en el Blob, se omite`)
      continue
    }
    await fs.escribir(doc, valor)
    console.log(`✓ ${doc}`)
  } catch (e) {
    console.error(`✗ ${doc}: falló la lectura (${e instanceof Error ? e.message : e})`)
    process.exitCode = 1
  }
}
console.log('Listo: data/ sincronizado desde el Blob.')

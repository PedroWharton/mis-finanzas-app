import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage, type Storage } from '@/lib/storage'
import { tickersDelPortfolio } from '@/lib/historicos'
import {
  LISTA_CURADA,
  agregarTicker,
  normalizarTicker,
  quitarTicker,
  universoEfectivo,
  validarTickerYahoo,
  type WatchlistDoc,
} from '@/lib/watchlist'
import type { Portfolio } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

async function leerDoc(storage: Storage): Promise<WatchlistDoc> {
  const raw = (await storage.leer('watchlist')) as Partial<WatchlistDoc> | null
  return { agregados: raw?.agregados ?? [], ocultos: raw?.ocultos ?? [] }
}

async function respuesta(storage: Storage, doc: WatchlistDoc) {
  const portfolio = (await storage.leer('portfolio')) as Portfolio | null
  const cartera = portfolio ? tickersDelPortfolio(portfolio).map((t) => t.ticker) : []
  return NextResponse.json({
    curada: LISTA_CURADA,
    agregados: doc.agregados,
    ocultos: doc.ocultos,
    efectivos: universoEfectivo(doc, cartera),
  })
}

export async function GET() {
  const storage = crearStorage()
  try {
    return await respuesta(storage, await leerDoc(storage))
  } catch {
    // Error real de lectura (no "no existe"): no degradar a doc vacío.
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ticker?: unknown; tipo?: unknown } | null
  const crudo = typeof body?.ticker === 'string' ? body.ticker.trim() : ''
  const tipo = body?.tipo === 'cripto' || body?.tipo === 'acciones' ? body.tipo : null
  if (!crudo || !tipo) return NextResponse.json({ error: 'ticker y tipo requeridos' }, { status: 400 })
  const ticker = normalizarTicker(crudo, tipo)
  if (tipo === 'acciones' && ticker.endsWith('-USD')) {
    return NextResponse.json({ error: 'un ticker -USD es cripto: elegí tipo cripto y sin sufijo' }, { status: 400 })
  }
  if (ticker === 'BONO' || ticker === 'EFECTIVO') {
    return NextResponse.json({ error: 'BONO y EFECTIVO son claves reservadas de la cartera' }, { status: 400 })
  }
  // Validar contra Yahoo ANTES de tocar el doc: un ticker inexistente nunca
  // entra a la watchlist.
  const validacion = await validarTickerYahoo(ticker, tipo)
  if (validacion === 'no-encontrado') return NextResponse.json({ error: 'ticker no encontrado' }, { status: 404 })
  if (validacion === 'yahoo-caido') {
    return NextResponse.json({ error: 'Yahoo no disponible, probá más tarde' }, { status: 502 })
  }
  const storage = crearStorage()
  let doc: WatchlistDoc
  try {
    doc = await leerDoc(storage)
  } catch {
    // Error real de lectura: CORTA la operación en vez de degradar a doc
    // vacío, que pisaría agregados/ocultos existentes al reescribir.
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
  const r = agregarTicker(doc, ticker, tipo)
  if (!r.ok) {
    // Inalcanzable tras los chequeos de arriba (misma normalización); defensivo.
    const mensaje =
      r.error === 'reservado'
        ? 'BONO y EFECTIVO son claves reservadas de la cartera'
        : 'un ticker -USD es cripto: elegí tipo cripto y sin sufijo'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
  await storage.escribir('watchlist', r.doc)
  try {
    return await respuesta(storage, r.doc)
  } catch {
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ticker?: unknown } | null
  const crudo = typeof body?.ticker === 'string' ? body.ticker.trim() : ''
  if (!crudo) return NextResponse.json({ error: 'ticker requerido' }, { status: 400 })
  const storage = crearStorage()
  let doc: WatchlistDoc
  try {
    doc = await leerDoc(storage)
  } catch {
    // Error real de lectura: CORTA la operación en vez de degradar a doc
    // vacío, que pisaría agregados/ocultos existentes al reescribir.
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
  const r = quitarTicker(doc, crudo)
  if (!r.ok) return NextResponse.json({ error: 'ticker desconocido' }, { status: 404 })
  await storage.escribir('watchlist', r.doc)
  try {
    return await respuesta(storage, r.doc)
  } catch {
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
}

import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { obtenerHistoricos, tickersDelPortfolio } from '@/lib/historicos'
import { universoEfectivo, type WatchlistDoc } from '@/lib/watchlist'
import type { Portfolio } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

export async function GET() {
  const storage = crearStorage()
  let portfolio: Portfolio | null
  try {
    portfolio = (await storage.leer('portfolio')) as Portfolio | null
  } catch {
    // Error real de lectura (no "no existe"): no degradar a "sin portfolio".
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
  if (!portfolio) return NextResponse.json({ fecha: '', series: {}, desactualizado: true })
  let raw: Partial<WatchlistDoc> | null
  try {
    raw = (await storage.leer('watchlist')) as Partial<WatchlistDoc> | null
  } catch {
    return NextResponse.json({ error: 'no se pudo leer la watchlist' }, { status: 503 })
  }
  const doc: WatchlistDoc = { agregados: raw?.agregados ?? [], ocultos: raw?.ocultos ?? [] }
  const extra = universoEfectivo(doc, tickersDelPortfolio(portfolio).map((t) => t.ticker))
  // `obtenerHistoricos` maneja sus propios errores de lectura de 'historicos'
  // con degradación deliberada (desactualizado: true); no hace falta duplicarlo acá.
  return NextResponse.json(await obtenerHistoricos(portfolio, extra, fetch, storage))
}

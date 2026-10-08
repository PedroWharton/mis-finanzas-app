import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { obtenerInsiders } from '@/lib/insiders'
import { tickersDelPortfolio } from '@/lib/historicos'
import { universoEfectivo, type WatchlistDoc } from '@/lib/watchlist'
import type { Portfolio } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

// Resumen de insiders (Form 4) para /evaluacion: mismo universo y misma
// función que el contexto del agente, así el veredicto que ve el usuario en
// la app coincide con el que registra el cron y el que lee el agente.
export async function GET() {
  const storage = crearStorage()
  let portfolio: Portfolio | null
  let raw: Partial<WatchlistDoc> | null
  try {
    portfolio = (await storage.leer('portfolio')) as Portfolio | null
    raw = (await storage.leer('watchlist')) as Partial<WatchlistDoc> | null
  } catch {
    // Error real de lectura (no "no existe"): no degradar a "sin portfolio".
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
  if (!portfolio) return NextResponse.json({ fecha: '', porTicker: {}, desactualizado: true })

  const enCartera = tickersDelPortfolio(portfolio)
  const doc: WatchlistDoc = { agregados: raw?.agregados ?? [], ocultos: raw?.ocultos ?? [] }
  const watchlist = universoEfectivo(doc, enCartera.map((t) => t.ticker))
  const tickers = [...enCartera, ...watchlist].filter((t) => t.tipo === 'acciones').map((t) => t.ticker)

  const res = await obtenerInsiders(tickers, fetch, storage)
  return NextResponse.json(res ?? { fecha: '', porTicker: {}, desactualizado: true })
}

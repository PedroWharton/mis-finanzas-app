import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const storage = crearStorage()
  try {
    const portfolio = await storage.leer('portfolio')
    const snapshots = (await storage.leer('snapshots')) ?? []
    return NextResponse.json({ portfolio, snapshots })
  } catch {
    // Error real de lectura (no "no existe"): no degradar a portfolio/snapshots
    // vacíos, que mentiría mostrando la cartera en cero.
    return NextResponse.json({ error: 'no se pudo leer los datos' }, { status: 503 })
  }
}

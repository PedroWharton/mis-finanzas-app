import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'
import type { RecomendacionesDoc } from '@/lib/recomendaciones'
import { seguirRecomendacion, type Seguimiento } from '@/lib/seguimientoRecomendaciones'
import type { Portfolio, Precios } from '@/lib/tipos'
import type { Serie } from '@/lib/historicos'

export const dynamic = 'force-dynamic'

// Enriquece cada recomendación con su seguimiento (qué pasó con el precio
// desde la corrida). Best-effort: si precios/históricos/portfolio no se
// pueden leer, el doc viaja igual sin seguimiento — la página funciona.
async function conSeguimiento(doc: RecomendacionesDoc): Promise<RecomendacionesDoc> {
  const storage = crearStorage()
  let precios: Precios = {}
  let series: Record<string, Serie> = {}
  let operaciones: Portfolio['operaciones'] = []
  try {
    const lp = (await storage.leer('last-prices')) as { precios?: Precios } | null
    precios = lp?.precios ?? {}
    const h = (await storage.leer('historicos')) as { series?: Record<string, Serie> } | null
    series = h?.series ?? {}
    const pf = (await storage.leer('portfolio')) as Portfolio | null
    operaciones = pf?.operaciones ?? []
  } catch {
    return doc
  }
  return {
    corridas: doc.corridas.map((c) => ({
      ...c,
      recomendaciones: c.recomendaciones.map((r) => {
        const seguimiento = seguirRecomendacion(r, c.fecha, precios, series, operaciones)
        return seguimiento ? { ...r, seguimiento } : r
      }),
    })),
  }
}

export type RecomendacionConSeguimiento = { seguimiento?: Seguimiento }

export async function GET() {
  try {
    const doc = (await crearStorage().leer('recomendaciones')) as RecomendacionesDoc | null
    if (!doc || !Array.isArray(doc.corridas)) return NextResponse.json(doc ?? null)
    return NextResponse.json(await conSeguimiento(doc))
  } catch {
    // Igual que en /api/evaluaciones: un error real de lectura no puede
    // confundirse con "todavía no corrió" (200 null), o la página mostraría
    // el estado vacío como si el agente nunca hubiera corrido.
    return NextResponse.json({ error: 'no se pudo leer las recomendaciones' }, { status: 503 })
  }
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { eliminarPlataforma } from '@/lib/movimientos'
import { quitarPlataformaDeSnapshots } from '@/lib/snapshots'
import type { Portfolio, Snapshot } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

// Baja completa de una plataforma: sale de `plataformas`, se borran sus
// operaciones y se reescribe el historial de snapshots como si nunca hubiera
// existido (sin esto, el hero mostraría una "pérdida" falsa del tamaño de la
// plataforma). Es la cirugía que antes había que hacer a mano sobre el blob.
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { nombre?: unknown } | null
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'se espera { nombre }' }, { status: 400 })

  const storage = crearStorage()
  let pf: Portfolio | null
  try {
    pf = (await storage.leer('portfolio')) as Portfolio | null
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
  if (!pf || !Array.isArray(pf.plataformas) || !Array.isArray(pf.operaciones)) {
    return NextResponse.json({ error: 'portfolio no encontrado' }, { status: 503 })
  }

  const r = eliminarPlataforma(pf, nombre)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 })

  try {
    await storage.escribir('portfolio', r.portfolio)
  } catch {
    return NextResponse.json({ error: 'no se pudo guardar el portfolio' }, { status: 503 })
  }

  // Limpieza de snapshots: best-effort DESPUÉS de persistir el portfolio.
  const advertencias: string[] = []
  let snapshotsAjustados = 0
  try {
    const existentes = ((await storage.leer('snapshots')) as Snapshot[] | null) ?? []
    const limpio = quitarPlataformaDeSnapshots(existentes, nombre)
    if (limpio.ajustados > 0) await storage.escribir('snapshots', limpio.snapshots)
    snapshotsAjustados = limpio.ajustados
  } catch {
    advertencias.push('no se pudieron limpiar los snapshots: la evolución puede mostrar una caída falsa')
  }

  return NextResponse.json({
    ok: true,
    operacionesEliminadas: r.operacionesEliminadas,
    snapshotsAjustados,
    advertencias,
  })
}

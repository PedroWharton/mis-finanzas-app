import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { validarMovimientos, aplicarMovimientos } from '@/lib/movimientos'
import { ajustarSnapshotsPorAportes } from '@/lib/snapshots'
import type { Portfolio, Snapshot } from '@/lib/tipos'

// Alta de un batch de operaciones: la comparten el POST del agente (Bearer)
// y el formulario de la página Movimientos (cookie). La auth la resuelve
// cada ruta antes de llamar acá.
export async function registrarMovimientos(body: unknown): Promise<NextResponse> {
  const v = validarMovimientos(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const storage = crearStorage()
  let pf: Portfolio | null
  try {
    pf = (await storage.leer('portfolio')) as Portfolio | null
  } catch {
    // Error real de lectura ≠ "no existe": no pisar el portfolio (patrón del repo).
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
  if (!pf) return NextResponse.json({ error: 'portfolio no encontrado' }, { status: 503 })

  // Guard de portfolio malformado antes de aplicar
  if (!Array.isArray(pf.plataformas) || !Array.isArray(pf.operaciones)) {
    return NextResponse.json({ error: 'portfolio malformado' }, { status: 503 })
  }

  const r = aplicarMovimientos(pf, v.operaciones)
  if (!r.ok) {
    if (r.codigo === 'duplicado')
      return NextResponse.json({ error: 'operaciones duplicadas', duplicados: r.duplicados }, { status: 409 })
    return NextResponse.json({ error: r.error }, { status: 400 })
  }

  try {
    await storage.escribir('portfolio', r.portfolio)
  } catch {
    return NextResponse.json({ error: 'no se pudo guardar el portfolio' }, { status: 503 })
  }

  // Los snapshots ya guardados se calcularon sin estas operaciones: un
  // depósito/retiro con fecha pasada los deja mintiendo. Ajuste best-effort:
  // el portfolio ya quedó persistido, así que un fallo acá no es un 503.
  const advertencias = [...r.advertencias]
  try {
    const existentes = ((await storage.leer('snapshots')) as Snapshot[] | null) ?? []
    const { snapshots, ajustados } = ajustarSnapshotsPorAportes(existentes, v.operaciones)
    if (ajustados > 0) await storage.escribir('snapshots', snapshots)
  } catch {
    advertencias.push('no se pudieron ajustar los snapshots históricos: la curva de evolución puede subestimar los días previos a esta carga')
  }

  return NextResponse.json({
    ok: true,
    aplicadas: r.resumen.length,
    resumen: r.resumen,
    advertencias,
    plataformas: r.portfolio.plataformas.map((p) => ({ nombre: p.nombre, efectivoUSD: p.efectivoUSD })),
  })
}

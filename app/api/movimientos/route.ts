import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { registrarMovimientos } from '@/lib/registrarMovimientos'
import { aplicarMovimientos, eliminarOperacion, validarMovimientos } from '@/lib/movimientos'
import { ajustarSnapshotsPorAportes } from '@/lib/snapshots'
import type { Operacion, Portfolio, Snapshot } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

// Gestión de movimientos desde la app (sesión de navegador vía proxy; el
// agente usa /api/agente/movimientos). DELETE deshace una operación con su
// inverso exacto; PUT la reemplaza (deshacer + aplicar la nueva) en una sola
// escritura, así no queda un estado intermedio persistido.

// La operación a eliminar llega completa y se matchea con el mismo criterio
// que el chequeo de duplicados: si no hay match exacto, 404.
function validarObjetivo(x: unknown): Operacion | null {
  const v = validarMovimientos({ operaciones: [x] })
  return v.ok ? v.operaciones[0] : null
}

async function leerPortfolio(): Promise<{ pf: Portfolio } | { error: NextResponse }> {
  const storage = crearStorage()
  let pf: Portfolio | null
  try {
    pf = (await storage.leer('portfolio')) as Portfolio | null
  } catch {
    return { error: NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 }) }
  }
  if (!pf || !Array.isArray(pf.plataformas) || !Array.isArray(pf.operaciones)) {
    return { error: NextResponse.json({ error: 'portfolio no encontrado' }, { status: 503 }) }
  }
  return { pf }
}

// Un depósito/retiro que entra o sale del historial deja los snapshots
// viejos mintiendo: se ajustan con la operación (o su inversa). Best-effort,
// mismo patrón que el POST del agente.
async function ajustarSnapshots(ops: Operacion[], advertencias: string[]): Promise<void> {
  const storage = crearStorage()
  try {
    const existentes = ((await storage.leer('snapshots')) as Snapshot[] | null) ?? []
    const { snapshots, ajustados } = ajustarSnapshotsPorAportes(existentes, ops)
    if (ajustados > 0) await storage.escribir('snapshots', snapshots)
  } catch {
    advertencias.push('no se pudieron ajustar los snapshots históricos')
  }
}

function inversa(op: Operacion): Operacion | null {
  if (op.tipo === 'deposito') return { ...op, tipo: 'retiro' }
  if (op.tipo === 'retiro') return { ...op, tipo: 'deposito' }
  return null
}

// Alta manual desde la página Movimientos (la cookie la valida el proxy).
export async function POST(req: NextRequest) {
  return registrarMovimientos(await req.json().catch(() => null))
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { operacion?: unknown } | null
  const objetivo = body ? validarObjetivo(body.operacion) : null
  if (!objetivo) return NextResponse.json({ error: 'se espera { operacion: {...} } válida' }, { status: 400 })

  const lectura = await leerPortfolio()
  if ('error' in lectura) return lectura.error

  const r = eliminarOperacion(lectura.pf, objetivo)
  if (!r.ok) {
    const status = r.error.includes('no se encontró') ? 404 : 409
    return NextResponse.json({ error: r.error }, { status })
  }

  try {
    await crearStorage().escribir('portfolio', r.portfolio)
  } catch {
    return NextResponse.json({ error: 'no se pudo guardar el portfolio' }, { status: 503 })
  }

  const advertencias: string[] = []
  const inv = inversa(r.eliminada)
  if (inv) await ajustarSnapshots([inv], advertencias)

  return NextResponse.json({ ok: true, advertencias })
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { original?: unknown; nueva?: unknown } | null
  const original = body ? validarObjetivo(body.original) : null
  const vNueva = body ? validarMovimientos({ operaciones: [body.nueva] }) : null
  if (!original || !vNueva) return NextResponse.json({ error: 'se espera { original, nueva }' }, { status: 400 })
  if (!vNueva.ok) return NextResponse.json({ error: vNueva.error }, { status: 400 })

  const lectura = await leerPortfolio()
  if ('error' in lectura) return lectura.error

  const sinOriginal = eliminarOperacion(lectura.pf, original)
  if (!sinOriginal.ok) {
    const status = sinOriginal.error.includes('no se encontró') ? 404 : 409
    return NextResponse.json({ error: sinOriginal.error }, { status })
  }

  const conNueva = aplicarMovimientos(sinOriginal.portfolio, vNueva.operaciones)
  if (!conNueva.ok) {
    if (conNueva.codigo === 'duplicado')
      return NextResponse.json({ error: 'la operación nueva duplica una existente', duplicados: conNueva.duplicados }, { status: 409 })
    return NextResponse.json({ error: conNueva.error }, { status: 400 })
  }

  try {
    await crearStorage().escribir('portfolio', conNueva.portfolio)
  } catch {
    return NextResponse.json({ error: 'no se pudo guardar el portfolio' }, { status: 503 })
  }

  const advertencias = [...conNueva.advertencias]
  const ajustes: Operacion[] = []
  const inv = inversa(sinOriginal.eliminada)
  if (inv) ajustes.push(inv)
  const nueva = vNueva.operaciones[0]
  if (nueva.tipo === 'deposito' || nueva.tipo === 'retiro') ajustes.push(nueva)
  if (ajustes.length > 0) await ajustarSnapshots(ajustes, advertencias)

  return NextResponse.json({ ok: true, resumen: conNueva.resumen, advertencias })
}

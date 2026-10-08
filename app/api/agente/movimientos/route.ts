import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { bearerAgenteValido } from '@/lib/auth'
import { registrarMovimientos } from '@/lib/registrarMovimientos'
import type { Portfolio } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

// GET: últimas operaciones registradas (por fecha), para que el agente
// descarte las ya cargadas antes de postear. La barrera definitiva contra
// duplicados es el chequeo del POST contra todo el historial.
export async function GET(req: NextRequest) {
  const ok = await bearerAgenteValido(req.headers.get('authorization'), process.env.AGENTE_TOKEN)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const pf = (await crearStorage().leer('portfolio')) as Portfolio | null
    // null = no existe (distinto de error de lectura, que sí es 503).
    const ordenadas = [...(pf?.operaciones ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
    return NextResponse.json({ operaciones: ordenadas.slice(-30) })
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const ok = await bearerAgenteValido(req.headers.get('authorization'), process.env.AGENTE_TOKEN)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return registrarMovimientos(await req.json().catch(() => null))
}

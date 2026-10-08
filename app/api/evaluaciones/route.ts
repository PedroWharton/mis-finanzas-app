import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json((await crearStorage().leer('evaluaciones')) ?? null)
  } catch {
    // Mismo riesgo que en /api/predicciones: un error real de lectura no
    // puede confundirse con "no existe" (200 null), o el POST siguiente
    // pisaría el historial de veredictos existente.
    return NextResponse.json({ error: 'no se pudo leer el registro' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { fecha?: unknown; veredictos?: unknown } | null
  if (!body || typeof body.fecha !== 'string' || typeof body.veredictos !== 'object' || body.veredictos === null) {
    return NextResponse.json({ error: 'se espera { fecha, veredictos }' }, { status: 400 })
  }
  await crearStorage().escribir('evaluaciones', { fecha: body.fecha, veredictos: body.veredictos })
  return NextResponse.json({ ok: true })
}

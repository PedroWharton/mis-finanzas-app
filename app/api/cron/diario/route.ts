import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { compararTimingSafe } from '@/lib/auth'
import { correrCronDiario } from '@/lib/cronDiario'

export const dynamic = 'force-dynamic'
// Precios + históricos + push pueden superar los 60 s en frío.
export const maxDuration = 300

// El cron de Vercel manda `Authorization: Bearer ${CRON_SECRET}`. Sin
// CRON_SECRET configurado la ruta siempre rechaza (opt-in explícito, mismo
// criterio que AGENTE_TOKEN). El proxy también valida; esto es defensa doble.
async function autorizado(req: NextRequest): Promise<boolean> {
  const secreto = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secreto || !header?.startsWith('Bearer ')) return false
  return compararTimingSafe(header.slice('Bearer '.length), secreto)
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await correrCronDiario(crearStorage()))
  } catch {
    return NextResponse.json({ error: 'la corrida diaria falló' }, { status: 503 })
  }
}

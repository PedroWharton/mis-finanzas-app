import { NextResponse } from 'next/server'
import { obtenerPrecios } from '@/lib/precios'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await obtenerPrecios())
}

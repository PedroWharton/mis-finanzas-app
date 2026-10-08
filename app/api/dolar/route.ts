import { NextResponse } from 'next/server'
import { obtenerDolar } from '@/lib/dolar'

export const dynamic = 'force-dynamic'

// null = fuente caída: la página oculta el toggle a pesos y sigue en USD.
export async function GET() {
  return NextResponse.json({ dolar: await obtenerDolar() })
}

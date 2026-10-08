import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { armarContexto } from '@/lib/contextoAgente'
import { bearerAgenteValido } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// El proxy ya autenticó al agente; se re-valida acá por defensa en profundidad
// (doble control barato: un solo HMAC por request).
export async function GET(req: NextRequest) {
  const ok = await bearerAgenteValido(req.headers.get('authorization'), process.env.AGENTE_TOKEN)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await armarContexto(crearStorage()))
  } catch {
    return NextResponse.json({ error: 'no se pudo armar el contexto' }, { status: 503 })
  }
}

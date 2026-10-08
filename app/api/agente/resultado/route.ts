import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { bearerAgenteValido } from '@/lib/auth'
import { validarResultado, agregarCorrida, estamparPrecios, type RecomendacionesDoc } from '@/lib/recomendaciones'
import { enviarATodos, enviarWebPush, type PushSubsDoc } from '@/lib/push'

export const dynamic = 'force-dynamic'

// GET con el mismo Bearer: le da al agente sus corridas previas como contexto
// y permite auditar el histórico sin pasar por el login del navegador.
export async function GET(req: NextRequest) {
  const ok = await bearerAgenteValido(req.headers.get('authorization'), process.env.AGENTE_TOKEN)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json((await crearStorage().leer('recomendaciones')) ?? null)
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el histórico' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const ok = await bearerAgenteValido(req.headers.get('authorization'), process.env.AGENTE_TOKEN)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const v = validarResultado(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const storage = crearStorage()
  let doc: RecomendacionesDoc | null
  try {
    doc = (await storage.leer('recomendaciones')) as RecomendacionesDoc | null
  } catch {
    // Error real de lectura ≠ "no existe": no pisar el histórico (patrón del repo).
    return NextResponse.json({ error: 'no se pudo leer el histórico' }, { status: 503 })
  }
  // Estampar el precio conocido de cada ticker permite medir a futuro si la
  // recomendación funcionó. Best-effort: sin precios, la corrida vale igual.
  let resultado = v.resultado
  try {
    const lp = (await storage.leer('last-prices')) as { precios?: Record<string, number> } | null
    if (lp?.precios) resultado = estamparPrecios(resultado, lp.precios)
  } catch {
    // sin precios estampados; no bloquea el guardado
  }
  await storage.escribir('recomendaciones', agregarCorrida(doc, resultado))

  // El push es best-effort: su fallo no invalida el guardado.
  let push: { enviados: number; podadas: number } | { error: string } = { enviados: 0, podadas: 0 }
  try {
    const subsDoc = (await storage.leer('push-subs')) as PushSubsDoc | null
    const subs = subsDoc?.subs ?? []
    const payload = JSON.stringify({ title: 'Recomendaciones de cartera', body: v.resultado.resumen })
    const r = await enviarATodos(subs, payload, enviarWebPush)
    if (r.vencidas.length > 0) {
      const vivas = subs.filter((s) => !r.vencidas.some((x) => x.endpoint === s.endpoint))
      await storage.escribir('push-subs', { subs: vivas })
    }
    push = { enviados: r.enviados, podadas: r.vencidas.length }
  } catch (e) {
    push = { error: e instanceof Error ? e.message : 'fallo de push' }
  }
  return NextResponse.json({ ok: true, push })
}

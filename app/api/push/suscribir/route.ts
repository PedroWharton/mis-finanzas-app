import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { agregarSuscripcion, type PushSubsDoc, type Suscripcion } from '@/lib/push'

export const dynamic = 'force-dynamic'

function esSuscripcion(x: unknown): x is Suscripcion {
  const o = x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  return (
    typeof o?.endpoint === 'string' && o.endpoint.startsWith('https://') && o.endpoint.length < 2048 &&
    typeof o?.keys?.p256dh === 'string' && typeof o?.keys?.auth === 'string'
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!esSuscripcion(body)) return NextResponse.json({ error: 'suscripción inválida' }, { status: 400 })
  const storage = crearStorage()
  let doc: PushSubsDoc | null
  try {
    doc = (await storage.leer('push-subs')) as PushSubsDoc | null
  } catch {
    // Error real de lectura: cortar en vez de degradar y pisar subs existentes.
    return NextResponse.json({ error: 'no se pudo leer las suscripciones' }, { status: 503 })
  }
  const sub: Suscripcion = { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } }
  await storage.escribir('push-subs', agregarSuscripcion(doc, sub))
  return NextResponse.json({ ok: true })
}

export async function GET() {
  // La clave pública VAPID no es secreta: el cliente la necesita para suscribirse.
  const clave = process.env.VAPID_PUBLIC_KEY
  if (!clave) return NextResponse.json({ error: 'push no configurado' }, { status: 503 })
  return NextResponse.json({ vapidPublicKey: clave })
}

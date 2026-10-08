import webpush from 'web-push'

export interface Suscripcion { endpoint: string; keys: { p256dh: string; auth: string } }
export interface PushSubsDoc { subs: Suscripcion[] }

export function agregarSuscripcion(doc: PushSubsDoc | null, s: Suscripcion): PushSubsDoc {
  const subs = (doc?.subs ?? []).filter((x) => x.endpoint !== s.endpoint)
  return { subs: [...subs, s] }
}

export async function enviarATodos(
  subs: Suscripcion[],
  payload: string,
  enviar: (s: Suscripcion, payload: string) => Promise<void>
): Promise<{ enviados: number; vencidas: Suscripcion[] }> {
  let enviados = 0
  const vencidas: Suscripcion[] = []
  for (const s of subs) {
    try {
      await enviar(s, payload)
      enviados++
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 410 || status === 404) vencidas.push(s)
      // Otros errores (red, 5xx del push service): no vencida, solo no enviada.
    }
  }
  return { enviados, vencidas }
}

/** Envío real vía web-push. Lanza si faltan las claves VAPID: mejor un 500 visible que un push silenciosamente no configurado. */
export async function enviarWebPush(s: Suscripcion, payload: string): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) throw new Error('VAPID no configurado')
  webpush.setVapidDetails(subject, publicKey, privateKey)
  await webpush.sendNotification(s, payload)
}

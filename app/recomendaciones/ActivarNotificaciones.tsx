'use client'
import { useEffect, useState } from 'react'
import { claseBotonPrimario } from '@/app/componentes/ui/campos'

// La clave VAPID viaja en base64url; PushManager exige bytes crudos.
// El tipo se ancla a Uint8Array<ArrayBuffer> (no ArrayBufferLike): PushManager
// exige un BufferSource respaldado por ArrayBuffer, no por SharedArrayBuffer.
function base64AUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

type Estado = 'detectando' | 'no-soportado' | 'bloqueado' | 'listo' | 'suscripto' | 'error' | 'cargando'

// Registra la suscripción en el server. `agregarSuscripcion` deduplica por
// endpoint, así que llamarlo de nuevo con una sub ya conocida es idempotente.
async function registrar(sub: PushSubscription): Promise<boolean> {
  const r = await fetch('/api/push/suscribir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  return r.ok
}

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<Estado>('detectando')

  useEffect(() => {
    // Toda la detección va dentro de la cadena de promesas: setState sincrónico
    // en el cuerpo del efecto dispara renders en cascada (regla del linter).
    const soportado = 'serviceWorker' in navigator && 'PushManager' in window
    Promise.resolve()
      .then((): Estado | Promise<Estado> => {
        if (!soportado) return 'no-soportado'
        // Permiso denegado: subscribe() fallaría siempre; se explica cómo destrabarlo.
        if ('Notification' in window && Notification.permission === 'denied') return 'bloqueado'
        return navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => reg.pushManager.getSubscription())
          .then(async (sub): Promise<Estado> => {
            if (!sub) return 'listo'
            // Que el navegador tenga la sub no garantiza que el server la
            // tenga: el envío poda las vencidas (410/404) y el doc push-subs
            // puede perderse. Sin este re-registro la UI diría "activadas ✓"
            // para siempre sin que llegue nada y sin forma de recuperarse.
            return (await registrar(sub)) ? 'suscripto' : 'error'
          })
      })
      .then(setEstado)
      .catch(() => setEstado('error'))
  }, [])

  async function suscribir() {
    setEstado('cargando')
    try {
      const { vapidPublicKey } = (await (await fetch('/api/push/suscribir')).json()) as {
        vapidPublicKey?: string
      }
      if (!vapidPublicKey) {
        setEstado('error')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64AUint8(vapidPublicKey),
      })
      setEstado((await registrar(sub)) ? 'suscripto' : 'error')
    } catch {
      setEstado('Notification' in window && Notification.permission === 'denied' ? 'bloqueado' : 'error')
    }
  }

  if (estado === 'detectando') {
    // Mismo tamaño que el botón: sin salto de layout cuando termina la detección.
    return <div aria-hidden="true" className="h-11 w-52 motion-safe:animate-pulse rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]" />
  }
  if (estado === 'no-soportado') {
    return (
      <p className="text-[14px] text-[var(--fg-1)]">
        Este navegador no admite notificaciones web.
      </p>
    )
  }
  if (estado === 'bloqueado') {
    return (
      <p className="max-w-[60ch] text-[14px] text-[var(--fg-1)]">
        Las notificaciones están bloqueadas para este sitio. Habilitalas desde los permisos del navegador (o de
        Ajustes, si usás la app instalada) y volvé a esta página.
      </p>
    )
  }
  if (estado === 'suscripto') {
    return (
      <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fg-1)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="var(--good)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
        Notificaciones activadas en este dispositivo
      </p>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={suscribir}
        disabled={estado === 'cargando'}
        aria-busy={estado === 'cargando' || undefined}
        className={claseBotonPrimario}
      >
        {estado === 'cargando' ? 'Activando…' : estado === 'error' ? 'Reintentar' : 'Activar notificaciones'}
      </button>
      {estado === 'error' && (
        <p role="alert" className="max-w-[60ch] text-[13px] leading-snug" style={{ color: 'var(--bad)' }}>
          No se pudo activar. Si estás en iPhone, seguí los pasos de abajo; si no, revisá tu conexión y probá de nuevo.
        </p>
      )}
    </div>
  )
}

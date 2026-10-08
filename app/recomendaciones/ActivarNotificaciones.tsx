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

type Estado = 'no-soportado' | 'listo' | 'suscripto' | 'error' | 'cargando'

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
  const [estado, setEstado] = useState<Estado>('cargando')

  useEffect(() => {
    // Toda la detección va dentro de la cadena de promesas: setState sincrónico
    // en el cuerpo del efecto dispara renders en cascada (regla del linter).
    const soportado = 'serviceWorker' in navigator && 'PushManager' in window
    Promise.resolve()
      .then((): Estado | Promise<Estado> => {
        if (!soportado) return 'no-soportado'
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
      setEstado('error')
    }
  }

  if (estado === 'no-soportado') {
    return (
      <p className="text-sm text-[var(--fg-2)]">
        En iPhone: compartir → “Agregar a pantalla de inicio” desde Safari, y abrir la app desde ahí para activar
        notificaciones.
      </p>
    )
  }
  if (estado === 'suscripto') {
    return (
      <p className="text-sm" style={{ color: 'var(--good)' }}>
        Notificaciones activadas ✓
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={suscribir}
        disabled={estado === 'cargando'}
        className={claseBotonPrimario}
      >
        {estado === 'cargando' ? 'Activando…' : estado === 'error' ? 'Reintentar notificaciones' : 'Activar notificaciones'}
      </button>
      {estado === 'error' && (
        <p role="alert" className="text-xs" style={{ color: 'var(--bad)' }}>
          No se pudo activar. En iPhone hace falta instalar la app (compartir → “Agregar a pantalla de inicio”) y
          abrirla desde el ícono.
        </p>
      )}
    </div>
  )
}

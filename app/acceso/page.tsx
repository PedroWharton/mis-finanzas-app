'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { claseInput, claseBotonPrimario } from '@/app/componentes/ui/campos'
import { Logo } from '@/app/componentes/ui/Logo'

export default function AccesoPage() {
  const router = useRouter()
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave }),
      })
      if (res.ok) {
        router.replace('/')
        router.refresh()
        return
      }
      setError('Clave incorrecta. Volvé a intentar.')
      inputRef.current?.focus()
    } catch {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
      inputRef.current?.focus()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-[var(--bg-app)] md:flex-row md:items-stretch md:p-6">
      {/* La tapa del cuaderno: el único bloque navy de la pantalla, con el logo
          y su filete dorado. El formulario es la primera hoja. */}
      <section
        aria-label="Mis Finanzas"
        className="color-exacto flex flex-col justify-between rounded-b-[28px] border-b border-[var(--band-edge)] bg-[var(--band)] px-6 pb-10 pt-[calc(env(safe-area-inset-top)+28px)] md:w-[44%] md:max-w-[560px] md:rounded-[28px] md:border md:px-14 md:py-14"
      >
        <Logo size={56} />
        <div className="entra mt-16 md:mt-0">
          <h1 className="font-display text-[44px] font-medium leading-[1.02] tracking-[-0.02em] text-[var(--band-ink)] md:text-[60px]">
            Mis Finanzas
          </h1>
          <div aria-hidden="true" className="filete-dorado mt-5 w-24 md:mt-7 md:w-32" />
          <p className="mt-4 max-w-[34ch] font-display text-[17px] italic leading-relaxed text-[var(--band-ink-3)] md:mt-6 md:text-[19px]">
            Panel privado de cartera, movimientos y reportes.
          </p>
        </div>
      </section>

      <div className="flex flex-1 items-start justify-center px-6 pb-12 pt-10 md:items-center md:px-10 md:py-16">
        <form onSubmit={onSubmit} noValidate className="w-full max-w-[360px]">
          <h2 className="font-display text-[28px] font-medium leading-tight tracking-[-0.015em] text-[var(--fg-1)]">Ingresá</h2>
          <p className="mt-1.5 text-[15px] text-[var(--fg-2)]">Escribí la clave del panel para continuar.</p>

          <label htmlFor="clave" className="mt-7 block text-[14px] font-medium text-[var(--fg-1)]">
            Clave
          </label>
          <div className="relative mt-2">
            <input
              id="clave"
              name="clave"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              ref={inputRef}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'clave-error' : undefined}
              className={`${claseInput} min-h-12 w-full pr-[92px] text-[16px] ${error ? 'border-[var(--bad)]' : ''}`}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-pressed={visible}
              aria-controls="clave"
              className="absolute inset-y-1 right-1 min-w-11 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold text-[var(--link)] underline decoration-[var(--mark)] underline-offset-4 hover:text-[var(--link-hover)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              {visible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {error && (
            <p id="clave-error" role="alert" className="mt-2 text-[14px] text-[var(--bad)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className={`${claseBotonPrimario} mt-6 min-h-12 w-full text-[15px]`}
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  )
}

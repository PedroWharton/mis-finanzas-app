'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { claseInput, claseBotonPrimario } from '@/app/componentes/ui/campos'

export default function AccesoPage() {
  const router = useRouter()
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    <main className="min-h-full flex items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] p-8 [box-shadow:var(--shadow-sm)]">
        <p className="etiqueta mb-2">Acceso</p>
        <h1 className="font-display text-[28px] leading-tight text-[var(--fg-1)]">Mis Finanzas</h1>
        <div aria-hidden="true" className="mt-4 mb-6 h-px w-12 bg-[var(--gold-300)]" />

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="clave" className="block text-sm font-medium mb-1.5 text-[var(--fg-2)]">
            Clave
          </label>
          <input
            id="clave"
            name="clave"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            ref={inputRef}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'clave-error' : undefined}
            className={`${claseInput} w-full`}
          />

          {error && (
            <p id="clave-error" role="alert" className="mt-2 text-sm text-[var(--bad)]">
              {error}
            </p>
          )}

          <button type="submit" disabled={enviando} className={`${claseBotonPrimario} mt-5 w-full`}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  )
}

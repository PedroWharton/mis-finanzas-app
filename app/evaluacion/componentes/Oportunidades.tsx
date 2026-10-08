'use client'
import { useState } from 'react'
import { Panel } from '@/app/componentes/ui/Panel'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { claseBotonPrimario, claseInput } from '@/app/componentes/ui/campos'

export interface OportunidadesProps {
  hayCandidatos: boolean
  // Devuelve el mensaje de error a mostrar junto al input, o null si salió bien.
  onAgregar: (ticker: string, tipo: 'acciones' | 'cripto') => Promise<string | null>
  children: React.ReactNode // grid de tarjetas ya armado por la página
}

export function Oportunidades({ hayCandidatos, onAgregar, children }: OportunidadesProps) {
  const [ticker, setTicker] = useState('')
  const [tipo, setTipo] = useState<'acciones' | 'cripto'>('acciones')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker.trim() || cargando) return
    setCargando(true)
    setError(null)
    const err = await onAgregar(ticker.trim(), tipo)
    setCargando(false)
    if (err) setError(err)
    else setTicker('')
  }

  return (
    <Panel titulo="Oportunidades" className="revela">
      <form onSubmit={agregar} className="mb-5 flex flex-wrap items-center gap-2">
        <label htmlFor="ticker-watchlist" className="sr-only">
          Ticker
        </label>
        <input
          id="ticker-watchlist"
          name="ticker"
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="done"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker (ej. PLTR)"
          className={`${claseInput} w-40 font-mono uppercase placeholder:font-sans placeholder:normal-case`}
        />
        <label htmlFor="tipo-watchlist" className="sr-only">
          Tipo
        </label>
        <select
          id="tipo-watchlist"
          value={tipo}
          onChange={(e) => setTipo(e.target.value === 'cripto' ? 'cripto' : 'acciones')}
          className={claseInput}
        >
          <option value="acciones">Acciones / ETF</option>
          <option value="cripto">Cripto</option>
        </select>
        <button type="submit" disabled={cargando} className={claseBotonPrimario}>
          {cargando ? 'Validando…' : 'Agregar'}
        </button>
        {error && (
          <p role="alert" className="text-xs" style={{ color: 'var(--bad)' }}>
            {error}
          </p>
        )}
      </form>
      {hayCandidatos ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">{children}</div>
      ) : (
        <EstadoVacio
          titulo="Sin candidatos en la watchlist"
          detalle="Agregá un ticker para evaluarlo con las mismas señales que tus posiciones."
        />
      )}
    </Panel>
  )
}

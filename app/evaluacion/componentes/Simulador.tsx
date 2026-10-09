'use client'
import { useState } from 'react'
import { simularCompra, parsearMonto, type ResultadoSimulacion } from '@/lib/simulador'
import type { Serie } from '@/lib/historicos'
import type { TipoActivo } from '@/lib/tipos'
import { pct, ratio } from '@/app/componentes/ui/formatters'
import { claseBotonSecundario, claseInput } from '@/app/componentes/ui/campos'

export interface SimuladorProps {
  ticker: string
  serie: Serie
  tipo: 'acciones' | 'cripto'
  valores: Record<string, number> // valor USD actual por clave (posiciones + BONO/EFECTIVO)
  series: Record<string, Serie> // series de las posiciones con histórico
  tipos: Record<string, TipoActivo> // tipo por clave
}

type EstadoSimulacion =
  | { tipo: 'nada' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ok'; r: ResultadoSimulacion }

export function Simulador({ ticker, serie, tipo, valores, series, tipos }: SimuladorProps) {
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [estado, setEstado] = useState<EstadoSimulacion>({ tipo: 'nada' })

  function simular(e: React.FormEvent) {
    e.preventDefault()
    const m = parsearMonto(monto)
    // monto <= 0 → error de validación en la UI: simularCompra no se llama.
    if (!Number.isFinite(m) || m <= 0) {
      setEstado({ tipo: 'error', mensaje: 'ingresá un monto mayor a 0' })
      return
    }
    const r = simularCompra(valores, series, tipos, { ticker, serie, tipo }, m)
    setEstado(r === null ? { tipo: 'error', mensaje: 'histórico insuficiente para comparar' } : { tipo: 'ok', r })
  }

  return (
    <div className="mt-3 border-t border-[var(--border-1)] pt-3">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="-m-2 inline-flex min-h-11 items-center rounded-[var(--radius-md)] p-2 text-xs font-semibold text-[var(--fg-2)] underline decoration-[var(--mark)] underline-offset-4 transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          Simular compra
        </button>
      ) : (
        <form onSubmit={simular} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`monto-${ticker}`} className="text-xs text-[var(--fg-3)]">
            Monto USD
          </label>
          <input
            id={`monto-${ticker}`}
            name="monto"
            inputMode="decimal"
            enterKeyHint="go"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={`${claseInput} w-28 font-mono`}
          />
          <button type="submit" className={claseBotonSecundario}>
            Simular
          </button>
        </form>
      )}
      {estado.tipo === 'error' && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--bad)' }}>
          {estado.mensaje}
        </p>
      )}
      {estado.tipo === 'ok' && (
        <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs md:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--fg-3)]">Peso resultante</dt>
            <dd className="font-mono text-[var(--fg-1)]">{pct.format(estado.r.pesoNuevo)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--fg-3)]">Correlación media</dt>
            <dd className="font-mono text-[var(--fg-1)]">
              {estado.r.correlacionMedia !== null ? ratio.format(estado.r.correlacionMedia) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 md:col-span-2">
            <dt className="text-[var(--fg-3)]">Vol. de cartera</dt>
            <dd
              className="font-mono"
              style={{ color: estado.r.volDespues > estado.r.volAntes ? 'var(--bad)' : 'var(--good)' }}
            >
              {pct.format(estado.r.volAntes)} → {pct.format(estado.r.volDespues)}{' '}
              {estado.r.volDespues > estado.r.volAntes ? '↑' : '↓'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

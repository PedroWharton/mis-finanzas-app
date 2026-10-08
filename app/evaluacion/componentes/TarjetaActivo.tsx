'use client'
import Link from 'next/link'
import type { Indicadores } from '@/lib/indicadores'
import type { Banda } from '@/lib/predictor'
import type { PuntoBanda } from '@/lib/proyeccion'
import type { Evaluacion, Veredicto } from '@/lib/senales'
import { Badge } from '@/app/componentes/ui/Badge'
import { VEREDICTO_COLOR, VEREDICTO_LABEL } from '@/app/componentes/ui/colores'
import { pct, signo, usd } from '@/app/componentes/ui/formatters'

export interface LineaBacktest {
  meses: number
  retornoEstrategia: number
  retornoBuyHold: number
  operaciones: number
}

export interface TarjetaActivoProps {
  ticker: string // '' → no se muestra el ticker chico junto al nombre
  nombre: string
  evaluacion: Evaluacion
  ind: Indicadores
  vol: number
  drawdown: number
  sharpeVal?: number // sin definir → fila oculta (candidatos)
  correlacionMedia?: number | null // sin definir → fila oculta; null → '—'
  proyeccion?: PuntoBanda // sin definir → línea oculta (candidatos)
  notaDatos?: string // p. ej. "Datos al 21 de julio de 2026"
  mostrarMomentum12?: boolean // candidatos: fila extra de momentum 12 m
  onQuitar?: () => void // candidatos: control para quitar de la watchlist
  cambio?: Veredicto // veredicto de la última visita, si difiere del actual
  backtest?: LineaBacktest // sin definir → línea oculta (datos insuficientes)
  prediccion1m?: Banda // sin definir → línea oculta (sin predicción); linkea a /predicciones
  children?: React.ReactNode // pie de tarjeta (simulador, backtest…)
}

function BotonQuitar({ nombre, onQuitar }: { nombre: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar ${nombre} de la watchlist`}
      className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] p-3 text-base leading-none text-[var(--fg-3)] transition-colors duration-[var(--dur-base)] hover:text-[var(--bad)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
    >
      <span aria-hidden="true">×</span>
    </button>
  )
}

function Metrica({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--fg-3)]">{label}</dt>
      {children}
    </div>
  )
}

export function TarjetaActivo({
  ticker,
  nombre,
  evaluacion,
  ind,
  vol,
  drawdown,
  sharpeVal,
  correlacionMedia,
  proyeccion,
  notaDatos,
  mostrarMomentum12,
  onQuitar,
  cambio,
  backtest,
  prediccion1m,
  children,
}: TarjetaActivoProps) {
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)] px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[var(--fg-1)]">
          {nombre}{' '}
          {ticker && (
            <span translate="no" className="font-mono text-xs font-normal text-[var(--fg-3)]">
              {ticker}
            </span>
          )}
        </h3>
        {onQuitar && <BotonQuitar nombre={nombre} onQuitar={onQuitar} />}
      </div>

      {/* Dato principal: el veredicto, con el cambio de señal al lado. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {cambio && (
          <span className="text-xs text-[var(--fg-3)]" title="cambió desde tu última visita">
            {VEREDICTO_LABEL[cambio]} →
          </span>
        )}
        <Badge color={VEREDICTO_COLOR[evaluacion.veredicto]}>
          {VEREDICTO_LABEL[evaluacion.veredicto]}
        </Badge>
        <span
          className="font-display ml-auto text-[22px] font-medium leading-none tabular-nums"
          style={{ color: ind.momentum6m === null ? 'var(--fg-3)' : ind.momentum6m >= 0 ? 'var(--good)' : 'var(--bad)' }}
          title="Momentum 6 meses"
        >
          {ind.momentum6m !== null
            ? `${signo(ind.momentum6m)}${pct.format(Math.abs(ind.momentum6m))}`
            : '—'}
        </span>
      </div>
      <p className="mt-1 text-right text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
        Momentum 6 m
      </p>

      <ul className="mt-2.5 flex flex-col gap-1 text-xs text-[var(--fg-2)]">
        {evaluacion.razones.map((r, i) => (
          <li key={i}>· {r}</li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs md:grid-cols-2">
        {mostrarMomentum12 && (
          <Metrica label="Momentum 12m">
            <dd
              className="tabular-nums font-semibold"
              style={{ color: ind.momentum12m === null ? 'var(--fg-3)' : ind.momentum12m >= 0 ? 'var(--good)' : 'var(--bad)' }}
            >
              {ind.momentum12m !== null ? `${signo(ind.momentum12m)}${pct.format(Math.abs(ind.momentum12m))}` : '—'}
            </dd>
          </Metrica>
        )}
        <Metrica label="RSI (14)">
          <dd className="tabular-nums font-semibold text-[var(--fg-1)]">
            {ind.rsi14 !== null ? ind.rsi14.toFixed(0) : '—'}
          </dd>
        </Metrica>
        <Metrica label="Vol. anualizada">
          <dd className="tabular-nums font-semibold text-[var(--fg-1)]">{pct.format(vol)}</dd>
        </Metrica>
        <Metrica label="Max drawdown">
          <dd className="tabular-nums font-semibold" style={{ color: 'var(--bad)' }}>
            −{pct.format(Math.abs(drawdown))}
          </dd>
        </Metrica>
        {sharpeVal !== undefined && (
          <Metrica label="Sharpe">
            <dd className="tabular-nums font-semibold text-[var(--fg-1)]">{sharpeVal.toFixed(2)}</dd>
          </Metrica>
        )}
        {correlacionMedia !== undefined && (
          <Metrica label="Correlación media">
            <dd className="tabular-nums font-semibold text-[var(--fg-1)]">
              {correlacionMedia !== null ? correlacionMedia.toFixed(2) : '—'}
            </dd>
          </Metrica>
        )}
      </dl>

      {backtest && (
        <p className="mt-3 text-xs text-[var(--fg-3)]">
          Backtest {backtest.meses} m:{' '}
          <span
            className="tabular-nums font-semibold"
            style={{ color: backtest.retornoEstrategia >= backtest.retornoBuyHold ? 'var(--good)' : 'var(--bad)' }}
          >
            señales {signo(backtest.retornoEstrategia)}{pct.format(Math.abs(backtest.retornoEstrategia))}
          </span>{' '}
          ·{' '}
          <span
            className="tabular-nums font-semibold"
            style={{ color: backtest.retornoBuyHold > backtest.retornoEstrategia ? 'var(--good)' : 'var(--bad)' }}
          >
            mantener {signo(backtest.retornoBuyHold)}{pct.format(Math.abs(backtest.retornoBuyHold))}
          </span>{' '}
          · {backtest.operaciones} operaciones
        </p>
      )}
      {proyeccion && (
        <p className="mt-3 text-xs text-[var(--fg-3)]">
          Proyección 3 m: {usd.format(proyeccion.p10)} / {usd.format(proyeccion.p50)} /{' '}
          {usd.format(proyeccion.p90)} (p10 / mediana / p90)
        </p>
      )}
      {prediccion1m && (
        <p className="mt-1 text-xs text-[var(--fg-3)]">
          <Link
            href="/predicciones"
            className="underline decoration-[var(--border-2)] underline-offset-2 transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            pred 1 m
          </Link>
          : <span className="tabular-nums font-semibold text-[var(--fg-2)]">{usd.format(prediccion1m.p50)}</span>{' '}
          <span className="tabular-nums">
            [{usd.format(prediccion1m.p10)} – {usd.format(prediccion1m.p90)}]
          </span>
        </p>
      )}
      {notaDatos && <p className="mt-1 text-xs text-[var(--fg-3)]">{notaDatos}</p>}
      {children}
    </article>
  )
}

export function TarjetaSinDatos({
  ticker,
  nombre,
  nota = 'Sin datos históricos',
  onQuitar,
}: {
  ticker: string
  nombre: string
  nota?: string
  onQuitar?: () => void
}) {
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)] px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[var(--fg-1)]">
          {nombre}{' '}
          {ticker && (
            <span translate="no" className="font-mono text-xs font-normal text-[var(--fg-3)]">
              {ticker}
            </span>
          )}
        </h3>
        {onQuitar && <BotonQuitar nombre={nombre} onQuitar={onQuitar} />}
      </div>
      <p className="mt-2 text-xs text-[var(--fg-3)]">{nota}</p>
    </article>
  )
}

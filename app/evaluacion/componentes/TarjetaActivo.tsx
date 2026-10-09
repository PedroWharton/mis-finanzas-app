'use client'
import Link from 'next/link'
import type { Indicadores } from '@/lib/indicadores'
import type { Banda } from '@/lib/predictor'
import type { PuntoBanda } from '@/lib/proyeccion'
import type { Evaluacion, Veredicto } from '@/lib/senales'
import { Badge } from '@/app/componentes/ui/Badge'
import { VEREDICTO_COLOR, VEREDICTO_LABEL } from '@/app/componentes/ui/colores'
import { pct, ratio, signo, usd } from '@/app/componentes/ui/formatters'
import { idActivo } from './compartido'

export interface LineaBacktest {
  meses: number
  retornoEstrategia: number
  retornoBuyHold: number
  operaciones: number
}

export interface TarjetaActivoProps {
  ticker: string // '' → no se muestra el ticker chico junto al nombre
  nombre: string
  ancla?: string // ticker real para el id de la tarjeta (las alertas linkean acá)
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
  compacta?: boolean // candidatos: fila plegable con veredicto y momentum; el detalle se abre
  children?: React.ReactNode // pie de tarjeta (simulador)
}

const claseTarjeta =
  'scroll-mt-6 rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)]'

function colorSigno(v: number | null): string {
  if (v === null || v === 0) return 'var(--fg-2)'
  return v > 0 ? 'var(--good)' : 'var(--bad)'
}

function conSigno(v: number): string {
  return `${signo(v)}${pct.format(Math.abs(v))}`
}

function BotonQuitar({ nombre, onQuitar }: { nombre: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar ${nombre} de la watchlist`}
      className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] p-3 text-[var(--fg-3)] transition-colors duration-[var(--dur-base)] hover:text-[var(--bad)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}

function Metrica({ label, children, color }: { label: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-[var(--fg-3)]">{label}</dt>
      <dd
        className="mt-0.5 font-mono text-[13px] text-[var(--fg-1)]"
        style={color ? { color } : undefined}
      >
        {children}
      </dd>
    </div>
  )
}

// Veredicto (con el cambio desde la última visita) y momentum 6 m: lo que se
// lee primero en cada tarjeta.
function LineaVeredicto({ evaluacion, cambio }: { evaluacion: Evaluacion; cambio?: Veredicto }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {cambio && (
        <span className="text-xs text-[var(--fg-3)]" title="Cambió desde tu última visita">
          {VEREDICTO_LABEL[cambio]} →
        </span>
      )}
      <Badge color={VEREDICTO_COLOR[evaluacion.veredicto]}>{VEREDICTO_LABEL[evaluacion.veredicto]}</Badge>
    </span>
  )
}

// Color por signo del retorno; el ganador se marca con peso y etiqueta.
function Backtest({ b }: { b: LineaBacktest }) {
  // Diferencias que no se ven con un decimal (p. ej. 0 operaciones) cuentan como empate.
  const dif = b.retornoEstrategia - b.retornoBuyHold
  const gana: 'senales' | 'mantener' | null = Math.abs(dif) < 0.0005 ? null : dif > 0 ? 'senales' : 'mantener'
  const filas = [
    { clave: 'senales' as const, label: 'Siguiendo las señales', v: b.retornoEstrategia },
    { clave: 'mantener' as const, label: 'Comprar y mantener', v: b.retornoBuyHold },
  ]
  return (
    <div className="mt-4">
      <p className="text-[11px] text-[var(--fg-3)]">
        Backtest {b.meses} m, {b.operaciones} {b.operaciones === 1 ? 'operación' : 'operaciones'}
        {gana === null && ' (mismo resultado)'}
      </p>
      <dl className="mt-1 flex flex-col gap-0.5 text-[12px]">
        {filas.map((f) => (
          <div key={f.clave} className="flex items-baseline justify-between gap-3">
            <dt className={gana === f.clave ? 'font-semibold text-[var(--fg-1)]' : 'text-[var(--fg-2)]'}>
              {f.label}
              {gana === f.clave && (
                <span className="ml-1.5 rounded-[var(--radius-pill)] bg-[var(--bg-surface)] px-1.5 py-px text-[10px] font-semibold text-[var(--fg-2)] ring-1 ring-[var(--border-1)]">
                  mejor
                </span>
              )}
            </dt>
            <dd
              className={`font-mono ${gana === f.clave ? 'font-semibold' : 'font-normal'}`}
              style={{ color: colorSigno(f.v) }}
            >
              {conSigno(f.v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Rango({ label, central, p10, p90 }: { label: React.ReactNode; central: number; p10: number; p90: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-[var(--fg-3)]">{label}</dt>
      <dd className="mt-0.5 font-mono text-[13px] text-[var(--fg-1)]">{usd.format(central)}</dd>
      <dd className="font-mono text-[11px] leading-snug text-[var(--fg-3)]">
        {usd.format(p10)} – {usd.format(p90)}
      </dd>
    </div>
  )
}

function Detalle({
  evaluacion,
  ind,
  vol,
  drawdown,
  sharpeVal,
  correlacionMedia,
  proyeccion,
  notaDatos,
  mostrarMomentum12,
  backtest,
  prediccion1m,
  children,
}: TarjetaActivoProps) {
  return (
    <>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-snug text-[var(--fg-2)] marker:text-[var(--fg-3)]">
        {evaluacion.razones.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
        {mostrarMomentum12 && (
          <Metrica label="Momentum 12 m" color={colorSigno(ind.momentum12m)}>
            {ind.momentum12m !== null ? conSigno(ind.momentum12m) : '—'}
          </Metrica>
        )}
        <Metrica label="RSI (14)">{ind.rsi14 !== null ? ind.rsi14.toFixed(0) : '—'}</Metrica>
        <Metrica label="Vol. anual">{pct.format(vol)}</Metrica>
        <Metrica label="Max drawdown" color="var(--bad)">
          −{pct.format(Math.abs(drawdown))}
        </Metrica>
        {sharpeVal !== undefined && <Metrica label="Sharpe">{ratio.format(sharpeVal)}</Metrica>}
        {correlacionMedia !== undefined && (
          <Metrica label="Corr. media">{correlacionMedia !== null ? ratio.format(correlacionMedia) : '—'}</Metrica>
        )}
      </dl>

      {backtest && <Backtest b={backtest} />}

      {(proyeccion || prediccion1m) && (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          {proyeccion && (
            <Rango label="Tu posición en 3 m" central={proyeccion.p50} p10={proyeccion.p10} p90={proyeccion.p90} />
          )}
          {prediccion1m && (
            <Rango
              label={
                <Link
                  href="/predicciones"
                  className="underline decoration-[var(--mark)] underline-offset-4 transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                >
                  Precio previsto en 1 m
                </Link>
              }
              central={prediccion1m.p50}
              p10={prediccion1m.p10}
              p90={prediccion1m.p90}
            />
          )}
        </dl>
      )}
      {(proyeccion || prediccion1m) && (
        <p className="mt-1.5 text-[11px] text-[var(--fg-3)]">Mediana y rango p10–p90.</p>
      )}
      {notaDatos && <p className="mt-2 text-xs text-[var(--fg-3)]">{notaDatos}</p>}
      {children}
    </>
  )
}

function Momentum({ v, chico }: { v: number | null; chico?: boolean }) {
  return (
    <span className="flex flex-col items-end">
      <span
        className={`font-display font-medium leading-none ${chico ? 'text-[18px]' : 'text-[24px]'}`}
        style={{ color: v === null ? 'var(--fg-3)' : colorSigno(v) }}
      >
        {v !== null ? conSigno(v) : '—'}
      </span>
      <span className="mt-1 text-[11px] leading-none text-[var(--fg-3)]">momentum 6 m</span>
    </span>
  )
}

export function TarjetaActivo(props: TarjetaActivoProps) {
  const { ticker, nombre, ancla, evaluacion, ind, cambio, onQuitar, compacta } = props
  const id = ancla ? idActivo(ancla) : undefined

  if (compacta) {
    return (
      <details id={id} className={`group ${claseTarjeta}`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 select-none focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span translate="no" className="font-mono text-[14px] font-medium leading-none text-[var(--fg-1)]">
                {nombre}
              </span>
              {cambio && (
                <span className="text-[11px] leading-none text-[var(--fg-3)]" title="Cambió desde tu última visita">
                  antes {VEREDICTO_LABEL[cambio].toLowerCase()}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap font-mono text-[11px] leading-none text-[var(--fg-3)]">
              12 m{' '}
              <span style={{ color: colorSigno(ind.momentum12m) }}>
                {ind.momentum12m !== null ? conSigno(ind.momentum12m) : '—'}
              </span>
              <span className="ml-2.5">RSI {ind.rsi14 !== null ? ind.rsi14.toFixed(0) : '—'}</span>
            </span>
          </span>
          {/* El veredicto lo da el título del grupo; acá solo el cambio. */}
          <span className="sr-only">{VEREDICTO_LABEL[evaluacion.veredicto]}</span>
          <Momentum v={ind.momentum6m} chico />
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 shrink-0 text-[var(--fg-3)] transition-transform duration-[var(--dur-base)] group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 6 8 10.5 12.5 6" />
          </svg>
        </summary>
        <div className="border-t border-[var(--border-1)] px-4 pb-4 pt-3">
          <Detalle {...props} mostrarMomentum12={false} />
          {onQuitar && (
            <div className="mt-3 border-t border-[var(--border-1)] pt-1">
              <button
                type="button"
                onClick={onQuitar}
                className="-mx-2 inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-2 text-xs font-semibold text-[var(--fg-3)] transition-colors duration-[var(--dur-base)] hover:text-[var(--bad)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
              >
                Quitar de la watchlist
              </button>
            </div>
          )}
        </div>
      </details>
    )
  }

  return (
    <article id={id} className={`${claseTarjeta} px-5 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-snug text-[var(--fg-1)]">
            {nombre}{' '}
            {ticker && (
              <span translate="no" className="font-mono text-xs font-normal text-[var(--fg-3)]">
                {ticker}
              </span>
            )}
          </h3>
          <div className="mt-2">
            <LineaVeredicto evaluacion={evaluacion} cambio={cambio} />
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <Momentum v={ind.momentum6m} />
          {onQuitar && <BotonQuitar nombre={nombre} onQuitar={onQuitar} />}
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border-1)] pt-3">
        <Detalle {...props} />
      </div>
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
    <article className={`${claseTarjeta} flex items-center justify-between gap-3 px-4 py-3`}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium leading-snug text-[var(--fg-1)]">
          {nombre}{' '}
          {ticker && (
            <span translate="no" className="font-mono text-xs font-normal text-[var(--fg-3)]">
              {ticker}
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs text-[var(--fg-3)]">{nota}</p>
      </div>
      {onQuitar && <BotonQuitar nombre={nombre} onQuitar={onQuitar} />}
    </article>
  )
}

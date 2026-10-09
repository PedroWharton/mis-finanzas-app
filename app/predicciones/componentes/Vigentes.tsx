'use client'
import { useState } from 'react'
import type { Prediccion } from '@/lib/predictor'
import { pct, signo, usd } from '@/app/componentes/ui/formatters'
import { Panel } from '@/app/componentes/ui/Panel'
import { Badge } from '@/app/componentes/ui/Badge'
import { claseBotonTexto } from '@/app/componentes/ui/campos'

// En el celular la lista arranca corta: los de mayor retorno esperado primero.
const INICIALES_MOVIL = 8

export interface FilaVigente {
  ticker: string
  posicion: boolean // true = está en la cartera (badge)
  precio: number
  prediccion: Prediccion
  retorno3m: number // p50 3m / precio − 1 (criterio de orden, descendente)
}

function Retorno({ v }: { v: number }) {
  return (
    <span className="font-mono" style={{ color: v >= 0 ? 'var(--good)' : 'var(--bad)' }}>
      {signo(v)}
      {pct.format(Math.abs(v))}
    </span>
  )
}

// Número sin prefijo de moneda para los extremos de la banda: el "US$" ya
// está en el p50 de al lado y repetirlo tres veces por celda solo agrega ruido.
const num = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Banda({ banda }: { banda: { p10: number; p50: number; p90: number } }) {
  return (
    <>
      <span className="font-mono text-[var(--fg-1)]">{usd.format(banda.p50)}</span>{' '}
      <span className="ml-1.5 whitespace-nowrap font-mono text-[12px] text-[var(--fg-3)]">
        {num.format(banda.p10)}–{num.format(banda.p90)}
      </span>
    </>
  )
}

// Móvil: una cabecera (ticker, precio de hoy, retorno a 3 m) y dos renglones
// etiquetados con las bandas. Sin fila "Hoy" aparte: 33 tickers × 1 renglón menos.
function FilaMovil({ f }: { f: FilaVigente }) {
  return (
    <li className="py-3 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span translate="no" className="font-mono text-[14px] font-medium text-[var(--fg-1)]">
            {f.ticker}
          </span>
          <span className="font-mono text-[var(--fg-3)]">{usd.format(f.precio)}</span>
          {f.posicion && <Badge color="var(--fg-3)">posición</Badge>}
        </span>
        <span className="shrink-0 text-[var(--fg-3)]">
          <Retorno v={f.retorno3m} /> a 3 m
        </span>
      </div>
      <dl className="mt-1.5 grid grid-cols-[40px_1fr] gap-y-0.5">
        <dt className="text-[var(--fg-3)]">1 m</dt>
        <dd>
          <Banda banda={f.prediccion.m1} />
        </dd>
        <dt className="text-[var(--fg-3)]">3 m</dt>
        <dd>
          <Banda banda={f.prediccion.m3} />
        </dd>
      </dl>
    </li>
  )
}

export function Vigentes({ filas }: { filas: FilaVigente[] }) {
  const [todas, setTodas] = useState(false)
  const movil = todas ? filas : filas.slice(0, INICIALES_MOVIL)
  return (
    <Panel
      titulo="Predicciones vigentes"
      ayuda="Mediana (p50) seguida de la banda central del 80% (p10–p90), ordenadas por retorno mediano a 3 meses."
    >
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">
          Ningún ticker tiene histórico suficiente para predecir. Las predicciones aparecen cuando la serie de
          precios de un ticker de la cartera o de la watchlist alcanza el mínimo de datos.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[var(--border-1)] md:hidden">
            {movil.map((f) => (
              <FilaMovil key={f.ticker} f={f} />
            ))}
          </ul>
          {filas.length > INICIALES_MOVIL && (
            <div className="border-t border-[var(--border-1)] pt-1 md:hidden">
              <button type="button" onClick={() => setTodas((t) => !t)} className={claseBotonTexto}>
                {todas ? 'Ver menos' : `Ver los ${filas.length} tickers`}
              </button>
            </div>
          )}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-2)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Ticker
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Precio hoy
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    A 1 mes: p50 y banda
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    A 3 meses: p50 y banda
                  </th>
                  <th className="py-2 pr-0 text-right font-semibold" scope="col">
                    Retorno 3 m
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--fg-2)]">
                {filas.map((f) => (
                  <tr key={f.ticker} className="h-11 border-b border-[var(--border-1)] hover:bg-[var(--bg-sunken)]">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span translate="no" className="font-mono font-medium text-[var(--fg-1)]">
                          {f.ticker}
                        </span>
                        {f.posicion && <Badge color="var(--fg-3)">posición</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">{usd.format(f.precio)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      <Banda banda={f.prediccion.m1} />
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      <Banda banda={f.prediccion.m3} />
                    </td>
                    <td className="py-2 pr-0 text-right whitespace-nowrap">
                      <Retorno v={f.retorno3m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}

'use client'
import type { Prediccion } from '@/lib/predictor'
import { pct, signo, usd } from '@/app/componentes/ui/formatters'
import { Panel } from '@/app/componentes/ui/Panel'
import { Badge } from '@/app/componentes/ui/Badge'

export interface FilaVigente {
  ticker: string
  posicion: boolean // true = está en la cartera (badge)
  precio: number
  prediccion: Prediccion
  retorno3m: number // p50 3m / precio − 1 (criterio de orden, descendente)
}

function Retorno({ v }: { v: number }) {
  return (
    <span className="tabular-nums font-semibold" style={{ color: v >= 0 ? 'var(--good)' : 'var(--bad)' }}>
      {signo(v)}
      {pct.format(Math.abs(v))}
    </span>
  )
}

function Banda({ banda }: { banda: { p10: number; p50: number; p90: number } }) {
  return (
    <>
      <span className="tabular-nums font-semibold text-[var(--fg-1)]">{usd.format(banda.p50)}</span>{' '}
      <span className="whitespace-nowrap tabular-nums text-[var(--fg-3)]">
        [{usd.format(banda.p10)} – {usd.format(banda.p90)}]
      </span>
    </>
  )
}

// Móvil: fila apilada — ticker + badge y retorno arriba, precio actual y las
// bandas 1 m / 3 m en filas etiquetadas (nada de flex-wrap caótico).
function FilaMovil({ f }: { f: FilaVigente }) {
  return (
    <li className="py-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span translate="no" className="font-mono text-[13px] font-semibold text-[var(--fg-1)]">
            {f.ticker}
          </span>
          {f.posicion && <Badge color="var(--fg-3)">posición</Badge>}
        </span>
        <span className="shrink-0 text-[var(--fg-3)]">
          <Retorno v={f.retorno3m} /> a 3 m
        </span>
      </div>
      <dl className="mt-1.5 grid grid-cols-[52px_1fr] gap-y-1">
        <dt className="text-[var(--fg-3)]">Hoy</dt>
        <dd className="tabular-nums text-[var(--fg-2)]">{usd.format(f.precio)}</dd>
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
  return (
    <Panel titulo="Predicciones vigentes">
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">Sin tickers con histórico suficiente</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[var(--border-1)] md:hidden">
            {filas.map((f) => (
              <FilaMovil key={f.ticker} f={f} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-1)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Ticker
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Precio hoy
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    1 m · p50 [p10 – p90]
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    3 m · p50 [p10 – p90]
                  </th>
                  <th className="py-2 pr-0 text-right font-semibold" scope="col">
                    Retorno 3 m
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--fg-2)]">
                {filas.map((f) => (
                  <tr key={f.ticker} className="border-b border-[var(--border-1)]">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span translate="no" className="font-mono font-semibold text-[var(--fg-1)]">
                          {f.ticker}
                        </span>
                        {f.posicion && <Badge color="var(--fg-3)">posición</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{usd.format(f.precio)}</td>
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
      <p className="mt-[14px] text-xs text-[var(--fg-3)]">
        Mediana (p50) y banda central del 80% [p10 – p90], ordenadas por retorno mediano a 3 meses.
      </p>
    </Panel>
  )
}

'use client'
import type { Registro } from '@/lib/registroPredicciones'
import { fechaLarga, parseISO, pct, usd } from '@/app/componentes/ui/formatters'
import { Panel } from '@/app/componentes/ui/Panel'
import { Colapsable } from '@/app/componentes/ui/Colapsable'

function Estado({ r }: { r: Registro }) {
  if (r.resultado === null) return <span className="text-[var(--fg-3)]">pendiente</span>
  return (
    <span className="font-semibold" style={{ color: r.resultado.dentroBanda ? 'var(--good)' : 'var(--bad)' }}>
      {r.resultado.dentroBanda ? '✓ dentro' : '✗ fuera'} ·{' '}
      <span className="tabular-nums">{usd.format(r.resultado.precioReal)}</span>
    </span>
  )
}

function FilaMovil({ r }: { r: Registro }) {
  return (
    <li className="py-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span translate="no" className="font-mono text-[13px] font-semibold text-[var(--fg-1)]">
            {r.ticker}
          </span>{' '}
          <span className="text-[var(--fg-3)]">a {r.horizonte === '1m' ? '1 mes' : '3 meses'}</span>
        </span>
        <span className="shrink-0 text-right">
          <Estado r={r} />
        </span>
      </div>
      <p className="mt-1 tabular-nums text-[var(--fg-2)]">
        {usd.format(r.p50)}{' '}
        <span className="text-[var(--fg-3)]">
          [{usd.format(r.p10)} – {usd.format(r.p90)}]
        </span>
      </p>
      <p className="mt-0.5 text-[var(--fg-3)]">desde el {fechaLarga.format(parseISO(r.fechaOrigen))}</p>
    </li>
  )
}

export function Historial({ registros }: { registros: Registro[] }) {
  const orden = [...registros].sort(
    (a, b) =>
      b.fechaOrigen.localeCompare(a.fechaOrigen) ||
      a.ticker.localeCompare(b.ticker) ||
      a.horizonte.localeCompare(b.horizonte)
  )
  const vencidas = registros.filter((r) => r.resultado !== null)
  const dentro = vencidas.filter((r) => r.resultado !== null && r.resultado.dentroBanda).length
  const vencidasOrden = orden.filter((r) => r.resultado !== null)
  const pendientesOrden = orden.filter((r) => r.resultado === null)
  return (
    <Panel titulo="Historial de predicciones">
      {registros.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">Todavía no hay predicciones registradas</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-[var(--fg-1)]">
            {vencidas.length === 0 ? (
              'Ninguna predicción venció todavía.'
            ) : (
              <>
                De <span className="font-display tabular-nums font-semibold">{vencidas.length}</span> vencidas,{' '}
                <span className="font-display tabular-nums font-semibold">{dentro}</span> dentro de banda (
                <span className="tabular-nums">{pct.format(dentro / vencidas.length)}</span>, esperado ≈ 80%).
              </>
            )}
          </p>
          {/* Móvil: las vencidas (el resultado que importa) siempre a la vista;
              las pendientes — que en cada alta mensual son ~2 por ticker —
              agrupadas en un colapsable para no estirar la página. */}
          <div className="md:hidden">
            {vencidasOrden.length > 0 && (
              <ul className="flex flex-col divide-y divide-[var(--border-1)]">
                {vencidasOrden.map((r) => (
                  <FilaMovil key={`${r.ticker}-${r.horizonte}-${r.fechaOrigen}`} r={r} />
                ))}
              </ul>
            )}
            {pendientesOrden.length > 0 && (
              <Colapsable
                nivel={2}
                className={vencidasOrden.length > 0 ? 'mt-2 border-t border-[var(--border-1)] pt-1' : ''}
                resumen={
                  <span>
                    <span className="tabular-nums">{pendientesOrden.length}</span> pendientes
                  </span>
                }
              >
                <ul className="flex flex-col divide-y divide-[var(--border-1)]">
                  {pendientesOrden.map((r) => (
                    <FilaMovil key={`${r.ticker}-${r.horizonte}-${r.fechaOrigen}`} r={r} />
                  ))}
                </ul>
              </Colapsable>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-1)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Origen
                  </th>
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Ticker
                  </th>
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Horizonte
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Prometido p50 [p10 – p90]
                  </th>
                  <th className="py-2 pr-0 text-right font-semibold" scope="col">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--fg-2)]">
                {orden.map((r) => (
                  <tr key={`${r.ticker}-${r.horizonte}-${r.fechaOrigen}`} className="border-b border-[var(--border-1)]">
                    <td className="py-2 pr-3 whitespace-nowrap">{fechaLarga.format(parseISO(r.fechaOrigen))}</td>
                    <td translate="no" className="py-2 pr-3 font-mono font-semibold text-[var(--fg-1)]">
                      {r.ticker}
                    </td>
                    <td className="py-2 pr-3">{r.horizonte === '1m' ? '1 mes' : '3 meses'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {usd.format(r.p50)}{' '}
                      <span className="text-[var(--fg-3)]">
                        [{usd.format(r.p10)} – {usd.format(r.p90)}]
                      </span>
                    </td>
                    <td className="py-2 pr-0 text-right whitespace-nowrap">
                      <Estado r={r} />
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

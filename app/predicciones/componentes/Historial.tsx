'use client'
import type { Registro } from '@/lib/registroPredicciones'
import { fechaLarga, fechaTabla, parseISO, pct, usd } from '@/app/componentes/ui/formatters'
import { Panel } from '@/app/componentes/ui/Panel'
import { Colapsable } from '@/app/componentes/ui/Colapsable'

const num = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const horizonte = (r: Registro) => (r.horizonte === '1m' ? '1 mes' : '3 meses')
const clave = (r: Registro) => `${r.ticker}-${r.horizonte}-${r.fechaOrigen}`

// Resultado con texto + color (nunca color solo): "Dentro"/"Fuera" y el precio real.
function Estado({ r }: { r: Registro }) {
  if (r.resultado === null) {
    return (
      <span className="text-[var(--fg-3)]">
        Vence el <span className="font-mono">{fechaTabla.format(parseISO(r.fechaVencimiento))}</span>
      </span>
    )
  }
  const dentro = r.resultado.dentroBanda
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold" style={{ color: dentro ? 'var(--good)' : 'var(--bad)' }}>
        {dentro ? 'Dentro' : 'Fuera'}
      </span>{' '}
      <span className="font-mono text-[var(--fg-2)]">{usd.format(r.resultado.precioReal)}</span>
    </span>
  )
}

function Prometido({ r }: { r: Registro }) {
  return (
    <>
      <span className="font-mono text-[var(--fg-1)]">{usd.format(r.p50)}</span>{' '}
      <span className="ml-1.5 whitespace-nowrap font-mono text-[12px] text-[var(--fg-3)]">
        {num.format(r.p10)}–{num.format(r.p90)}
      </span>
    </>
  )
}

function FilaMovil({ r }: { r: Registro }) {
  return (
    <li className="py-2.5 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span translate="no" className="font-mono font-medium text-[var(--fg-1)]">
            {r.ticker}
          </span>{' '}
          <span className="text-[var(--fg-3)]">a {horizonte(r)}</span>
        </span>
        <span className="shrink-0 text-right">
          <Estado r={r} />
        </span>
      </div>
      <p className="mt-0.5">
        <Prometido r={r} />
      </p>
    </li>
  )
}

function TablaGrupo({ registros }: { registros: Registro[] }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-[var(--border-2)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">
          <th className="py-2 pr-3 font-semibold" scope="col">
            Ticker
          </th>
          <th className="py-2 pr-3 font-semibold" scope="col">
            Horizonte
          </th>
          <th className="py-2 pr-3 text-right font-semibold" scope="col">
            Prometido: p50 y banda p10–p90
          </th>
          <th className="py-2 pr-0 text-right font-semibold" scope="col">
            Resultado
          </th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={clave(r)} className="border-b border-[var(--border-1)] last:border-b-0">
            <th scope="row" translate="no" className="py-2 pr-3 text-left font-mono font-medium text-[var(--fg-1)]">
              {r.ticker}
            </th>
            <td className="py-2 pr-3 text-[var(--fg-2)]">{horizonte(r)}</td>
            <td className="py-2 pr-3 text-right whitespace-nowrap">
              <Prometido r={r} />
            </td>
            <td className="py-2 pr-0 text-right whitespace-nowrap">
              <Estado r={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Resumen de un grupo, visible con el colapsable cerrado.
function MetaGrupo({ registros }: { registros: Registro[] }) {
  const vencidas = registros.filter((r) => r.resultado !== null)
  const dentro = vencidas.filter((r) => r.resultado?.dentroBanda).length
  const pendientes = registros.length - vencidas.length
  return (
    <span className="text-right text-[12px] font-normal font-mono text-[var(--fg-3)]">
      {vencidas.length > 0 && (
        <>
          <span className="font-semibold text-[var(--fg-1)]">
            {dentro} de {vencidas.length}
          </span>{' '}
          dentro
        </>
      )}
      {vencidas.length > 0 && pendientes > 0 && <br className="sm:hidden" />}
      {vencidas.length > 0 && pendientes > 0 && <span className="hidden sm:inline"> · </span>}
      {pendientes > 0 && `${pendientes} pendientes`}
    </span>
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

  // Agrupado por fecha de origen (cada alta mensual registra ~2 predicciones
  // por ticker): cientos de filas pasan a ser un puñado de grupos.
  const grupos: { fecha: string; registros: Registro[] }[] = []
  for (const r of orden) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === r.fechaOrigen) ultimo.registros.push(r)
    else grupos.push({ fecha: r.fechaOrigen, registros: [r] })
  }
  // Abierto por defecto: el grupo más reciente que ya tiene resultados.
  const abierto = grupos.find((g) => g.registros.some((r) => r.resultado !== null))?.fecha

  return (
    <Panel titulo="Historial de predicciones">
      {registros.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">
          Todavía no hay predicciones registradas. Cada visita con históricos al día registra las predicciones
          vigentes; a medida que vencen, acá se ve si el precio real cayó dentro de la banda.
        </p>
      ) : (
        <>
          <p className="mb-4 max-w-[68ch] text-[14px] text-[var(--fg-2)]">
            {vencidas.length === 0 ? (
              'Ninguna predicción venció todavía.'
            ) : (
              <>
                De <span className="font-semibold tabular-nums text-[var(--fg-1)]">{vencidas.length}</span> vencidas,{' '}
                <span className="font-semibold tabular-nums text-[var(--fg-1)]">{dentro}</span> cayeron dentro de la
                banda (<span className="font-semibold tabular-nums text-[var(--fg-1)]">{pct.format(dentro / vencidas.length)}</span>;
                lo esperado es ≈ 80%).
              </>
            )}
          </p>
          <div className="border-b border-[var(--border-1)]">
            {grupos.map((g) => (
              <Colapsable
                key={g.fecha}
                nivel={2}
                abierto={g.fecha === abierto}
                className="border-t border-[var(--border-1)]"
                resumen={
                  <span className="text-[14px] text-[var(--fg-1)]">
                    <span className="sr-only">Predicciones del </span>
                    {fechaLarga.format(parseISO(g.fecha))}
                  </span>
                }
                meta={<MetaGrupo registros={g.registros} />}
              >
                <ul className="flex flex-col divide-y divide-[var(--border-1)] md:hidden">
                  {g.registros.map((r) => (
                    <FilaMovil key={clave(r)} r={r} />
                  ))}
                </ul>
                <div className="hidden md:block">
                  <TablaGrupo registros={g.registros} />
                </div>
              </Colapsable>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

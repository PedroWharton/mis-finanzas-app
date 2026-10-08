'use client'
import type { MetricasHorizonte } from '@/lib/evaluacionPredictor'
import { pct } from '@/app/componentes/ui/formatters'
import { Panel } from '@/app/componentes/ui/Panel'
import { Colapsable } from '@/app/componentes/ui/Colapsable'

// Advertencia OBLIGATORIA del spec: con paso 21 y h3m 63, orígenes
// consecutivos comparten ⅔ de la ventana a 3 meses.
const ADVERTENCIA_SUPERPOSICION =
  'Ventanas superpuestas: con paso mensual y horizonte de 3 meses, orígenes consecutivos comparten dos tercios de la ventana — unos 10 orígenes equivalen a ~3 observaciones independientes. Con n chico, diferencias chicas de error mediano NO son concluyentes: el veredicto "gana / no gana" es orientativo, no un test de significancia.'

// Versión sin nulls de EvaluacionTicker: la página solo pasa tickers con
// evaluación completa (los insuficientes van en la lista aparte).
export interface EvaluacionCompleta {
  ticker: string
  gana: boolean
  modelo: { m1: MetricasHorizonte; m3: MetricasHorizonte }
  baseline: { m1: MetricasHorizonte; m3: MetricasHorizonte }
}

const dir = (v: number | null) => (v === null ? '—' : pct.format(v))

function Veredicto({ gana }: { gana: boolean }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)]"
      style={{ color: gana ? 'var(--good)' : 'var(--bad)' }}
    >
      {gana ? 'gana' : 'no gana'}
    </span>
  )
}

// Móvil: colapsable por ticker — el veredicto (gana / no gana) se ve cerrado;
// al abrir, una mini-tabla de 3 columnas (métrica / modelo / baseline). Con
// ~30 tickers, las tarjetas abiertas harían la página interminable.
function TarjetaEvaluacion({ e, abierto }: { e: EvaluacionCompleta; abierto: boolean }) {
  const filas: { etiqueta: string; modelo: string; baseline: string }[] = [
    { etiqueta: 'Error 1 m', modelo: pct.format(e.modelo.m1.errorMediano), baseline: pct.format(e.baseline.m1.errorMediano) },
    { etiqueta: 'Error 3 m', modelo: pct.format(e.modelo.m3.errorMediano), baseline: pct.format(e.baseline.m3.errorMediano) },
    { etiqueta: 'Cobert. 1 m', modelo: pct.format(e.modelo.m1.cobertura), baseline: pct.format(e.baseline.m1.cobertura) },
    { etiqueta: 'Cobert. 3 m', modelo: pct.format(e.modelo.m3.cobertura), baseline: pct.format(e.baseline.m3.cobertura) },
    { etiqueta: 'Direc. 1 m', modelo: dir(e.modelo.m1.aciertoDireccional), baseline: dir(e.baseline.m1.aciertoDireccional) },
    { etiqueta: 'Direc. 3 m', modelo: dir(e.modelo.m3.aciertoDireccional), baseline: dir(e.baseline.m3.aciertoDireccional) },
  ]
  return (
    <Colapsable
      nivel={2}
      abierto={abierto}
      className="border-t border-[var(--border-1)] first:border-t-0"
      resumen={
        <span translate="no" className="font-mono text-[13px] font-semibold text-[var(--fg-1)]">
          {e.ticker}
        </span>
      }
      meta={
        <span className="text-xs text-[var(--fg-3)]">
          <Veredicto gana={e.gana} /> · n={e.modelo.m1.n}
        </span>
      }
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
            <th className="py-1 pr-2 text-left font-semibold" scope="col">
              Métrica
            </th>
            <th className="py-1 pr-2 text-right font-semibold" scope="col">
              Modelo
            </th>
            <th className="py-1 pr-0 text-right font-semibold" scope="col">
              Baseline
            </th>
          </tr>
        </thead>
        <tbody className="text-[var(--fg-2)]">
          {filas.map((f) => (
            <tr key={f.etiqueta} className="border-t border-[var(--border-1)]">
              <td className="py-1 pr-2 text-[var(--fg-3)]">{f.etiqueta}</td>
              <td className="py-1 pr-2 text-right tabular-nums font-semibold text-[var(--fg-1)]">{f.modelo}</td>
              <td className="py-1 pr-0 text-right tabular-nums">{f.baseline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Colapsable>
  )
}

function Celdas({ m }: { m: { m1: MetricasHorizonte; m3: MetricasHorizonte } }) {
  return (
    <>
      <td className="py-1.5 pr-3 text-right tabular-nums">{pct.format(m.m1.cobertura)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{pct.format(m.m3.cobertura)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{pct.format(m.m1.errorMediano)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{pct.format(m.m3.errorMediano)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{dir(m.m1.aciertoDireccional)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{dir(m.m3.aciertoDireccional)}</td>
      <td className="py-1.5 pr-0 text-right tabular-nums">{m.m1.n}</td>
    </>
  )
}

export function TablaEvaluacion({
  evaluaciones,
  insuficientes,
}: {
  evaluaciones: EvaluacionCompleta[]
  insuficientes: string[]
}) {
  return (
    <Panel titulo="Evaluación walk-forward">
      {evaluaciones.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">Ningún ticker tiene orígenes suficientes para evaluar todavía</p>
      ) : (
        <>
          <div className="flex flex-col md:hidden">
            {evaluaciones.map((e, i) => (
              <TarjetaEvaluacion key={e.ticker} e={e} abierto={i === 0} />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-1)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Ticker
                  </th>
                  <th className="py-2 pr-3 font-semibold" scope="col">
                    Motor
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Cobert. 1 m
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Cobert. 3 m
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Error 1 m
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Error 3 m
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Direc. 1 m
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold" scope="col">
                    Direc. 3 m
                  </th>
                  <th className="py-2 pr-0 text-right font-semibold" scope="col">
                    n
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--fg-2)]">
                {evaluaciones.map((e) => [
                  <tr key={`${e.ticker}-modelo`}>
                    <td rowSpan={2} className="py-1.5 pr-3 align-top">
                      <span translate="no" className="font-mono font-semibold text-[var(--fg-1)]">
                        {e.ticker}
                      </span>{' '}
                      <Veredicto gana={e.gana} />
                    </td>
                    <td className="py-1.5 pr-3 font-semibold text-[var(--fg-1)]">Modelo</td>
                    <Celdas m={e.modelo} />
                  </tr>,
                  <tr key={`${e.ticker}-baseline`} className="border-b border-[var(--border-1)]">
                    <td className="py-1.5 pr-3 text-[var(--fg-3)]">Baseline</td>
                    <Celdas m={e.baseline} />
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-[14px] text-xs text-[var(--fg-3)]">
        Cobertura ideal ≈ 80% (la banda p10–p90 debería contener el precio real 8 de cada 10 veces). Error =
        mediana de |real − p50| / precio de origen. El baseline no opina dirección (su p50 es el precio de
        origen); los empates del modelo se excluyen del denominador.
      </p>
      <p className="mt-2 text-xs text-[var(--fg-3)]">{ADVERTENCIA_SUPERPOSICION}</p>
      {insuficientes.length > 0 && (
        <p className="mt-2 text-xs text-[var(--fg-3)]">
          Evaluación insuficiente (menos de 4 orígenes):{' '}
          <span translate="no" className="font-mono">
            {insuficientes.join(', ')}
          </span>
        </p>
      )}
    </Panel>
  )
}

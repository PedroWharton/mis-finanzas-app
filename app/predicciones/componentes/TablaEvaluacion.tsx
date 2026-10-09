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

const claseTh = 'py-2 pr-3 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]'

function Veredicto({ gana }: { gana: boolean }) {
  return (
    <span className="whitespace-nowrap text-[13px] font-semibold" style={{ color: gana ? 'var(--good)' : 'var(--bad)' }}>
      {gana ? 'Gana' : 'No gana'}
    </span>
  )
}

// Celda "modelo frente a baseline": el valor del modelo manda; el del
// baseline queda al lado, más callado, para comparar sin cambiar de columna.
function Par({ modelo, baseline, apilado = false }: { modelo: string; baseline: string; apilado?: boolean }) {
  return (
    <span className={`font-mono ${apilado ? 'flex flex-col items-end leading-tight' : 'whitespace-nowrap'}`}>
      <span className="font-semibold text-[var(--fg-1)]">{modelo}</span>
      {!apilado && ' '}
      <span className={`text-[var(--fg-3)] ${apilado ? 'text-[11px]' : ''}`}>{baseline}</span>
    </span>
  )
}

// Móvil: columnas prioritarias. El veredicto se decide por error mediano a 1
// y 3 meses, así que eso va a la vista; cobertura y dirección, plegadas.
function TablaMovil({ evaluaciones }: { evaluaciones: EvaluacionCompleta[] }) {
  return (
    <div className="md:hidden">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Error mediano del modelo y del baseline por ticker</caption>
        <thead>
          <tr className="border-b border-[var(--border-2)] text-left">
            <th scope="col" className={claseTh}>
              Ticker
            </th>
            <th scope="col" className={`${claseTh} text-right`}>
              Error 1 m
            </th>
            <th scope="col" className={`${claseTh} text-right`}>
              Error 3 m
            </th>
            <th scope="col" className={`${claseTh} pr-0 text-right`}>
              <span className="sr-only">Veredicto</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {evaluaciones.map((e) => (
            <tr key={e.ticker} className="border-b border-[var(--border-1)]">
              <th scope="row" translate="no" className="py-2.5 pr-3 text-left font-mono text-[13px] font-medium text-[var(--fg-1)]">
                {e.ticker}
              </th>
              <td className="py-2.5 pr-3 text-right">
                <Par apilado modelo={pct.format(e.modelo.m1.errorMediano)} baseline={pct.format(e.baseline.m1.errorMediano)} />
              </td>
              <td className="py-2.5 pr-3 text-right">
                <Par apilado modelo={pct.format(e.modelo.m3.errorMediano)} baseline={pct.format(e.baseline.m3.errorMediano)} />
              </td>
              <td className="py-2.5 pr-0 text-right">
                <Veredicto gana={e.gana} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Colapsable nivel={2} className="mt-3" resumen="Cobertura y acierto direccional">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border-2)] text-left">
              <th scope="col" className={claseTh}>
                Ticker
              </th>
              <th scope="col" className={`${claseTh} text-right`}>
                Cob. 1 m
              </th>
              <th scope="col" className={`${claseTh} text-right`}>
                Cob. 3 m
              </th>
              <th scope="col" className={`${claseTh} text-right`}>
                Dir. 1 m
              </th>
              <th scope="col" className={`${claseTh} pr-0 text-right`}>
                Dir. 3 m
              </th>
            </tr>
          </thead>
          <tbody>
            {evaluaciones.map((e) => (
              <tr key={e.ticker} className="border-b border-[var(--border-1)]">
                <th scope="row" translate="no" className="py-2 pr-2 text-left font-mono text-[12px] font-medium text-[var(--fg-1)]">
                  {e.ticker}
                </th>
                <td className="py-2 pr-2 text-right">
                  <Par apilado modelo={pct.format(e.modelo.m1.cobertura)} baseline={pct.format(e.baseline.m1.cobertura)} />
                </td>
                <td className="py-2 pr-2 text-right">
                  <Par apilado modelo={pct.format(e.modelo.m3.cobertura)} baseline={pct.format(e.baseline.m3.cobertura)} />
                </td>
                <td className="py-2 pr-2 text-right font-mono text-[var(--fg-2)]">{dir(e.modelo.m1.aciertoDireccional)}</td>
                <td className="py-2 pr-0 text-right font-mono text-[var(--fg-2)]">{dir(e.modelo.m3.aciertoDireccional)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Colapsable>
    </div>
  )
}

function TablaEscritorio({ evaluaciones }: { evaluaciones: EvaluacionCompleta[] }) {
  const grupo = 'border-l border-[var(--border-1)] pl-4'
  return (
    <div className="hidden md:block">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Evaluación walk-forward del modelo frente al baseline por ticker</caption>
        <thead>
          <tr className="text-left">
            <th scope="col" rowSpan={2} className={`${claseTh} align-bottom`}>
              Ticker
            </th>
            <th scope="col" rowSpan={2} className={`${claseTh} align-bottom`}>
              Veredicto
            </th>
            <th scope="colgroup" colSpan={2} className={`${claseTh} ${grupo} pb-0 text-[var(--fg-2)]`}>
              Error mediano
            </th>
            <th scope="colgroup" colSpan={2} className={`${claseTh} ${grupo} pb-0 text-[var(--fg-2)]`}>
              Cobertura p10–p90
            </th>
            <th scope="colgroup" colSpan={2} className={`${claseTh} ${grupo} pb-0 text-[var(--fg-2)]`}>
              Acierto direccional
            </th>
            <th scope="col" rowSpan={2} className={`${claseTh} pr-0 text-right align-bottom`}>
              n
            </th>
          </tr>
          <tr className="border-b border-[var(--border-2)]">
            <th scope="col" className={`${claseTh} ${grupo} text-right font-medium`}>
              1 m
            </th>
            <th scope="col" className={`${claseTh} text-right font-medium`}>
              3 m
            </th>
            <th scope="col" className={`${claseTh} ${grupo} text-right font-medium`}>
              1 m
            </th>
            <th scope="col" className={`${claseTh} text-right font-medium`}>
              3 m
            </th>
            <th scope="col" className={`${claseTh} ${grupo} text-right font-medium`}>
              1 m
            </th>
            <th scope="col" className={`${claseTh} text-right font-medium`}>
              3 m
            </th>
          </tr>
        </thead>
        <tbody>
          {evaluaciones.map((e) => (
            <tr key={e.ticker} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-sunken)]">
              <th scope="row" translate="no" className="py-2 pr-3 text-left font-mono font-medium text-[var(--fg-1)]">
                {e.ticker}
              </th>
              <td className="py-2 pr-3">
                <Veredicto gana={e.gana} />
              </td>
              <td className={`py-2 pr-3 text-right ${grupo}`}>
                <Par modelo={pct.format(e.modelo.m1.errorMediano)} baseline={pct.format(e.baseline.m1.errorMediano)} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Par modelo={pct.format(e.modelo.m3.errorMediano)} baseline={pct.format(e.baseline.m3.errorMediano)} />
              </td>
              <td className={`py-2 pr-3 text-right ${grupo}`}>
                <Par modelo={pct.format(e.modelo.m1.cobertura)} baseline={pct.format(e.baseline.m1.cobertura)} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Par modelo={pct.format(e.modelo.m3.cobertura)} baseline={pct.format(e.baseline.m3.cobertura)} />
              </td>
              <td className={`py-2 pr-3 text-right font-mono text-[var(--fg-2)] ${grupo}`}>
                {dir(e.modelo.m1.aciertoDireccional)}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-[var(--fg-2)]">{dir(e.modelo.m3.aciertoDireccional)}</td>
              <td className="py-2 pr-0 text-right font-mono text-[var(--fg-3)]">{e.modelo.m1.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        <p className="text-sm text-[var(--fg-2)]">
          Ningún ticker tiene orígenes suficientes para evaluar todavía. La evaluación aparece cuando la serie
          acumula al menos 4 orígenes mensuales.
        </p>
      ) : (
        <>
          <p className="mb-4 max-w-[68ch] text-[13px] text-[var(--fg-2)]">
            En cada celda, el primer valor es el <span className="font-semibold text-[var(--fg-1)]">modelo</span> y
            el segundo, más tenue, el <span className="text-[var(--fg-3)]">baseline</span>. El modelo gana un ticker
            cuando su error mediano es menor a 1 y a 3 meses.
          </p>
          <TablaMovil evaluaciones={evaluaciones} />
          <TablaEscritorio evaluaciones={evaluaciones} />
        </>
      )}
      <div className="mt-4 flex max-w-[78ch] flex-col gap-2 text-xs leading-relaxed text-[var(--fg-3)]">
        <p>
          Cobertura ideal ≈ 80% (la banda p10–p90 debería contener el precio real 8 de cada 10 veces). Error =
          mediana de |real − p50| / precio de origen. El baseline no opina dirección (su p50 es el precio de
          origen); los empates del modelo se excluyen del denominador.
        </p>
        <p>{ADVERTENCIA_SUPERPOSICION}</p>
        {insuficientes.length > 0 && (
          <p>
            Evaluación insuficiente (menos de 4 orígenes):{' '}
            <span translate="no" className="font-mono">
              {insuficientes.join(', ')}
            </span>
          </p>
        )}
      </div>
    </Panel>
  )
}

'use client'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PuntoBanda } from '@/lib/proyeccion'
import { Panel } from '@/app/componentes/ui/Panel'
import { pct, usd, usdEntero } from '@/app/componentes/ui/formatters'

export interface ResumenCarteraProps {
  valorTotal: number
  volCartera: number
  sharpeCartera: number
  drawdownCartera: number
  proyeccionCartera: PuntoBanda[]
}

function Kpi({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
        {label}
      </p>
      <p
        className="font-display mt-1.5 text-[26px] font-medium leading-none tabular-nums text-[var(--fg-1)] sm:text-[28px]"
        style={color ? { color } : undefined}
      >
        {valor}
      </p>
    </div>
  )
}

export function ResumenCartera({ valorTotal, volCartera, sharpeCartera, drawdownCartera, proyeccionCartera }: ResumenCarteraProps) {
  return (
    <Panel titulo="Resumen de cartera" className="revela">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 max-[480px]:grid-cols-1 sm:grid-cols-4">
        <Kpi label="Valor total" valor={usdEntero.format(valorTotal)} />
        <Kpi label="Volatilidad anual" valor={pct.format(volCartera)} />
        <Kpi
          label="Max drawdown"
          valor={`−${pct.format(Math.abs(drawdownCartera))}`}
          color="var(--bad)"
        />
        <Kpi label="Sharpe" valor={sharpeCartera.toFixed(2)} />
      </div>
      <div
        className="mt-6 h-72"
        role="img"
        aria-label="Proyección Monte Carlo del valor de la cartera a 6 meses: banda p10–p90 y mediana, en USD"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={proyeccionCartera.map((pt) => ({
              dia: pt.dia,
              banda: [pt.p10, pt.p90],
              p50: pt.p50,
            }))}
            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--border-1)" vertical={false} />
            <XAxis
              dataKey="dia"
              stroke="var(--border-2)"
              tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono-wb)' }}
              tickLine={false}
              label={{ value: 'Días hábiles', position: 'insideBottom', offset: -2, fill: 'var(--fg-3)', fontSize: 11 }}
            />
            <YAxis
              stroke="var(--border-2)"
              tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono-wb)' }}
              tickLine={false}
              tickFormatter={(v: number) => usdEntero.format(v)}
              width={72}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'banda' && Array.isArray(value)) {
                  return [`${usd.format(Number(value[0]))} – ${usd.format(Number(value[1]))}`, 'p10 – p90']
                }
                return [usd.format(Number(value)), 'Mediana']
              }}
              contentStyle={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-1)',
                borderRadius: 6,
                color: 'var(--fg-1)',
                fontSize: 12,
                boxShadow: 'var(--shadow-sm)',
              }}
            />
            <Area
              type="monotone"
              dataKey="banda"
              name="banda"
              stroke="none"
              fill="var(--chart-1)"
              fillOpacity={0.14}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="p50"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-[14px] text-xs text-[var(--fg-3)]">
        Proyección Monte Carlo a 6 meses (126 días hábiles): banda p10–p90 y mediana.
      </p>
    </Panel>
  )
}

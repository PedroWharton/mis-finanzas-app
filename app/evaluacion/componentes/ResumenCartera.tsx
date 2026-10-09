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
import { pct, ratio, usd } from '@/app/componentes/ui/formatters'
import { grilla, miles, tickCifra, tickEje, tooltipCaja, tooltipCursor, tooltipRotulo } from '@/app/componentes/ui/graficos'

// El valor total ya está en el masthead: acá van solo las métricas de riesgo.

export interface ResumenCarteraProps {
  volCartera: number
  sharpeCartera: number
  drawdownCartera: number
  proyeccionCartera: PuntoBanda[]
}

function Kpi({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">{label}</p>
      <p
        className="font-display mt-2 text-[26px] font-medium leading-none tracking-[-0.015em] text-[var(--fg-1)] sm:text-[30px]"
        style={color ? { color } : undefined}
      >
        {valor}
      </p>
    </div>
  )
}

export function ResumenCartera({ volCartera, sharpeCartera, drawdownCartera, proyeccionCartera }: ResumenCarteraProps) {
  return (
    <Panel
      titulo="Resumen de cartera"
      ayuda="Proyección Monte Carlo a 6 meses (126 días hábiles): la línea es la mediana; la banda, el rango p10–p90."
    >
      <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:max-w-[640px]">
        <Kpi label="Volatilidad anual" valor={pct.format(volCartera)} />
        <Kpi
          label="Max drawdown"
          valor={`−${pct.format(Math.abs(drawdownCartera))}`}
          color="var(--bad)"
        />
        <Kpi label="Sharpe" valor={ratio.format(sharpeCartera)} />
      </div>
      <div
        className="mt-6 h-64"
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
            margin={{ top: 8, right: 0, left: 4, bottom: 14 }}
          >
            <CartesianGrid {...grilla} />
            <XAxis
              dataKey="dia"
              axisLine={false}
              tick={tickEje}
              tickLine={false}
              label={{ value: 'Días hábiles desde hoy', position: 'insideBottom', offset: -10, fill: 'var(--fg-3)', fontSize: 11 }}
            />
            <YAxis
              orientation="right"
              axisLine={false}
              tick={tickCifra}
              tickLine={false}
              tickFormatter={miles}
              width={44}
              domain={['auto', 'auto']}
            />
            <Tooltip
              labelFormatter={(d) => `Día hábil ${d}`}
              formatter={(value, name) => {
                if (name === 'banda' && Array.isArray(value)) {
                  return [`${usd.format(Number(value[0]))} – ${usd.format(Number(value[1]))}`, 'p10 – p90']
                }
                return [usd.format(Number(value)), 'Mediana']
              }}
              contentStyle={tooltipCaja}
              labelStyle={tooltipRotulo}
              cursor={tooltipCursor}
            />
            <Area
              type="monotone"
              dataKey="banda"
              name="banda"
              stroke="none"
              fill="var(--chart-1)"
              fillOpacity={0.12}
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
    </Panel>
  )
}

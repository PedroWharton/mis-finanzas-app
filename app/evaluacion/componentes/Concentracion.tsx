'use client'
import { Panel, Swatch } from '@/app/componentes/ui/Panel'
import { COLOR_TIPO, COLORES_PLATAFORMA } from '@/app/componentes/ui/colores'
import { pct, usd } from '@/app/componentes/ui/formatters'
import { type PosicionInfo } from './compartido'

export interface ConcentracionProps {
  posiciones: PosicionInfo[]
  plataformas: [string, number][]
  valorTotal: number
}

function Fila({
  nombre,
  valor,
  proporcion,
  color,
}: {
  nombre: string
  valor: number
  proporcion: number
  color: string
}) {
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-baseline gap-2 font-medium text-[var(--fg-1)]">
          <Swatch color={color} />
          <span className="min-w-0 break-words">{nombre}</span>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-[var(--fg-2)]">
          {usd.format(valor)} ·{' '}
          <span className="text-[var(--fg-1)]">{pct.format(proporcion)}</span>
        </span>
      </div>
      <div className="mt-1 h-[6px] w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]">
        <div
          className="h-full rounded-[var(--radius-pill)]"
          style={{ width: `${Math.min(100, proporcion * 100)}%`, background: color }}
        />
      </div>
    </li>
  )
}

export function Concentracion({ posiciones, plataformas, valorTotal }: ConcentracionProps) {
  return (
    <Panel titulo="Concentración">
      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">
            Por posición
          </h3>
          <ul className="flex flex-col gap-3">
            {posiciones.map((p) => (
              <Fila
                key={p.clave}
                nombre={p.nombre}
                valor={p.valorUSD}
                proporcion={valorTotal > 0 ? p.valorUSD / valorTotal : 0}
                color={COLOR_TIPO[p.tipo]}
              />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">
            Por plataforma
          </h3>
          <ul className="flex flex-col gap-3">
            {plataformas.map(([nombre, valor], i) => (
              <Fila
                key={nombre}
                nombre={nombre}
                valor={valor}
                proporcion={valorTotal > 0 ? valor / valorTotal : 0}
                color={COLORES_PLATAFORMA[i % COLORES_PLATAFORMA.length]}
              />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

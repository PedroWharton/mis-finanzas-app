'use client'
import { Panel } from '@/app/componentes/ui/Panel'

export function Alertas({ alertas }: { alertas: string[] }) {
  return (
    <Panel titulo="Alertas" className="revela">
      {alertas.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">Sin alertas activas</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alertas.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--fg-1)]">
              <span
                aria-hidden="true"
                className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-[var(--radius-pill)]"
                style={{ background: 'var(--bordeaux-500)' }}
              />
              {a}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

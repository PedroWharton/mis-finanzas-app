// Tarjeta del cuaderno: papel un tono más claro, filete de 1 px, sombra de
// papel apoyado y título en serif. La ayuda va colapsada al pie.
import { Ayuda } from './Ayuda'

export const clasePanel =
  'rounded-[var(--radius-lg)] border border-[var(--border-1)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'

export function Panel({
  titulo,
  accion,
  ayuda,
  children,
  className = '',
  id,
}: {
  titulo: React.ReactNode
  accion?: React.ReactNode
  /** Texto de "¿Cómo se calcula?"; queda colapsado por defecto. */
  ayuda?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section aria-labelledby={id} className={`${clasePanel} p-4 sm:p-6 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-4 px-1 sm:mb-4">
        <h2 id={id} className="titulo-seccion">
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
      {ayuda && (
        <div className="px-1">
          <Ayuda>{ayuda}</Ayuda>
        </div>
      )}
    </section>
  )
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}

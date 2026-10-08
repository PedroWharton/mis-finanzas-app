export function Panel({
  titulo,
  accion,
  children,
  className = '',
}: {
  titulo: string
  accion?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`panel-wb rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] p-5 sm:p-7 shadow-[var(--shadow-xs)] ${className}`}
    >
      <div className="panel-cabecera mb-[18px] flex items-baseline justify-between gap-4">
        <h2 className="etiqueta">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-[var(--radius-xs)]"
      style={{ background: color }}
    />
  )
}

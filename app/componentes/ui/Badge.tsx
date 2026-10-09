// Pill chico para veredictos, acciones y tipos de corrida.
export function Badge({
  color,
  children,
  className = '',
}: {
  color: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-[3px] text-[11px] leading-none font-semibold uppercase tracking-[var(--ls-wide)] ${className}`}
      style={{ color, borderColor: 'color-mix(in srgb, currentcolor 40%, transparent)' }}
    >
      {children}
    </span>
  )
}

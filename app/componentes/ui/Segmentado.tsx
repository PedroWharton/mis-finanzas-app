// Selector de dos o tres opciones en pill con borde de tinta (USD / ARS, etc.).
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className = '',
}: {
  opciones: readonly { valor: T; label: string }[]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={`inline-flex rounded-[var(--radius-pill)] border-[1.5px] border-[var(--border-ink)] p-[3px] text-[13px] font-medium ${className}`}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.valor)}
            className={`min-h-9 min-w-[52px] rounded-[var(--radius-pill)] px-3 transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
              activo ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

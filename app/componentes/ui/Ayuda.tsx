// Ayuda colapsada por defecto: el usuario ya sabe leer su app; la explicación
// queda a un toque, sin ocupar lugar.
export function Ayuda({
  children,
  resumen = '¿Cómo se calcula?',
  enFranja = false,
  className = '',
}: {
  children: React.ReactNode
  resumen?: string
  /** Sobre la franja oscura de "Hoy". */
  enFranja?: boolean
  className?: string
}) {
  const tono = enFranja ? 'text-[var(--band-ink-3)]' : 'text-[var(--fg-3)]'
  return (
    <details className={`group mt-2 ${className}`}>
      <summary
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-xs)] text-[13px] transition-colors duration-[var(--dur-fast)] hover:text-[var(--mark-text)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] [&::-webkit-details-marker]:hidden ${tono}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        {resumen}
      </summary>
      <div className={`max-w-[62ch] pb-1 text-[13px] leading-relaxed ${tono}`}>{children}</div>
    </details>
  )
}

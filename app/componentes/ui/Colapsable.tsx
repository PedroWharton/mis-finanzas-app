// Patrón único de details/summary de la app. Máximo 2 niveles anidados:
// nivel 1 = bloque (tarjeta, summary fuerte), nivel 2 = detalle (summary suave).
export function Colapsable({
  resumen,
  meta,
  nivel = 1,
  abierto = false,
  children,
  className = '',
}: {
  resumen: React.ReactNode
  meta?: React.ReactNode
  nivel?: 1 | 2
  abierto?: boolean
  children: React.ReactNode
  className?: string
}) {
  const estiloResumen =
    nivel === 1
      ? 'text-[15px] font-semibold text-[var(--fg-1)]'
      : 'text-[13px] font-semibold text-[var(--fg-2)]'
  return (
    <details
      open={abierto || undefined}
      className={`group ${
        nivel === 1
          ? 'rounded-[var(--radius-lg)] border border-[var(--border-1)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'
          : ''
      } ${className}`}
    >
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-lg)] ${
          nivel === 1 ? 'px-4 py-3 sm:px-5' : 'py-2'
        } select-none focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] [&::-webkit-details-marker]:hidden`}
      >
        <span className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 ${estiloResumen}`}>
          {resumen}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {meta}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-[var(--fg-3)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 6 8 10.5 12.5 6" />
          </svg>
        </span>
      </summary>
      <div className={nivel === 1 ? 'border-t border-[var(--border-1)] px-4 py-4 sm:px-5' : 'pb-2'}>
        {children}
      </div>
    </details>
  )
}

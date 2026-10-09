// Gestos del marcador dorado. Son el único acento de la app: se usan para lo
// importante y nada más (un subrayado, un resaltado, una anotación al margen).

/** Subrayado a mano alzada debajo de una cifra; se dibuja al entrar. */
export function Subrayado({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 14"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-[9px] left-[-3%] h-[12px] w-[106%] overflow-visible"
      >
        <path
          className="trazo"
          style={{ ['--largo' as string]: 230 }}
          d="M2 9.5C30 5 61 4.2 95 5.6c30 1.2 58 2.4 103-1.4"
          fill="none"
          stroke="var(--mark)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

/** Resaltador: fondo dorado detrás de un texto corto (ticker, estado vivo). */
export function Resaltado({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block rounded-[var(--radius-xs)] bg-[var(--mark-fill)] px-1.5 font-semibold text-[var(--navy-900)] ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Anotación al margen, escrita a mano, con una flecha hacia abajo a la derecha.
 * Máximo una por pantalla y solo para algo útil; nunca para datos de precisión.
 */
export function Anotacion({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-end gap-1 ${className}`}>
      <span className="font-mano text-[24px] font-medium leading-[1.05] text-[var(--mark-text)]">{children}</span>
      <svg aria-hidden="true" viewBox="0 0 60 48" className="h-10 w-12 shrink-0">
        <path
          className="trazo"
          style={{ ['--largo' as string]: 90 }}
          d="M6 6c4 20 16 32 40 34"
          fill="none"
          stroke="var(--mark)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          className="trazo"
          style={{ ['--largo' as string]: 30 }}
          d="M38 33l9 7-10 5"
          fill="none"
          stroke="var(--mark)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </p>
  )
}

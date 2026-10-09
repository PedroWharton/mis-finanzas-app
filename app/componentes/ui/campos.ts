// Clases compartidas de campos, botones y tablas.
export const claseInput =
  'min-h-11 rounded-[var(--radius-md)] border border-[var(--border-2)] bg-[var(--bg-surface)] px-3 py-2 text-[16px] sm:text-[14px] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--fg-3)] focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-60'

// Botón principal: pill de tinta llena. Uno por pantalla.
export const claseBotonPrimario =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 py-2 text-[14px] font-semibold text-[var(--on-accent)] no-underline transition-[background-color,transform] duration-[var(--dur-base)] active:translate-y-px hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-60'

// Botón secundario: pill con borde de tinta sobre el papel.
export const claseBotonSecundario =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--border-ink)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--fg-1)] no-underline transition-[background-color,transform] duration-[var(--dur-base)] active:translate-y-px hover:bg-[var(--bg-sunken)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-60'

// Acción de texto: subrayado dorado, para "Ver más" y similares.
export const claseBotonTexto =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-xs)] text-[14px] font-medium text-[var(--fg-1)] underline decoration-[var(--mark)] decoration-[1.5px] underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-[var(--mark-text)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]'

// Gramática de tablas: rótulo chico en mayúsculas, filetes de 1 px, cifras
// tabulares en mono alineadas a la derecha. Jerarquía por tamaño, no por negrita.
export const claseTh = 'pb-2 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]'
export const claseFila = 'border-t border-[var(--border-1)]'
export const claseCifra = 'font-mono text-right text-[13px] tabular-nums'

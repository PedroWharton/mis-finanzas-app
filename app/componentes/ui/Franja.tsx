// La franja oscura: el único bloque navy de la app, reservado para lo que está
// vivo hoy. A sangre en el celular, con radio en pantallas anchas.
export function Franja({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section
      {...props}
      className={`color-exacto border-y border-[var(--band-edge)] bg-[var(--band)] px-5 pb-4 pt-5 text-[var(--band-ink)] md:rounded-[var(--radius-lg)] md:border-x md:px-7 ${className}`}
    >
      {children}
    </section>
  )
}

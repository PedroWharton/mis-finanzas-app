'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Íconos propios (trazo 1.6, 24px) — sin librería externa, coherentes con el sistema.
const ICONOS: Record<string, React.ReactNode> = {
  '/': (
    <path d="M4 11.5 12 4.5l8 7M6 10v9.5h4.5V14h3v5.5H18V10" />
  ),
  '/evaluacion': (
    <path d="M4 19.5h16M6.5 16v-5M11 16V6.5M15.5 16v-8M20 16V9.5" />
  ),
  '/predicciones': (
    <path d="M4 17.5 9 12l3.5 3.5L20 7m0 0h-5m5 0v5" />
  ),
  '/recomendaciones': (
    <path d="M12 4.5v2M6.7 6.7l1.4 1.4M4.5 12h2M17.5 12h2M15.9 8.1l1.4-1.4M9.5 18.5h5M10 15.8a4.5 4.5 0 1 1 4 0c-.6.4-1 .9-1 1.7h-2c0-.8-.4-1.3-1-1.7Z" />
  ),
  '/reporte': (
    <path d="M7 3.5h7l4 4v13H7zM13.5 3.5V8H18M9.5 12h5M9.5 15.5h5" />
  ),
  '/movimientos': (
    <path d="M8 4.5v11m0 0-3-3m3 3 3-3M16 19.5v-11m0 0-3 3m3-3 3 3" />
  ),
}

const SECCIONES = [
  { href: '/', label: 'Inicio' },
  { href: '/movimientos', label: 'Movim.' },
  { href: '/evaluacion', label: 'Evaluación' },
  { href: '/predicciones', label: 'Predicc.' },
  { href: '/recomendaciones', label: 'Consejos' },
  { href: '/reporte', label: 'Reporte' },
]

const LABEL_LARGO: Record<string, string> = {
  '/recomendaciones': 'Recomendaciones',
  '/movimientos': 'Movimientos',
  '/predicciones': 'Predicciones',
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--navy-800)] bg-[var(--navy-900)] pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-[520px] list-none items-stretch px-1">
        {SECCIONES.map((s) => {
          const activo = pathname === s.href
          return (
            <li key={s.href} className="min-w-0 flex-1">
              <Link
                href={s.href}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 py-1.5 no-underline transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                  activo
                    ? 'text-[var(--gold-300)]'
                    : 'text-[var(--fg-hero-muted)] hover:text-[var(--fg-on-hero)]'
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[22px] w-[22px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONOS[s.href]}
                </svg>
                <span className="max-w-full truncate text-[11px] font-semibold">{s.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Índice lateral de escritorio: navegación numerada estilo estado de cuenta.
function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col bg-[var(--navy-900)] md:flex print:hidden">
      <div className="px-7 pb-6 pt-9">
        <p
          className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)]"
          style={{ color: 'var(--gold-300)' }}
        >
          Panel privado
        </p>
        <p className="font-display mt-2 text-[24px] font-medium leading-tight text-[var(--fg-on-hero)]">
          Mis Finanzas
        </p>
        <div aria-hidden="true" className="filete-dorado mt-5" />
      </div>
      <nav aria-label="Secciones principales" className="flex-1 px-4">
        <ul className="flex list-none flex-col gap-1">
          {SECCIONES.map((s, i) => {
            const activo = pathname === s.href
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`group flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border-l-2 px-3 py-2.5 no-underline transition-all duration-[var(--dur-base)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                    activo
                      ? 'border-[var(--gold-500)] bg-[var(--navy-800)] text-[var(--fg-on-hero)]'
                      : 'border-transparent text-[var(--fg-hero-muted)] hover:translate-x-0.5 hover:text-[var(--fg-on-hero)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`font-mono text-[11px] ${activo ? 'text-[var(--gold-300)]' : 'text-[var(--navy-400)] group-hover:text-[var(--gold-300)]'} transition-colors duration-[var(--dur-base)]`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[13.5px] font-semibold">
                    {LABEL_LARGO[s.href] ?? s.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <p className="px-7 pb-8 text-[11px] leading-relaxed text-[var(--navy-400)]">
        {/* Sello del sistema: el mismo monograma serif del ícono de la app. */}
        <span
          aria-hidden="true"
          className="font-display block text-[17px] font-medium tracking-[-0.02em]"
          style={{ color: 'var(--gold-300)' }}
        >
          MF
        </span>
        Mis Finanzas
      </p>
    </aside>
  )
}

export function AppShell({
  titulo,
  eyebrow = 'Mis finanzas',
  dato,
  ancha = false,
  children,
}: {
  titulo: string
  eyebrow?: string
  /** Dato clave de la página, se renderiza dentro de la placa navy del masthead. */
  dato?: React.ReactNode
  /** Habilita xl:max-w-[1440px] para páginas con tablas anchas. */
  ancha?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const contenedor = `mx-auto w-full max-w-[1080px] px-5 sm:px-8 ${ancha ? 'xl:max-w-[1360px]' : ''}`
  const masthead = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <p
          className="text-[12px] font-semibold uppercase tracking-[var(--ls-eyebrow)]"
          style={{ color: 'var(--fg-hero-muted)' }}
        >
          {eyebrow}
        </p>
        <div aria-hidden="true" className="filete-dorado hidden w-24 md:block" />
      </div>
      <h1 className="font-display mt-3 text-[26px] font-medium leading-tight tracking-[-0.01em] text-[var(--fg-on-hero)] sm:text-[34px] md:text-[38px]">
        {titulo}
      </h1>
      {dato && <div className="mt-4">{dato}</div>}
    </>
  )
  return (
    <div className="flex min-h-full flex-1 md:min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--bg-surface)] focus:px-4 focus:py-2 focus:text-[var(--fg-1)] focus:[box-shadow:var(--ring-focus)]"
      >
        Saltar al contenido
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: header navy full-bleed. Desktop: placa navy dentro del contenido. */}
        <header className="bg-[var(--bg-hero)] pt-[env(safe-area-inset-top)] md:hidden print:hidden">
          <div className={`${contenedor} pb-7 pt-6`}>{masthead}</div>
        </header>
        <div className={`${contenedor} hidden md:block print:hidden`}>
          <header className="revela mt-9 rounded-[var(--radius-md)] bg-[var(--bg-hero)] px-9 py-8 shadow-[var(--shadow-sm)]">
            {masthead}
          </header>
        </div>
        <main
          id="contenido"
          className={`${contenedor} contenido-editorial flex-1 pb-28 pt-7 md:pb-16 md:pt-8 print:pb-0 print:pt-0`}
        >
          {children}
        </main>
      </div>
      <TabBar pathname={pathname} />
    </div>
  )
}

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/app/componentes/ui/Logo'

// Íconos propios (trazo 1.6, 24px) — sin librería externa, coherentes con el sistema.
const ICONOS: Record<string, React.ReactNode> = {
  '/': <path d="M4 11.5 12 4.5l8 7M6 10v9.5h4.5V14h3v5.5H18V10" />,
  '/evaluacion': <path d="M4 19.5h16M6.5 16v-5M11 16V6.5M15.5 16v-8M20 16V9.5" />,
  '/predicciones': <path d="M4 17.5 9 12l3.5 3.5L20 7m0 0h-5m5 0v5" />,
  '/recomendaciones': (
    <path d="M12 4.5v2M6.7 6.7l1.4 1.4M4.5 12h2M17.5 12h2M15.9 8.1l1.4-1.4M9.5 18.5h5M10 15.8a4.5 4.5 0 1 1 4 0c-.6.4-1 .9-1 1.7h-2c0-.8-.4-1.3-1-1.7Z" />
  ),
  '/reporte': <path d="M7 3.5h7l4 4v13H7zM13.5 3.5V8H18M9.5 12h5M9.5 15.5h5" />,
  '/movimientos': <path d="M8 4.5v11m0 0-3-3m3 3 3-3M16 19.5v-11m0 0-3 3m3-3 3 3" />,
}

const SECCIONES = [
  { href: '/', label: 'Inicio' },
  { href: '/movimientos', label: 'Movimientos' },
  { href: '/evaluacion', label: 'Evaluación' },
  { href: '/predicciones', label: 'Predicciones' },
  { href: '/recomendaciones', label: 'Consejos' },
  { href: '/reporte', label: 'Reporte' },
]

const LABEL_LARGO: Record<string, string> = {
  '/recomendaciones': 'Recomendaciones',
}

function Icono({ href, className }: { href: string; className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONOS[href]}
    </svg>
  )
}

// Celular: barra flotante en pill con borde de tinta. La sección activa se
// ensancha y muestra su nombre; el resto queda en ícono con nombre accesible.
function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 md:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-[480px] list-none items-stretch gap-0.5 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-float)]">
        {SECCIONES.map((s) => {
          const activo = pathname === s.href
          return (
            <li
              key={s.href}
              className={`min-w-0 transition-[flex-grow] duration-[var(--dur-base)] ease-[var(--ease-out)] ${activo ? 'flex-[3]' : 'flex-1'}`}
            >
              <Link
                href={s.href}
                aria-current={activo ? 'page' : undefined}
                aria-label={activo ? undefined : LABEL_LARGO[s.href] ?? s.label}
                className={`flex min-h-12 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] px-2 no-underline transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                  activo
                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                    : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'
                }`}
              >
                <Icono href={s.href} className="h-5 w-5 shrink-0" />
                {activo && <span className="truncate text-[13px] font-semibold">{s.label}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Escritorio: índice lateral sobre papel hundido, con el logo y su filete.
function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-[var(--border-1)] bg-[var(--bg-sunken)] md:flex print:hidden">
      <div className="px-6 pb-7 pt-8">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <Logo size={40} />
          <span className="font-display text-[20px] font-medium leading-tight tracking-[-0.01em] text-[var(--fg-1)]">
            Mis Finanzas
          </span>
        </Link>
      </div>
      <nav aria-label="Secciones principales" className="flex-1 px-3">
        <ul className="flex list-none flex-col gap-1">
          {SECCIONES.map((s) => {
            const activo = pathname === s.href
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-pill)] px-4 py-2 no-underline transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                    activo
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'text-[var(--fg-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-1)]'
                  }`}
                >
                  <Icono href={s.href} className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[14px] font-medium">{LABEL_LARGO[s.href] ?? s.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="px-6 pb-8">
        <div aria-hidden="true" className="filete-dorado w-16" />
      </div>
    </aside>
  )
}

export function AppShell({
  titulo,
  tituloVisible = true,
  dato,
  acciones,
  ancha = false,
  children,
}: {
  titulo: string
  /** Inicio lo oculta: ahí la página la encabeza el patrimonio. */
  tituloVisible?: boolean
  /** Dato clave de la página, debajo del título. */
  dato?: React.ReactNode
  /** Controles a la derecha del encabezado (p. ej. USD / ARS). */
  acciones?: React.ReactNode
  /** Habilita xl:max-w-[1360px] para páginas con tablas anchas. */
  ancha?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const contenedor = `mx-auto w-full max-w-[1080px] px-[var(--gutter)] sm:px-8 ${ancha ? 'xl:max-w-[1360px]' : ''}`
  return (
    <div className="flex min-h-full flex-1 md:min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-[var(--radius-pill)] focus:bg-[var(--bg-surface)] focus:px-4 focus:py-2 focus:text-[var(--fg-1)] focus:[box-shadow:var(--ring-focus)]"
      >
        Saltar al contenido
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`${contenedor} pt-[calc(env(safe-area-inset-top)+18px)] md:pt-10 print:hidden`}>
          <div className={`flex min-h-11 items-center justify-between gap-4 ${acciones ? "" : "md:hidden"}`}>
            <Link href="/" className="flex items-center gap-2.5 no-underline md:hidden">
              <Logo />
              <span className="font-display text-[17px] font-medium text-[var(--fg-1)]">Mis Finanzas</span>
            </Link>
            {acciones && <div className="ml-auto shrink-0">{acciones}</div>}
          </div>
          <h1
            className={
              tituloVisible
                ? 'mt-6 font-display text-[length:var(--text-headline)] font-medium leading-[1.1] tracking-[var(--ls-title)] text-[var(--fg-1)] md:mt-2 md:text-[40px]'
                : 'sr-only'
            }
          >
            {titulo}
          </h1>
          {dato && <div className={tituloVisible ? 'mt-3' : 'mt-6 md:mt-4'}>{dato}</div>}
        </header>
        <main
          id="contenido"
          className={`${contenedor} flex-1 pb-32 pt-6 md:pb-16 md:pt-8 print:pb-0 print:pt-0`}
        >
          {children}
        </main>
      </div>
      <TabBar pathname={pathname} />
    </div>
  )
}

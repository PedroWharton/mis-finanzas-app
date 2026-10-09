import { clasePanel } from './Panel'

// Estado de carga con la estructura de la página (nada de "Cargando…" pelado).
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] ${className}`}
    />
  )
}

export function SkeletonPagina({ paneles = 3 }: { paneles?: number }) {
  return (
    <div role="status" aria-label="Cargando contenido" className="flex flex-col gap-4">
      {Array.from({ length: paneles }, (_, i) => (
        <div key={i} className={`${clasePanel} p-5 sm:p-6`}>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-5 h-8 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </div>
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

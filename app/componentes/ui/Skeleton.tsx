// Estado de carga con la estructura de la página (nada de "Cargando…" pelado).
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-[var(--radius-sm,4px)] bg-[var(--bg-sunken)] ${className}`}
    />
  )
}

export function SkeletonPagina({ paneles = 3 }: { paneles?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
      {Array.from({ length: paneles }, (_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-xs)] sm:p-7"
        >
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-5 h-8 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </div>
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

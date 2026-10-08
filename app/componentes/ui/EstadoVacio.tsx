// Estado vacío o de error con mensaje y acción opcional.
export function EstadoVacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string
  detalle?: string
  accion?: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-2)] bg-[var(--bg-surface)] px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-[var(--fg-1)]">{titulo}</p>
      {detalle && <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--fg-3)]">{detalle}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

// Estado vacío o de error: una hoja en blanco con borde punteado.
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
    <div className="rounded-[var(--radius-lg)] border-[1.5px] border-dashed border-[var(--border-2)] px-6 py-10 text-center">
      <p className="font-display text-[20px] font-medium text-[var(--fg-1)]">{titulo}</p>
      {detalle && <p className="mx-auto mt-2 max-w-md text-[14px] text-[var(--fg-3)]">{detalle}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}

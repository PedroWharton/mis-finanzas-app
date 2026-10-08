import type { TipoActivo } from '@/lib/tipos'
import type { Veredicto } from '@/lib/senales'

export const COLOR_TIPO: Record<TipoActivo, string> = {
  acciones: 'var(--chart-1)',
  cripto: 'var(--chart-2)',
  bono: 'var(--chart-3)',
  efectivo: 'var(--chart-efectivo)',
}

export const COLORES_PLATAFORMA = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export const PROPOSITO: Record<TipoActivo, { nombre: string; detalle: string; color: string }> = {
  acciones: { nombre: 'Inversión en bolsa', detalle: 'ETFs y acciones', color: 'var(--chart-1)' },
  cripto: { nombre: 'Inversión cripto', detalle: 'BTC, ETH y tokens', color: 'var(--chart-2)' },
  bono: { nombre: 'Renta fija', detalle: 'Bonos con interés devengado', color: 'var(--chart-3)' },
  efectivo: { nombre: 'Reserva líquida', detalle: 'Ahorros disponibles', color: 'var(--chart-efectivo)' },
}

// "Mantener" usa fg-2 (no fg-3) para no quedar por debajo del texto normal.
export const VEREDICTO_COLOR: Record<Veredicto, string> = {
  comprar: 'var(--good)',
  vender: 'var(--bad)',
  reducir: 'var(--bad)',
  mantener: 'var(--fg-2)',
}

export const VEREDICTO_LABEL: Record<Veredicto, string> = {
  comprar: 'Comprar',
  vender: 'Vender',
  reducir: 'Reducir',
  mantener: 'Mantener',
}

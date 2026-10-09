// Tema compartido de Recharts: ejes sin línea, grilla punteada de papel,
// tooltip como una tarjeta del cuaderno y cifras en mono. Así todos los
// gráficos se sienten parte del mismo sistema.
import type { CSSProperties } from 'react'

export const tickEje = { fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-body)' }
export const tickCifra = { fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono-wb)' }

export const grilla = { stroke: 'var(--chart-grid)', strokeDasharray: '2 4', vertical: false } as const

export const tooltipCaja: CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--fg-1)',
  border: '1px solid var(--border-1)',
  borderRadius: 12,
  fontSize: 12,
  fontFamily: 'var(--font-mono-wb)',
  boxShadow: 'var(--shadow-sm)',
  padding: '8px 12px',
}
export const tooltipRotulo: CSSProperties = { color: 'var(--fg-3)', fontFamily: 'var(--font-body)', marginBottom: 2 }
export const tooltipCursor = { stroke: 'var(--mark)', strokeWidth: 1 }

/** 27.150 → "27,2k" para ejes angostos. */
export function miles(v: number): string {
  return `${(v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k`
}

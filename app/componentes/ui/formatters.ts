// Única fuente de formateo de la app: es-AR en todas las páginas.
export const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })
export const usdEntero = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
export const pct = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
// Ratios adimensionales (Sharpe, correlación): coma decimal, dos cifras.
export const ratio = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fechaLarga = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
export const fechaCorta = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
export const fechaTabla = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

// Días que separan la última fecha de la serie de un ticker respecto de la
// fecha de referencia de `historicos` (rezago por serie tras un merge parcial).
export function diasDeRezago(ultimaFechaSerie: string, fechaReferencia: string): number {
  return Math.round(
    (parseISO(fechaReferencia).getTime() - parseISO(ultimaFechaSerie).getTime()) / MS_POR_DIA,
  )
}

export function signo(v: number): string {
  return v >= 0 ? '+' : '−'
}

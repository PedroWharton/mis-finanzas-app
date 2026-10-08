import type { Serie } from './historicos'

export const FACTOR_ANUAL = { acciones: 252, cripto: 365 } as const

function media(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function volatilidadAnualizada(retornos: number[], diasPorAnio: number): number {
  if (retornos.length < 2) return 0
  const m = media(retornos)
  const varianza = retornos.reduce((a, r) => a + (r - m) ** 2, 0) / (retornos.length - 1)
  return Math.sqrt(varianza) * Math.sqrt(diasPorAnio)
}

export function sharpe(retornos: number[], diasPorAnio: number, tasaLibreRiesgo = 0.04): number {
  const vol = volatilidadAnualizada(retornos, diasPorAnio)
  if (vol === 0) return 0
  return (media(retornos) * diasPorAnio - tasaLibreRiesgo) / vol
}

export function maxDrawdown(precios: number[]): number {
  let pico = 0
  let peor = 0
  for (const p of precios) {
    if (p <= 0) continue
    if (p > pico) pico = p
    if (pico > 0) peor = Math.min(peor, (p - pico) / pico)
  }
  return peor
}

export function correlacion(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return 0
  const mx = media(x.slice(0, n))
  const my = media(y.slice(0, n))
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my)
    vx += (x[i] - mx) ** 2
    vy += (y[i] - my) ** 2
  }
  const den = Math.sqrt(vx * vy)
  return den === 0 ? 0 : cov / den
}

// Log-retornos de ambas series sobre la intersección de fechas.
// Sin forward-fill: rellenar deprimiría artificialmente la correlación.
export function retornosComunes(a: Serie, b: Serie): [number[], number[]] {
  const idxB = new Map(b.fechas.map((f, i) => [f, i]))
  const pares: Array<[string, number, number]> = []
  for (let i = 0; i < a.fechas.length; i++) {
    const j = idxB.get(a.fechas[i])
    if (j !== undefined && a.precios[i] > 0 && b.precios[j] > 0) {
      pares.push([a.fechas[i], a.precios[i], b.precios[j]])
    }
  }
  pares.sort((x, y) => x[0].localeCompare(y[0]))
  const ra: number[] = []
  const rb: number[] = []
  for (let i = 1; i < pares.length; i++) {
    ra.push(Math.log(pares[i][1] / pares[i - 1][1]))
    rb.push(Math.log(pares[i][2] / pares[i - 1][2]))
  }
  return [ra, rb]
}

// Índice de cartera: valor relativo ponderado sobre las fechas comunes a
// todas las series con precio. Los pesos son fracciones del portfolio
// COMPLETO (no se renormalizan sobre los tickers con serie): renormalizar
// aquí haría que el índice representara solo el sleeve con serie (p. ej.
// acciones+cripto) mientras el resto de la app lo trata como si fuera toda
// la cartera, exagerando vol/Sharpe/drawdown/bandas cuando bono y efectivo
// pesan una fracción significativa. En cambio, la porción sin serie (bono
// devengado, efectivo) se modela como constante a primer orden: aporta su
// peso (1 − Σ pesos con serie) sin variar día a día. Si ningún ticker con
// peso tiene serie (Σ pesos con serie = 0), no hay nada que reconstruir.
export function retornosCartera(series: Record<string, Serie>, pesosPorTicker: Record<string, number>): number[] {
  const tickers = Object.keys(pesosPorTicker).filter((t) => series[t])
  if (tickers.length === 0) return []
  const pesoSeries = tickers.reduce((a, t) => a + pesosPorTicker[t], 0)
  if (pesoSeries === 0) return []
  const pesoConstante = 1 - pesoSeries
  const mapas = tickers.map((t) => new Map(series[t].fechas.map((f, i) => [f, series[t].precios[i]])))
  const fechas = series[tickers[0]].fechas
    .filter((f) => mapas.every((m) => {
      const precio = m.get(f)
      return precio !== undefined && precio > 0
    }))
    .sort()
  if (fechas.length < 2) return []
  const indice = fechas.map((f) =>
    tickers.reduce((a, t, k) => a + pesosPorTicker[t] * (mapas[k].get(f)! / mapas[k].get(fechas[0])!), pesoConstante)
  )
  const out: number[] = []
  for (let i = 1; i < indice.length; i++) out.push(Math.log(indice[i] / indice[i - 1]))
  return out
}

export function pesos(valores: Record<string, number>): Record<string, number> {
  const total = Object.values(valores).reduce((a, b) => a + b, 0)
  if (total === 0) return Object.fromEntries(Object.keys(valores).map((k) => [k, 0]))
  return Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v / total]))
}

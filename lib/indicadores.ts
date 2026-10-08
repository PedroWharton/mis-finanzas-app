export function retornosLog(precios: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < precios.length; i++) out.push(Math.log(precios[i] / precios[i - 1]))
  return out
}

export function sma(precios: number[], ventana: number): number | null {
  if (precios.length < ventana) return null
  let suma = 0
  for (let i = precios.length - ventana; i < precios.length; i++) suma += precios[i]
  return suma / ventana
}

// RSI con suavizado de Wilder. Sin pérdidas en la ventana → 100.
export function rsi(precios: number[], periodo = 14): number | null {
  if (precios.length < periodo + 1) return null
  let ganancia = 0
  let perdida = 0
  for (let i = 1; i <= periodo; i++) {
    const d = precios[i] - precios[i - 1]
    if (d >= 0) ganancia += d
    else perdida -= d
  }
  ganancia /= periodo
  perdida /= periodo
  for (let i = periodo + 1; i < precios.length; i++) {
    const d = precios[i] - precios[i - 1]
    ganancia = (ganancia * (periodo - 1) + Math.max(d, 0)) / periodo
    perdida = (perdida * (periodo - 1) + Math.max(-d, 0)) / periodo
  }
  if (perdida === 0) return 100
  return 100 - 100 / (1 + ganancia / perdida)
}

export function momentum(precios: number[], dias: number): number | null {
  if (precios.length <= dias) return null
  const antes = precios[precios.length - 1 - dias]
  return (precios[precios.length - 1] - antes) / antes
}

export function distanciaAMaximo(precios: number[]): number {
  const max = Math.max(...precios)
  return (precios[precios.length - 1] - max) / max
}

export const DIAS_MES = { acciones: 21, cripto: 30 } as const

export interface Indicadores {
  precio: number
  sma50: number | null
  sma200: number | null
  rsi14: number | null
  momentum3m: number | null
  momentum6m: number | null
  momentum12m: number | null
  distMaximo: number
}

export function calcularIndicadores(precios: number[], tipo: 'acciones' | 'cripto'): Indicadores {
  const mes = DIAS_MES[tipo]
  return {
    precio: precios[precios.length - 1],
    sma50: sma(precios, 50),
    sma200: sma(precios, 200),
    rsi14: rsi(precios),
    momentum3m: momentum(precios, 3 * mes),
    momentum6m: momentum(precios, 6 * mes),
    momentum12m: momentum(precios, 12 * mes),
    distMaximo: distanciaAMaximo(precios),
  }
}

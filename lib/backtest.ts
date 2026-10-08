import { calcularIndicadores } from './indicadores'
import { evaluarPosicion, type Veredicto } from './senales'

// La SMA 200 necesita 200 puntos: los primeros WARMUP días solo alimentan
// indicadores y la evaluación empieza en el día 201 (índice 200). Nota: entre
// el día 201 y el umbral del momentum 12 m (253 puntos acciones / 361 cripto)
// momentum12m es null y el score se computa con máximo ±4 en vez de ±5 —
// evaluarPosicion ya tolera nulls.
export const WARMUP = 200
const MIN_EVALUACION = 30

export interface ResultadoBacktest {
  retornoEstrategia: number // retorno acumulado siguiendo señales (fracción, ej. 0.23)
  retornoBuyHold: number // retorno acumulado comprar-y-mantener en la misma ventana
  operaciones: number // cantidad de transiciones dentro/fuera
  dias: number // días evaluados (ventana post warm-up)
}

// Señal del día i calculada EXCLUSIVAMENTE con precios[0..i] (slice
// inclusive): regla dura anti look-ahead. peso = 0 → la regla de
// concentración nunca aplica (veredictos posibles: comprar/mantener/vender).
export function senalEnDia(precios: number[], i: number, tipo: 'acciones' | 'cripto'): Veredicto {
  return evaluarPosicion('_', calcularIndicadores(precios.slice(0, i + 1), tipo), tipo, 0).veredicto
}

// Estrategia: estar invertido salvo que el veredicto sea 'vender'; en
// "vender" se pasa a efectivo (retorno 0) hasta que el veredicto deje de ser
// "vender". El retorno del día i+1 se devenga según el estado decidido al
// cierre de i. El primer día evaluado fija el estado inicial sin contar como
// operación. Acumulación: log-retornos sumados → exp(suma) − 1.
// Sin costos de transacción (declarado en el disclaimer de la página).
// Costo: recalcular indicadores por día es O(n²) con n≈500 → ~10⁵ operaciones
// por ticker, trivial en el browser incluso para ~32 tickers.
export function backtest(precios: number[], fechas: string[], tipo: 'acciones' | 'cripto'): ResultadoBacktest | null {
  if (precios.length !== fechas.length) return null
  if (precios.length < WARMUP + MIN_EVALUACION) return null
  let invertido: boolean | null = null
  let operaciones = 0
  let sumaLog = 0
  for (let i = WARMUP; i < precios.length - 1; i++) {
    const quiereInvertido = senalEnDia(precios, i, tipo) !== 'vender'
    if (invertido === null) {
      invertido = quiereInvertido
    } else if (quiereInvertido !== invertido) {
      operaciones++
      invertido = quiereInvertido
    }
    if (invertido) sumaLog += Math.log(precios[i + 1] / precios[i])
  }
  return {
    retornoEstrategia: Math.exp(sumaLog) - 1,
    retornoBuyHold: precios[precios.length - 1] / precios[WARMUP] - 1,
    operaciones,
    dias: precios.length - 1 - WARMUP,
  }
}

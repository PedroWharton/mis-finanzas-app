import { DIAS_MES } from './indicadores'
import { MIN_DIAS_PREDICCION, baseline, predecir, type Prediccion, type TipoSerie } from './predictor'

export const WARMUP_PREDICCION = MIN_DIAS_PREDICCION // 250
// Con menos de 4 orígenes válidos el ticker se reporta como "evaluación
// insuficiente": no se muestra una métrica con n diminuto como si fuera confiable.
export const MIN_ORIGENES = 4

export interface MetricasHorizonte {
  cobertura: number // fracción de orígenes con p10 ≤ real ≤ p90 (ideal ≈ 0.80)
  errorMediano: number // mediana de |real − p50| / precioOrigen
  aciertoDireccional: number | null // null para el baseline (no opina dirección)
  n: number // cantidad de orígenes
}

export interface EvaluacionTicker {
  ticker: string
  modelo: { m1: MetricasHorizonte; m3: MetricasHorizonte } | null // null = evaluación insuficiente
  baseline: { m1: MetricasHorizonte; m3: MetricasHorizonte } | null
  gana: boolean | null
}

// Predicción parada en el índice `i` usando SOLO precios[0..i] (slice
// inclusive): mismo patrón anti look-ahead que senalEnDia de lib/backtest.ts.
export function prediccionEnOrigen(
  precios: number[],
  i: number,
  tipo: TipoSerie,
  minDias: number = WARMUP_PREDICCION
): Prediccion | null {
  return predecir(precios.slice(0, i + 1), tipo, minDias)
}

interface Observacion {
  p10: number
  p50: number
  p90: number
  real: number
  origen: number
}

function mediana(xs: number[]): number {
  const orden = [...xs].sort((a, b) => a - b)
  const m = orden.length >> 1
  return orden.length % 2 === 1 ? orden[m] : (orden[m - 1] + orden[m]) / 2
}

// `direccional: false` (baseline): su p50 ES el precio de origen, no opina.
// Para el modelo se excluyen del denominador los empates exactos del real
// (real === origen) Y los orígenes donde el modelo no opina (p50 === origen,
// drift exactamente 0) — regla simétrica a la del baseline. Denominador
// vacío ⇒ null.
function metricas(obs: Observacion[], direccional: boolean): MetricasHorizonte {
  const n = obs.length
  const cobertura = obs.filter((o) => o.p10 <= o.real && o.real <= o.p90).length / n
  const errorMediano = mediana(obs.map((o) => Math.abs(o.real - o.p50) / o.origen))
  let aciertoDireccional: number | null = null
  if (direccional) {
    const opinables = obs.filter((o) => o.real !== o.origen && o.p50 !== o.origen)
    if (opinables.length > 0) {
      aciertoDireccional =
        opinables.filter((o) => Math.sign(o.p50 - o.origen) === Math.sign(o.real - o.origen)).length /
        opinables.length
    }
  }
  return { cobertura, errorMediano, aciertoDireccional, n }
}

// Walk-forward: orígenes i = warmup, warmup + paso, … con paso mensual,
// mientras quede futuro para calificar el horizonte de 3 meses. En cada
// origen se predice con precios[0..i] y se compara contra precios[i + h].
// `warmup` opcional: los tests lo reducen para usar series sintéticas cortas
// (se propaga como minDias del motor); producción nunca lo pasa.
export function evaluarPredictor(
  precios: number[],
  tipo: TipoSerie,
  warmup: number = WARMUP_PREDICCION
): Omit<EvaluacionTicker, 'ticker'> {
  const insuficiente = { modelo: null, baseline: null, gana: null }
  const paso = DIAS_MES[tipo]
  const h1 = DIAS_MES[tipo]
  const h3 = 3 * DIAS_MES[tipo]
  const modeloObs = { m1: [] as Observacion[], m3: [] as Observacion[] }
  const baseObs = { m1: [] as Observacion[], m3: [] as Observacion[] }
  for (let i = warmup; i + h3 < precios.length; i += paso) {
    const pm = prediccionEnOrigen(precios, i, tipo, warmup)
    const pb = baseline(precios.slice(0, i + 1), tipo, warmup)
    // null aquí = retornos no finitos en la ventana: el ticker no es evaluable.
    if (!pm || !pb) return insuficiente
    const origen = precios[i]
    modeloObs.m1.push({ ...pm.m1, real: precios[i + h1], origen })
    modeloObs.m3.push({ ...pm.m3, real: precios[i + h3], origen })
    baseObs.m1.push({ ...pb.m1, real: precios[i + h1], origen })
    baseObs.m3.push({ ...pb.m3, real: precios[i + h3], origen })
  }
  if (modeloObs.m1.length < MIN_ORIGENES) return insuficiente
  const modelo = { m1: metricas(modeloObs.m1, true), m3: metricas(modeloObs.m3, true) }
  const base = { m1: metricas(baseObs.m1, false), m3: metricas(baseObs.m3, false) }
  const gana = modelo.m1.errorMediano < base.m1.errorMediano && modelo.m3.errorMediano < base.m3.errorMediano
  return { modelo, baseline: base, gana }
}

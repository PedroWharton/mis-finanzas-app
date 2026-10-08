import { DIAS_MES, retornosLog } from './indicadores'

export type TipoSerie = 'acciones' | 'cripto'

export const MIN_DIAS_PREDICCION = 250
export const ENCOGIMIENTO = 0.25
export const LAMBDA_EWMA = 0.94
export const VENTANA_INIT_EWMA = 30
export const Z80 = 1.2816 // banda central del 80%
// 6 meses de retornos: 126 (acciones, días hábiles) / 180 (cripto, corridos).
export const VENTANA_DRIFT = { acciones: 6 * DIAS_MES.acciones, cripto: 6 * DIAS_MES.cripto } as const

export interface Banda {
  p10: number
  p50: number
  p90: number
  h: number // horizonte en observaciones de la serie
}

export interface Prediccion {
  m1: Banda
  m3: Banda
}

function media(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// EWMA RiskMetrics sobre r² CRUDO (sin centrar, coherente con la recursión):
// s²_t = λ·s²_{t-1} + (1−λ)·r_t². Init: media(r²) de los primeros
// VENTANA_INIT_EWMA retornos (o de todos, si hay menos); se itera sobre el
// resto y se devuelve el valor final.
export function varianzaEwma(retornos: number[]): number {
  const init = retornos.slice(0, Math.min(VENTANA_INIT_EWMA, retornos.length))
  let s2 = media(init.map((r) => r * r))
  for (let i = init.length; i < retornos.length; i++) {
    const r = retornos[i]
    s2 = LAMBDA_EWMA * s2 + (1 - LAMBDA_EWMA) * r * r
  }
  return s2
}

// Nota de diseño: el spec lista `HORIZONTES` entre las "constantes exportadas",
// pero depende de `tipo`, así que no es exportable como constante plana: quedó
// absorbida acá (h = DIAS_MES[tipo] y 3·DIAS_MES[tipo]) y viaja en `Banda.h`.
function armarBandas(precio: number, muDiario: number, sigmaDiaria: number, tipo: TipoSerie): Prediccion {
  const banda = (h: number): Banda => {
    const muH = muDiario * h
    const sigmaH = sigmaDiaria * Math.sqrt(h)
    return {
      p10: precio * Math.exp(muH - Z80 * sigmaH),
      p50: precio * Math.exp(muH),
      p90: precio * Math.exp(muH + Z80 * sigmaH),
      h,
    }
  }
  return { m1: banda(DIAS_MES[tipo]), m3: banda(3 * DIAS_MES[tipo]) }
}

// Momentum encogido + volatilidad EWMA. `minDias` NO lo pasa producción
// (queda en MIN_DIAS_PREDICCION): existe para que evaluarPredictor pueda
// predecir en orígenes tempranos cuando los tests reducen el warmup sobre
// series sintéticas cortas. Retornos no finitos (precio 0 o negativo por
// datos corruptos) ⇒ null: el ticker se excluye, no se filtra en silencio.
export function predecir(
  precios: number[],
  tipo: TipoSerie,
  minDias: number = MIN_DIAS_PREDICCION
): Prediccion | null {
  if (precios.length < minDias) return null
  const retornos = retornosLog(precios)
  if (retornos.length === 0 || retornos.some((r) => !Number.isFinite(r))) return null
  const muDiario = ENCOGIMIENTO * media(retornos.slice(-VENTANA_DRIFT[tipo]))
  return armarBandas(precios[precios.length - 1], muDiario, Math.sqrt(varianzaEwma(retornos)), tipo)
}

// Random walk: drift 0 e incertidumbre = desvío estándar poblacional de
// TODOS los retornos (no EWMA). "El precio no cambia, con la incertidumbre
// histórica simple". Toda métrica del modelo se compara contra esto.
export function baseline(
  precios: number[],
  tipo: TipoSerie,
  minDias: number = MIN_DIAS_PREDICCION
): Prediccion | null {
  if (precios.length < minDias) return null
  const retornos = retornosLog(precios)
  if (retornos.length === 0 || retornos.some((r) => !Number.isFinite(r))) return null
  const m = media(retornos)
  const sigma = Math.sqrt(media(retornos.map((r) => (r - m) ** 2)))
  return armarBandas(precios[precios.length - 1], 0, sigma, tipo)
}

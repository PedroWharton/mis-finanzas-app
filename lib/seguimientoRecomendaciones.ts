import type { Serie } from './historicos'
import type { Operacion, Precios } from './tipos'
import type { Accion, RecomendacionesDoc } from './recomendaciones'

const redondear2 = (n: number) => Math.round(n * 100) / 100
const DIAS_VENTANA_SEGUIDA = 7
const MS_DIA = 86_400_000

export interface Seguimiento {
  // Qué pasó con el precio desde que el agente recomendó.
  retornoPct: number | null // (actual − alRecomendar) / alRecomendar
  precioActual: number | null
  // Solo compras con niveles: ¿el precio tocó el target/stop desde entonces?
  tocoTarget: boolean | null
  tocoStop: boolean | null
  // Hubo una operación real acorde (compra/venta del ticker) en los 7 días
  // posteriores a la corrida: la recomendación se siguió.
  seguida: boolean
}

export interface DesempenoLado {
  n: number
  aciertos: number
  retornoMedianoPct: number | null
}

// Track record del AGENTE (espejo del desempenoPredictor): qué pasó con los
// precios después de cada comprar/vender que recomendó. Un "acierto" de
// compra es retorno positivo; de venta, retorno negativo (la caída que evitó).
export interface DesempenoAgente {
  evaluadas: number
  compras: DesempenoLado
  ventas: DesempenoLado
  seguidas: number
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const orden = [...xs].sort((a, b) => a - b)
  const m = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[m] : (orden[m - 1] + orden[m]) / 2
}

function fechaISO(fechaCorrida: string): string {
  return fechaCorrida.slice(0, 10)
}

function precioDe(ticker: string, precios: Precios, series: Record<string, Serie>): number | null {
  if (typeof precios[ticker] === 'number') return precios[ticker]
  const serie = series[ticker]
  if (serie && serie.precios.length > 0) return serie.precios[serie.precios.length - 1]
  return null
}

// Máximo y mínimo de la serie DESPUÉS de la fecha de la corrida (exclusive:
// el precio del día de la corrida ya está capturado en precioAlRecomendar).
function extremosDesde(serie: Serie | undefined, desdeISO: string): { max: number; min: number } | null {
  if (!serie) return null
  let max = -Infinity
  let min = Infinity
  for (let i = 0; i < serie.fechas.length; i++) {
    if (serie.fechas[i] > desdeISO) {
      max = Math.max(max, serie.precios[i])
      min = Math.min(min, serie.precios[i])
    }
  }
  return max === -Infinity ? null : { max, min }
}

function fueSeguida(ops: Operacion[], ticker: string, accion: Accion, desdeISO: string): boolean {
  const tipoEsperado = accion === 'comprar' ? 'compra' : accion === 'vender' ? 'venta' : null
  if (!tipoEsperado) return false
  const hasta = new Date(new Date(`${desdeISO}T00:00:00Z`).getTime() + DIAS_VENTANA_SEGUIDA * MS_DIA)
    .toISOString()
    .slice(0, 10)
  return ops.some((op) => op.tipo === tipoEsperado && op.ticker === ticker && op.fecha >= desdeISO && op.fecha <= hasta)
}

/**
 * Calcula el seguimiento de una recomendación puntual. Devuelve null si no
 * hay `precioAlRecomendar` estampado (corridas viejas o sin precios ese día)
 * o si la acción no es direccional (mantener/alerta no se puntúan).
 */
export function seguirRecomendacion(
  rec: { accion: Accion; ticker: string; precioAlRecomendar?: number; precioObjetivo?: number; stopLoss?: number },
  fechaCorrida: string,
  precios: Precios,
  series: Record<string, Serie>,
  operaciones: Operacion[]
): Seguimiento | null {
  if (rec.accion !== 'comprar' && rec.accion !== 'vender') return null
  const base = rec.precioAlRecomendar
  if (typeof base !== 'number' || !Number.isFinite(base) || base <= 0) return null
  const desde = fechaISO(fechaCorrida)
  const actual = precioDe(rec.ticker, precios, series)
  const extremos = extremosDesde(series[rec.ticker], desde)
  // Niveles solo para compras: en una venta "tocar el target" es ambiguo
  // (el objetivo puede ser el nivel de salida o el precio esperado después).
  const esCompra = rec.accion === 'comprar'
  return {
    retornoPct: actual === null ? null : redondear2(((actual - base) / base) * 100),
    precioActual: actual,
    tocoTarget: esCompra && rec.precioObjetivo && extremos ? extremos.max >= rec.precioObjetivo : null,
    tocoStop: esCompra && rec.stopLoss && extremos ? extremos.min <= rec.stopLoss : null,
    seguida: fueSeguida(operaciones, rec.ticker, rec.accion, desde),
  }
}

/**
 * Track record agregado del agente sobre TODO el historial de corridas.
 * Solo cuenta recomendaciones direccionales con precio estampado. Devuelve
 * null si no hay ninguna evaluable ("sin historial" ≠ "acierta 0%").
 */
export function resumirDesempenoAgente(
  doc: RecomendacionesDoc | null,
  precios: Precios,
  series: Record<string, Serie>,
  operaciones: Operacion[]
): DesempenoAgente | null {
  const porLado: Record<'comprar' | 'vender', { retornos: number[]; aciertos: number }> = {
    comprar: { retornos: [], aciertos: 0 },
    vender: { retornos: [], aciertos: 0 },
  }
  let seguidas = 0
  for (const corrida of doc?.corridas ?? []) {
    if (corrida.tipo === 'error') continue
    for (const rec of corrida.recomendaciones) {
      const s = seguirRecomendacion(rec, corrida.fecha, precios, series, operaciones)
      if (!s || s.retornoPct === null) continue
      const lado = rec.accion as 'comprar' | 'vender'
      porLado[lado].retornos.push(s.retornoPct)
      // Compra acierta si subió; venta acierta si después bajó (salir evitó la caída).
      if ((lado === 'comprar' && s.retornoPct > 0) || (lado === 'vender' && s.retornoPct < 0)) porLado[lado].aciertos++
      if (s.seguida) seguidas++
    }
  }
  const evaluadas = porLado.comprar.retornos.length + porLado.vender.retornos.length
  if (evaluadas === 0) return null
  const lado = (l: 'comprar' | 'vender'): DesempenoLado => ({
    n: porLado[l].retornos.length,
    aciertos: porLado[l].aciertos,
    retornoMedianoPct: mediana(porLado[l].retornos),
  })
  return { evaluadas, compras: lado('comprar'), ventas: lado('vender'), seguidas }
}

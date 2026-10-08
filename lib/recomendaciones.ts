export type TipoCorrida = 'diario' | 'semanal' | 'error'
export type Accion = 'comprar' | 'vender' | 'mantener' | 'alerta'

export interface Recomendacion {
  accion: Accion
  ticker: string
  montoUSD?: number
  razon: string
  esNuevo?: boolean
  // Niveles de orden sugeridos por el agente (solo comprar/vender por
  // convención de prompt; el validador los acepta en cualquier accion).
  precioLimite?: number
  stopLoss?: number
  precioObjetivo?: number
  // Estampado por el SERVIDOR al recibir la corrida (no lo manda el agente):
  // precio conocido del ticker en ese momento, para poder medir después si
  // la recomendación funcionó comparando contra el precio actual.
  precioAlRecomendar?: number
}

/** Estampa el precio conocido de cada ticker al momento de la corrida. */
export function estamparPrecios(r: Resultado, precios: Record<string, number>): Resultado {
  return {
    ...r,
    recomendaciones: r.recomendaciones.map((rec) => {
      const p = precios[rec.ticker]
      return typeof p === 'number' && Number.isFinite(p) ? { ...rec, precioAlRecomendar: p } : rec
    }),
  }
}

export interface Resultado {
  tipo: TipoCorrida
  fecha: string
  resumen: string
  recomendaciones: Recomendacion[]
  analisis: string
}

export interface RecomendacionesDoc { corridas: Resultado[] }

export const MAX_CORRIDAS = 60
const MAX_RECOMENDACIONES = 20
const MAX_TICKER = 12

const TIPOS: TipoCorrida[] = ['diario', 'semanal', 'error']
const ACCIONES: Accion[] = ['comprar', 'vender', 'mantener', 'alerta']

// typeof x === 'object' no alcanza: un array también lo es (patrón del repo).
function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// El agente cloud arma el JSON a mano y reintenta a ciegas ante un 400: ser
// tolerante donde no compromete nada (los textos se guardan completos, montos
// numéricos en string se coercionan) y explicar EXACTAMENTE qué campo falló
// donde la validación sigue siendo estricta (tipo, accion, fecha).
function coercionMonto(x: unknown): number | null | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x)
  return null
}

function validarRecomendacion(x: unknown, i: number): { ok: true; r: Recomendacion } | { ok: false; error: string } {
  if (!esObjeto(x)) return { ok: false, error: `recomendaciones[${i}]: se espera un objeto` }
  if (!ACCIONES.includes(x.accion as Accion)) {
    return { ok: false, error: `recomendaciones[${i}].accion: debe ser ${ACCIONES.join('|')}` }
  }
  if (typeof x.ticker !== 'string' || !x.ticker.trim() || x.ticker.trim().length > MAX_TICKER) {
    return { ok: false, error: `recomendaciones[${i}].ticker: string de 1..${MAX_TICKER}` }
  }
  if (typeof x.razon !== 'string' || !x.razon) return { ok: false, error: `recomendaciones[${i}].razon: string requerido` }
  const monto = coercionMonto(x.montoUSD)
  if (monto === null) return { ok: false, error: `recomendaciones[${i}].montoUSD: debe ser numérico` }
  const niveles: Partial<Pick<Recomendacion, 'precioLimite' | 'stopLoss' | 'precioObjetivo'>> = {}
  for (const campo of ['precioLimite', 'stopLoss', 'precioObjetivo'] as const) {
    const v = coercionMonto(x[campo])
    if (v === null) return { ok: false, error: `recomendaciones[${i}].${campo}: debe ser numérico` }
    if (v !== undefined && v <= 0) return { ok: false, error: `recomendaciones[${i}].${campo}: debe ser > 0` }
    if (v !== undefined) niveles[campo] = v
  }
  // Reconstrucción con SOLO campos validados: el spread perpetuaría
  // propiedades desconocidas en el doc persistido (patrón del repo).
  const r: Recomendacion = { accion: x.accion as Accion, ticker: x.ticker.trim(), razon: x.razon }
  if (monto !== undefined) r.montoUSD = monto
  if (x.esNuevo !== undefined) r.esNuevo = Boolean(x.esNuevo)
  if (niveles.precioLimite !== undefined) r.precioLimite = niveles.precioLimite
  if (niveles.stopLoss !== undefined) r.stopLoss = niveles.stopLoss
  if (niveles.precioObjetivo !== undefined) r.precioObjetivo = niveles.precioObjetivo
  return { ok: true, r }
}

export function validarResultado(x: unknown): { ok: true; resultado: Resultado } | { ok: false; error: string } {
  if (!esObjeto(x)) return { ok: false, error: 'se espera un objeto JSON' }
  if (!TIPOS.includes(x.tipo as TipoCorrida)) return { ok: false, error: `tipo: debe ser ${TIPOS.join('|')}` }
  if (typeof x.fecha !== 'string' || Number.isNaN(Date.parse(x.fecha))) return { ok: false, error: 'fecha: string ISO 8601 requerido' }
  if (typeof x.resumen !== 'string' || !x.resumen) return { ok: false, error: 'resumen: string no vacío requerido' }
  if (typeof x.analisis !== 'string') return { ok: false, error: 'analisis: string requerido' }
  if (!Array.isArray(x.recomendaciones)) return { ok: false, error: 'recomendaciones: debe ser un array' }
  if (x.recomendaciones.length > MAX_RECOMENDACIONES) {
    return { ok: false, error: `recomendaciones: máximo ${MAX_RECOMENDACIONES} (llegaron ${x.recomendaciones.length})` }
  }
  const recomendaciones: Recomendacion[] = []
  for (let i = 0; i < x.recomendaciones.length; i++) {
    const v = validarRecomendacion(x.recomendaciones[i], i)
    if (!v.ok) return v
    recomendaciones.push(v.r)
  }
  return {
    ok: true,
    resultado: {
      tipo: x.tipo as TipoCorrida,
      fecha: x.fecha,
      resumen: x.resumen,
      recomendaciones,
      analisis: x.analisis,
    },
  }
}

export function agregarCorrida(doc: RecomendacionesDoc | null, r: Resultado): RecomendacionesDoc {
  return { corridas: [r, ...(doc?.corridas ?? [])].slice(0, MAX_CORRIDAS) }
}

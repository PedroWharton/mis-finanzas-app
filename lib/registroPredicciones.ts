import type { Serie } from './historicos'
import type { Prediccion, TipoSerie } from './predictor'

// El tope aplica SOLO a resueltos. Los pendientes nunca se podan: se
// auto-acotan porque vencen y pasan a resueltos. Un tope global borraría el
// historial verificable para hacer lugar a pendientes — lo contrario del
// objetivo del registro.
export const MAX_RESUELTOS = 400
export const DIAS_VENCIMIENTO = { '1m': 30, '3m': 90 } as const

export type Horizonte = '1m' | '3m'

export interface ResultadoRegistro {
  fecha: string
  precioReal: number
  dentroBanda: boolean
  errorPct: number
}

export interface Registro {
  fechaOrigen: string // última fecha de la serie del ticker al predecir
  ticker: string
  tipo: TipoSerie
  horizonte: Horizonte
  precioOrigen: number
  p10: number
  p50: number
  p90: number
  fechaVencimiento: string // fechaOrigen + 30/90 días calendario (ambos tipos)
  resultado: ResultadoRegistro | null
}

export interface PrediccionesDoc {
  registros: Registro[]
}

export interface Vigente {
  ticker: string
  tipo: TipoSerie
  serie: Serie
  prediccion: Prediccion
}

// Aritmética de fechas ISO en UTC explícito: sumar con el Date local puede
// correrse un día según el timezone del host.
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

function claveAlta(r: { ticker: string; horizonte: Horizonte; fechaOrigen: string }): string {
  return `${r.ticker}|${r.horizonte}|${r.fechaOrigen}`
}

// Puro: 1) resuelve pendientes vencidos con el PRIMER precio de la serie con
// fecha ≥ vencimiento; 2) da de alta ticker/horizonte sin registro para la
// fecha actual de SU serie; 3) poda resueltos por encima de MAX_RESUELTOS
// (los más antiguos por fechaOrigen). `cambio: false` ⇒ el cliente no postea.
export function actualizarRegistros(
  doc: PrediccionesDoc,
  vigentes: Vigente[]
): { doc: PrediccionesDoc; cambio: boolean } {
  let cambio = false
  const porTicker = new Map(vigentes.map((v) => [v.ticker, v]))

  // 1) Resolución. Un ticker que ya no está en el universo queda como está
  // (se resuelve si algún día vuelve; se muestra en el historial igual).
  const registros: Registro[] = doc.registros.map((reg) => {
    if (reg.resultado !== null) return reg
    const v = porTicker.get(reg.ticker)
    if (!v) return reg
    const idx = v.serie.fechas.findIndex((f) => f >= reg.fechaVencimiento)
    if (idx === -1) return reg
    cambio = true
    const precioReal = v.serie.precios[idx]
    return {
      ...reg,
      resultado: {
        fecha: v.serie.fechas[idx],
        precioReal,
        dentroBanda: reg.p10 <= precioReal && precioReal <= reg.p90,
        errorPct: Math.abs(precioReal - reg.p50) / reg.precioOrigen,
      },
    }
  })

  // 2) Altas. fechaOrigen = última fecha de la serie de ESE ticker (no la
  // fecha global de historicos). Sin registro (ticker, horizonte, fechaOrigen)
  // previo ⇒ pendiente nuevo; mismo dato ⇒ nada (no acumula por visita).
  const existentes = new Set(doc.registros.map(claveAlta))
  for (const v of vigentes) {
    const fechaOrigen = v.serie.fechas[v.serie.fechas.length - 1]
    const precioOrigen = v.serie.precios[v.serie.precios.length - 1]
    for (const horizonte of ['1m', '3m'] as const) {
      if (existentes.has(claveAlta({ ticker: v.ticker, horizonte, fechaOrigen }))) continue
      cambio = true
      const banda = horizonte === '1m' ? v.prediccion.m1 : v.prediccion.m3
      registros.push({
        fechaOrigen,
        ticker: v.ticker,
        tipo: v.tipo,
        horizonte,
        precioOrigen,
        p10: banda.p10,
        p50: banda.p50,
        p90: banda.p90,
        fechaVencimiento: sumarDias(fechaOrigen, DIAS_VENCIMIENTO[horizonte]),
        resultado: null,
      })
    }
  }

  // 3) Poda de resueltos.
  const resueltos = registros.filter((r) => r.resultado !== null)
  if (resueltos.length > MAX_RESUELTOS) {
    cambio = true
    const borrar = new Set(
      [...resueltos]
        .sort((a, b) => a.fechaOrigen.localeCompare(b.fechaOrigen))
        .slice(0, resueltos.length - MAX_RESUELTOS)
    )
    return { doc: { registros: registros.filter((r) => !borrar.has(r)) }, cambio }
  }

  return { doc: { registros }, cambio }
}

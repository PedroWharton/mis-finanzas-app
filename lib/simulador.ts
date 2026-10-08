import type { Serie } from './historicos'
import type { TipoActivo } from './tipos'
import { correlacion, pesos, retornosCartera, retornosComunes, volatilidadAnualizada } from './riesgo'

// Con menos de 60 retornos comunes la comparación de volatilidades no es
// fiable: la UI muestra "histórico insuficiente para comparar".
export const MIN_RETORNOS_SIMULACION = 60

export interface Candidato {
  ticker: string
  serie: Serie
  tipo: 'acciones' | 'cripto'
}

export interface ResultadoSimulacion {
  pesoNuevo: number // peso TOTAL resultante del ticker tras la compra
  volAntes: number // volatilidad anualizada de la cartera actual
  volDespues: number // ídem con el candidato incorporado
  correlacionMedia: number | null // vs las OTRAS posiciones con serie; null si no hay
}

// Normaliza texto de un input de monto (es-AR o plano) antes de Number().
// "1.500,50" (miles con punto, decimal con coma) → 1500.50
// "1500,50" (sin miles, decimal con coma) → 1500.50
// "1.500" (solo grupos de miles con punto, sin coma) → 1500
// "1500" / "1500.50" → se dejan como están (Number ya los interpreta bien)
export function parsearMonto(texto: string): number {
  const t = texto.trim().replace(/\s+/g, '')
  if (t.includes(',')) {
    return Number(t.replace(/\./g, '').replace(',', '.'))
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    return Number(t.replace(/\./g, ''))
  }
  return Number(t)
}

// Recorta todas las series a las fechas presentes en TODAS (con precio > 0).
function recortarAInterseccion(series: Record<string, Serie>): Record<string, Serie> {
  const listas = Object.values(series)
  if (listas.length === 0) return {}
  const mapas = listas.map((s) => new Map(s.fechas.map((f, i) => [f, s.precios[i]])))
  const comunes = listas[0].fechas.filter((f) => mapas.every((m) => (m.get(f) ?? 0) > 0)).sort()
  return Object.fromEntries(
    Object.entries(series).map(([t, s]) => {
      const m = new Map(s.fechas.map((f, i) => [f, s.precios[i]]))
      return [t, { fechas: comunes, precios: comunes.map((f) => m.get(f)!) }]
    })
  )
}

// Impacto hipotético de comprar `monto` USD del candidato.
// - Pesos nuevos: pesos({...valores, [ticker]: (valores[ticker] ?? 0) + monto})
//   — una sola fórmula cubre ticker nuevo (escala los existentes y le da
//   monto/(total+monto) al candidato) y ticker que YA es posición (se suma al
//   valor existente, sin pisar nada).
// - volAntes y volDespues se calculan ambas sobre la MISMA ventana: la
//   intersección de fechas de TODAS las series involucradas (incluida la del
//   candidato). Si no, un candidato con histórico corto (IPO reciente)
//   encogería solo la ventana de volDespues y el Δ no sería comparable.
// - Bono y efectivo entran como componente constante vía retornosCartera
//   (los pesos NO se renormalizan sobre las series).
// Precondición de la UI: monto > 0 (la función no se llama si no).
export function simularCompra(
  valores: Record<string, number>,
  series: Record<string, Serie>,
  tipos: Record<string, TipoActivo>,
  candidato: Candidato,
  monto: number
): ResultadoSimulacion | null {
  const conSerie = Object.keys(valores).filter((t) => series[t] && t !== candidato.ticker)
  const involucradas: Record<string, Serie> = {}
  for (const t of conSerie) involucradas[t] = series[t]
  involucradas[candidato.ticker] = candidato.serie
  const recortadas = recortarAInterseccion(involucradas)
  const nRetornos = (recortadas[candidato.ticker]?.fechas.length ?? 0) - 1
  if (nRetornos < MIN_RETORNOS_SIMULACION) return null

  const pesosAntes = pesos(valores)
  const pesosDespues = pesos({ ...valores, [candidato.ticker]: (valores[candidato.ticker] ?? 0) + monto })

  // Factor anual 252 SIEMPRE: es el que ya usa el cálculo de cartera de
  // /evaluacion (page.tsx hace volatilidadAnualizada(rc, 252) incondicional)
  // y el Δ del simulador debe ser comparable con ese número del header.
  // El parámetro `tipos` se conserva por la firma del spec.
  const FACTOR_CARTERA = 252

  const volAntes = volatilidadAnualizada(retornosCartera(recortadas, pesosAntes), FACTOR_CARTERA)
  const volDespues = volatilidadAnualizada(retornosCartera(recortadas, pesosDespues), FACTOR_CARTERA)

  // Correlación media del candidato contra las OTRAS posiciones con serie
  // (misma convención por pares que la tarjeta de posición: retornosComunes
  // sobre las series originales).
  const correlacionMedia =
    conSerie.length === 0
      ? null
      : conSerie.reduce((s, t) => {
          const [ra, rb] = retornosComunes(candidato.serie, series[t])
          return s + correlacion(ra, rb)
        }, 0) / conSerie.length

  return { pesoNuevo: pesosDespues[candidato.ticker], volAntes, volDespues, correlacionMedia }
}

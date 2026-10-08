import type { Storage } from './storage'
import type { Operacion, Plataforma, Portfolio, Precios, Snapshot } from './tipos'
import { aportesNetosEntre, modifiedDietz } from './analitica'
import { valorPosicion } from './calculos'
import { obtenerPrecios, type Resultado } from './precios'
import { obtenerHistoricos, tickersDelPortfolio, type Serie } from './historicos'
import { calcularIndicadores, type Indicadores } from './indicadores'
import { obtenerInsiders, type ResumenInsiders } from './insiders'
import { evaluarPosicion, type Evaluacion } from './senales'
import { predecir, type Banda } from './predictor'
import type { PrediccionesDoc, Horizonte } from './registroPredicciones'
import type { RecomendacionesDoc } from './recomendaciones'
import { correlacion, maxDrawdown, pesos, retornosComunes } from './riesgo'
import { resumirDesempenoAgente, type DesempenoAgente } from './seguimientoRecomendaciones'
import { universoEfectivo, type EntradaWatchlist, type WatchlistDoc } from './watchlist'

export interface PosicionContexto {
  ticker: string
  nombre: string
  tipo: 'acciones' | 'cripto'
  cantidad: number
  costoUSD: number
  valorUSD: number
  peso: number
  indicadores: Indicadores | null
  evaluacion: Evaluacion | null
  prediccion1m: Banda | null
  // Correlación media contra el resto de la cartera con serie (como en
  // /evaluacion); null sin serie propia o sin otras series para comparar.
  correlacionMedia: number | null
  // Operaciones de insiders (SEC Form 4) de los últimos 90 días. null para
  // cripto (no hay Form 4) o si OpenInsider no respondió y no hay persistido.
  insiders: ResumenInsiders | null
}

// Candidato de la watchlist con el mismo paquete analítico que una posición:
// evaluado con peso 0 (igual que Oportunidades en /evaluacion), para que el
// agente pueda proponer entradas apoyándose en el modelo y no de memoria.
export interface CandidatoContexto extends EntradaWatchlist {
  indicadores: Indicadores | null
  evaluacion: Evaluacion | null
  prediccion1m: Banda | null
  // Correlación media del candidato contra las series de la cartera: alta ⇒
  // comprarlo agrega poco en diversificación aunque la señal sea buena.
  correlacionMediaVsCartera: number | null
  insiders: ResumenInsiders | null
}

export interface ParCorrelacionado {
  a: string
  b: string
  correlacion: number
}

// Resumen de la curva de patrimonio (snapshots diarios) para que el agente
// razone sobre la tendencia de la cartera, no solo de cada ticker.
export interface EvolucionContexto {
  // Últimos 30 snapshots, viejos → nuevos.
  snapshots: Array<{ fecha: string; totalUSD: number }>
  // Variación del total vs ~7/30 días atrás, NETA de depósitos y retiros
  // (mismo criterio que el hero del dashboard); null sin snapshot base.
  variacion7dUSD: number | null
  variacion30dUSD: number | null
  // Retorno Modified Dietz sobre todo el historial de snapshots.
  dietz: { retorno: number; desde: string } | null
  // Peor caída pico-a-valle de la curva de totalUSD (negativo o 0).
  maxDrawdownCurva: number | null
}

export interface DesempenoHorizonte {
  vencidas: number
  dentroBanda: number
  errorMedianoPct: number | null // mediana de |real − p50| / precioOrigen
}

// Track record del predictor sobre predicciones YA vencidas (el mismo
// historial de /predicciones), para que el agente sepa cuánta confianza
// darle a las bandas antes de apoyarse en ellas.
export interface DesempenoPredictor {
  vencidas: number
  dentroBanda: number
  tasaDentroBanda: number | null // esperado ≈ 0.80 si las bandas calibran bien
  porHorizonte: Record<Horizonte, DesempenoHorizonte>
}

export interface ContextoAgente {
  fecha: string
  monedaBase: string
  plataformas: Plataforma[]
  precios: Resultado
  posiciones: PosicionContexto[]
  watchlist: CandidatoContexto[]
  // Últimas operaciones reales del usuario (máx 50, fecha descendente) para
  // que el agente contraste sus recomendaciones con el comportamiento real.
  operaciones: Operacion[]
  efectivoTotalUSD: number
  // null = sin predicciones vencidas todavía o fallo leyendo el registro.
  desempenoPredictor: DesempenoPredictor | null
  // Track record del propio agente: qué pasó con el precio después de cada
  // comprar/vender que recomendó. null = sin recomendaciones evaluables.
  desempenoAgente: DesempenoAgente | null
  // Pares de la cartera con |correlación| ≥ 0.7 sobre retornos comunes.
  paresCorrelacionados: ParCorrelacionado[]
  // null = sin snapshots o fallo leyéndolos (best-effort).
  evolucion: EvolucionContexto | null
  // Frescura del dato de insiders: fecha de descarga y si se sirvió del
  // persistido por fallo de OpenInsider. null = sin dato en absoluto.
  insidersFuente: { fecha: string; desactualizado: boolean } | null
}

const PORTFOLIO_VACIO: Portfolio = { monedaBase: 'USD', plataformas: [], operaciones: [] }
const UMBRAL_PAR_CORRELACIONADO = 0.7
const redondear2 = (n: number) => Math.round(n * 100) / 100

// Aritmética ISO en UTC explícito (mismo criterio que registroPredicciones).
function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}

export function resumirEvolucion(snapshots: Snapshot[] | null, ops: Operacion[]): EvolucionContexto | null {
  const lista = [...(snapshots ?? [])]
    .filter((s) => typeof s?.fecha === 'string' && typeof s?.totalUSD === 'number')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (lista.length === 0) return null
  const ultimo = lista[lista.length - 1]
  // Variación vs el snapshot más reciente con al menos N días de antigüedad,
  // neta de aportes: la misma resta que hace el hero para no contar como
  // ganancia la plata que simplemente entró.
  const variacion = (dias: number): number | null => {
    const limite = restarDias(ultimo.fecha, dias)
    const base = [...lista].reverse().find((s) => s.fecha <= limite)
    if (!base) return null
    return redondear2(ultimo.totalUSD - base.totalUSD - aportesNetosEntre(ops, base.fecha, ultimo.fecha))
  }
  return {
    snapshots: lista.slice(-30).map((s) => ({ fecha: s.fecha, totalUSD: s.totalUSD })),
    variacion7dUSD: variacion(7),
    variacion30dUSD: variacion(30),
    dietz: modifiedDietz(lista, ops),
    maxDrawdownCurva: lista.length >= 2 ? maxDrawdown(lista.map((s) => s.totalUSD)) : null,
  }
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const orden = [...xs].sort((a, b) => a - b)
  const m = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[m] : (orden[m - 1] + orden[m]) / 2
}

// Agrega el historial de predicciones resueltas en un resumen chico (total y
// por horizonte). Con cero vencidas devuelve null: "sin track record" es
// distinto de "acierta 0%".
export function resumirDesempeno(doc: PrediccionesDoc | null): DesempenoPredictor | null {
  const vencidas = (doc?.registros ?? []).filter(
    (r): r is typeof r & { resultado: NonNullable<typeof r.resultado> } => r.resultado !== null
  )
  if (vencidas.length === 0) return null
  const porHorizonte = {} as Record<Horizonte, DesempenoHorizonte>
  for (const h of ['1m', '3m'] as const) {
    const del = vencidas.filter((r) => r.horizonte === h)
    porHorizonte[h] = {
      vencidas: del.length,
      dentroBanda: del.filter((r) => r.resultado.dentroBanda).length,
      errorMedianoPct: mediana(del.map((r) => r.resultado.errorPct)),
    }
  }
  const dentroBanda = vencidas.filter((r) => r.resultado.dentroBanda).length
  return {
    vencidas: vencidas.length,
    dentroBanda,
    tasaDentroBanda: dentroBanda / vencidas.length,
    porHorizonte,
  }
}

// Mismo criterio que la página de evaluación: el precio de mercado manda y,
// si el proveedor no lo trae, se usa el último cierre de la serie histórica.
function precioTicker(ticker: string, precios: Precios, series: Record<string, Serie>): number | undefined {
  if (precios[ticker] !== undefined) return precios[ticker]
  const serie = series[ticker]
  if (serie && serie.precios.length > 0) return serie.precios[serie.precios.length - 1]
  return undefined
}

/**
 * Arma el paquete de datos que consume el agente de recomendaciones: cartera
 * cruda, precios, y por cada posición Y candidato de watchlist sus
 * indicadores, veredicto heurístico y banda de predicción a 1 mes, más el
 * track record del predictor. Compone la misma cadena
 * históricos → indicadores → evaluación que la página /evaluacion, para que el
 * agente razone sobre exactamente los mismos números que ve el usuario.
 *
 * Degrada en vez de fallar: sin red, `obtenerPrecios` y `obtenerHistoricos`
 * caen al último dato persistido (`desactualizado: true`). Si una posición no
 * tiene serie histórica, sus indicadores/evaluación/predicción van en null (no
 * se llama a `calcularIndicadores` con serie vacía: devolvería precio
 * `undefined`).
 *
 * Lo que NO degrada: un error real leyendo `portfolio` o `watchlist` (fallo
 * transitorio del storage, no "el doc no existe") se propaga y el route lo
 * convierte en 503. Devolver 200 con la cartera vacía haría que el agente
 * recomiende sobre una cartera inexistente y persista esas recomendaciones.
 */
export async function armarContexto(storage: Storage, fetchFn: typeof fetch = fetch): Promise<ContextoAgente> {
  const portfolio = ((await storage.leer('portfolio')) as Portfolio | null) ?? PORTFOLIO_VACIO
  const preciosRes = await obtenerPrecios(fetchFn, storage)

  const enCartera = tickersDelPortfolio(portfolio)
  const rawWatchlist = (await storage.leer('watchlist')) as Partial<WatchlistDoc> | null
  const docWatchlist: WatchlistDoc = {
    agregados: rawWatchlist?.agregados ?? [],
    ocultos: rawWatchlist?.ocultos ?? [],
  }
  const watchlist = universoEfectivo(docWatchlist, enCartera.map((t) => t.ticker))

  // Insiders solo para acciones (cripto no presenta Form 4). Corre en paralelo
  // a los históricos: son fuentes independientes y así no suma latencia.
  const tickersAcciones = [
    ...enCartera.filter((t) => t.tipo === 'acciones').map((t) => t.ticker),
    ...watchlist.filter((e) => e.tipo === 'acciones').map((e) => e.ticker),
  ]
  const [historicos, insiders] = await Promise.all([
    obtenerHistoricos(portfolio, watchlist, fetchFn, storage),
    obtenerInsiders(tickersAcciones, fetchFn, storage).catch(() => null),
  ])
  const insidersDe = (ticker: string, tipo: 'acciones' | 'cripto'): ResumenInsiders | null =>
    tipo === 'acciones' ? insiders?.porTicker[ticker] ?? null : null

  // Posiciones de mercado (acciones y cripto): efectivo y bonos no llevan
  // indicadores, viajan en `plataformas` y en `efectivoTotalUSD`.
  const crudas = portfolio.plataformas.flatMap((pl) =>
    pl.posiciones.filter((p) => (p.tipo === 'acciones' || p.tipo === 'cripto') && p.ticker)
  )

  // `valorDe` es por posición; `valores` agrega por ticker (misma tenencia en
  // dos plataformas es un solo ticker a efectos de peso/concentración).
  const valorDe = new Map<(typeof crudas)[number], number>()
  const valores: Record<string, number> = {}
  for (const p of crudas) {
    const precio = precioTicker(p.ticker, preciosRes.precios, historicos.series)
    const valor = precio === undefined ? p.costoUSD : p.cantidad * precio
    valorDe.set(p, valor)
    valores[p.ticker] = (valores[p.ticker] ?? 0) + valor
  }
  // Denominador del peso = cartera COMPLETA, igual que /evaluacion: efectivo y
  // bonos entran como claves 'EFECTIVO' y 'BONO'. Sin ellos los pesos saldrían
  // inflados y `evaluarPosicion` forzaría 'reducir' (PESO_MAXIMO) en casos en
  // que el usuario no lo ve.
  const hoy = new Date()
  for (const pl of portfolio.plataformas) {
    if (pl.efectivoUSD !== 0) valores.EFECTIVO = (valores.EFECTIVO ?? 0) + pl.efectivoUSD
    for (const p of pl.posiciones) {
      if (p.tipo === 'bono') valores.BONO = (valores.BONO ?? 0) + valorPosicion(p, preciosRes.precios, hoy)
    }
  }
  const pesosPorTicker = pesos(valores)

  // Correlaciones entre los tickers de cartera con serie, calculadas una vez
  // (los pares se reutilizan para la correlación media de cada posición).
  const tickersCartera = [...new Set(crudas.map((p) => p.ticker))].filter(
    (t) => historicos.series[t] && historicos.series[t].precios.length > 0
  )
  const corrPares = new Map<string, number>()
  const paresCorrelacionados: ParCorrelacionado[] = []
  for (let i = 0; i < tickersCartera.length; i++) {
    for (let j = i + 1; j < tickersCartera.length; j++) {
      const [ra, rb] = retornosComunes(historicos.series[tickersCartera[i]], historicos.series[tickersCartera[j]])
      const c = correlacion(ra, rb)
      corrPares.set(`${tickersCartera[i]}|${tickersCartera[j]}`, c)
      corrPares.set(`${tickersCartera[j]}|${tickersCartera[i]}`, c)
      if (Math.abs(c) >= UMBRAL_PAR_CORRELACIONADO) {
        paresCorrelacionados.push({ a: tickersCartera[i], b: tickersCartera[j], correlacion: redondear2(c) })
      }
    }
  }
  paresCorrelacionados.sort((x, y) => Math.abs(y.correlacion) - Math.abs(x.correlacion))
  const correlacionMediaDe = (ticker: string): number | null => {
    const otros = tickersCartera.filter((t) => t !== ticker)
    if (!historicos.series[ticker] || otros.length === 0) return null
    const suma = otros.reduce((s, o) => s + (corrPares.get(`${ticker}|${o}`) ?? 0), 0)
    return redondear2(suma / otros.length)
  }

  const posiciones: PosicionContexto[] = crudas.map((p) => {
    const tipo = p.tipo as 'acciones' | 'cripto'
    const serie = historicos.series[p.ticker]
    const hayserie = Boolean(serie && serie.precios.length > 0)
    const peso = pesosPorTicker[p.ticker] ?? 0
    const indicadores = hayserie ? calcularIndicadores(serie.precios, tipo) : null
    const prediccion = hayserie ? predecir(serie.precios, tipo) : null
    const insidersPos = insidersDe(p.ticker, tipo)
    return {
      ticker: p.ticker,
      nombre: p.nombre,
      tipo,
      cantidad: p.cantidad,
      costoUSD: p.costoUSD,
      valorUSD: valorDe.get(p) ?? 0,
      peso,
      indicadores,
      evaluacion: indicadores ? evaluarPosicion(p.ticker, indicadores, tipo, peso, insidersPos) : null,
      prediccion1m: prediccion?.m1 ?? null,
      correlacionMedia: correlacionMediaDe(p.ticker),
      insiders: insidersPos,
    }
  })

  // Candidatos de la watchlist con el mismo paquete analítico que las
  // posiciones (obtenerHistoricos ya bajó sus series). Peso 0, igual que
  // Oportunidades en /evaluacion: todavía no están en cartera.
  const candidatos: CandidatoContexto[] = watchlist.map((e) => {
    const serie = historicos.series[e.ticker]
    const hayserie = Boolean(serie && serie.precios.length > 0)
    const indicadores = hayserie ? calcularIndicadores(serie.precios, e.tipo) : null
    const prediccion = hayserie ? predecir(serie.precios, e.tipo) : null
    let correlacionMediaVsCartera: number | null = null
    if (hayserie && tickersCartera.length > 0) {
      const suma = tickersCartera.reduce((s, t) => {
        const [ra, rb] = retornosComunes(serie, historicos.series[t])
        return s + correlacion(ra, rb)
      }, 0)
      correlacionMediaVsCartera = redondear2(suma / tickersCartera.length)
    }
    const insidersCand = insidersDe(e.ticker, e.tipo)
    return {
      ...e,
      indicadores,
      evaluacion: indicadores ? evaluarPosicion(e.ticker, indicadores, e.tipo, 0, insidersCand) : null,
      prediccion1m: prediccion?.m1 ?? null,
      correlacionMediaVsCartera,
      insiders: insidersCand,
    }
  })

  // Track record del predictor. Best-effort: si el doc no se puede leer, el
  // agente pierde el hit-rate pero el contexto sigue sirviendo (a diferencia
  // de portfolio/watchlist, donde un fallo de lectura sí aborta).
  let desempenoPredictor: DesempenoPredictor | null = null
  try {
    desempenoPredictor = resumirDesempeno((await storage.leer('predicciones')) as PrediccionesDoc | null)
  } catch {
    desempenoPredictor = null
  }

  // Track record del propio agente sobre sus corridas pasadas. Best-effort.
  let desempenoAgente: DesempenoAgente | null = null
  try {
    desempenoAgente = resumirDesempenoAgente(
      (await storage.leer('recomendaciones')) as RecomendacionesDoc | null,
      preciosRes.precios,
      historicos.series,
      portfolio.operaciones ?? []
    )
  } catch {
    desempenoAgente = null
  }

  // Curva de patrimonio. Mismo criterio best-effort que el track record: sin
  // snapshots legibles el agente pierde la tendencia pero el contexto sirve.
  let evolucion: EvolucionContexto | null = null
  try {
    evolucion = resumirEvolucion((await storage.leer('snapshots')) as Snapshot[] | null, portfolio.operaciones ?? [])
  } catch {
    evolucion = null
  }

  const operaciones = [...(portfolio.operaciones ?? [])]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 50)

  return {
    fecha: new Date().toISOString().slice(0, 10),
    monedaBase: portfolio.monedaBase,
    plataformas: portfolio.plataformas,
    precios: preciosRes,
    posiciones,
    watchlist: candidatos,
    operaciones,
    efectivoTotalUSD: portfolio.plataformas.reduce((s, pl) => s + pl.efectivoUSD, 0),
    desempenoPredictor,
    desempenoAgente,
    paresCorrelacionados,
    evolucion,
    insidersFuente: insiders ? { fecha: insiders.fecha, desactualizado: insiders.desactualizado } : null,
  }
}

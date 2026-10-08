import { normalizarTicker } from './watchlist'
import type { Storage } from './storage'

export interface OperacionInsider {
  ticker: string
  fecha: string // fecha de la operación (YYYY-MM-DD)
  fechaFiling: string // fecha en que se presentó el Form 4
  insider: string
  cargo: string
  tipo: 'compra' | 'venta'
  precio: number
  cantidad: number // siempre positiva; el signo va en `tipo`
  valorUSD: number // siempre positivo
}

function limpiarCelda(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

function numero(s: string): number {
  return Math.abs(Number(s.replace(/[^0-9.-]/g, '')))
}

// Índice de cada columna según el encabezado: el screener agrega "Company
// Name" cuando se piden varios tickers, así que las posiciones no son fijas.
const COLUMNAS = {
  filing: 'filing date',
  fecha: 'trade date',
  ticker: 'ticker',
  insider: 'insider name',
  cargo: 'title',
  tipo: 'trade type',
  precio: 'price',
  cantidad: 'qty',
  valor: 'value',
} as const

function mapearColumnas(filaEncabezado: string): Record<keyof typeof COLUMNAS, number> | null {
  const ths = (filaEncabezado.match(/<th[\s\S]*?<\/th>/g) ?? []).map((c) => limpiarCelda(c).toLowerCase())
  const out = {} as Record<keyof typeof COLUMNAS, number>
  for (const [clave, nombre] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string][]) {
    const i = ths.indexOf(nombre)
    if (i < 0) return null
    out[clave] = i
  }
  return out
}

/**
 * Parsea la tabla de resultados del screener de OpenInsider. Solo interesan
 * las operaciones en mercado abierto: "P - Purchase" y "S - Sale" (incluida
 * "S - Sale+OE"). Grants, ejercicios de opciones y pagos de impuestos son
 * ruido para leer la convicción de los insiders y se descartan.
 */
export function parsearScreener(html: string): OperacionInsider[] {
  const tabla = html.match(/<table[^>]*class="tinytable"[^>]*>([\s\S]*?)<\/table>/)
  if (!tabla) return []
  const filas = tabla[1].match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const encabezado = filas.find((f) => /<th/i.test(f))
  const col = encabezado ? mapearColumnas(encabezado) : null
  if (!col) return []
  const out: OperacionInsider[] = []
  for (const fila of filas) {
    const celdas = (fila.match(/<td[\s\S]*?<\/td>/g) ?? []).map(limpiarCelda)
    if (celdas.length <= col.valor) continue
    const tradeType = celdas[col.tipo]
    const tipo = tradeType.startsWith('P - ') ? 'compra' : tradeType.startsWith('S - ') ? 'venta' : null
    if (!tipo) continue
    // La celda del ticker arrastra restos de un tooltip con '>' dentro de un
    // atributo; el símbolo es siempre el último tramo.
    const crudo = celdas[col.ticker]
    const ticker = normalizarTicker(crudo.split('>').pop() ?? crudo)
    const fecha = celdas[col.fecha]
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
    out.push({
      ticker,
      fecha,
      fechaFiling: celdas[col.filing].slice(0, 10),
      insider: celdas[col.insider],
      cargo: celdas[col.cargo],
      tipo,
      precio: numero(celdas[col.precio]),
      cantidad: numero(celdas[col.cantidad]),
      valorUSD: numero(celdas[col.valor]),
    })
  }
  return out
}

export type SenalInsiders = 'compra_cluster' | 'compras' | 'neutral' | 'ventas' | 'venta_cluster'
export type Tendencia = 'compras' | 'ventas' | 'neutral'

export interface ResumenInsiders {
  compras: number
  ventas: number
  compradoUSD: number
  vendidoUSD: number
  // Insiders DISTINTOS comprando/vendiendo en la ventana de 90 días. Tres o
  // más comprando a la vez ("cluster buying") es la señal más informativa de
  // Form 4; las ventas sueltas suelen ser diversificación o liquidez y pesan
  // poco, salvo que también sean varios insiders a la vez.
  insidersComprando: number
  insidersVendiendo: number
  // Neto comprado − vendido de los últimos 30 días y su signo: la ventana de
  // 90 puede decir "ventas" mientras el insider viene comprando hace semanas
  // (o al revés). Las dos lecturas viajan para que la divergencia sea visible.
  neto30dUSD: number
  tendencia30d: Tendencia
  senal: SenalInsiders
  ultimas: OperacionInsider[] // más recientes primero, máx MAX_ULTIMAS
}

export const MIN_INSIDERS_CLUSTER = 3
// Operaciones menores a este monto son ruido (ventas de USD 1.000 para
// cubrir impuestos, redondeos de planes automáticos) y no dicen nada de la
// convicción del insider: no cuentan para nada.
export const MIN_VALOR_USD = 10_000
const DIAS_TENDENCIA = 30
const MAX_ULTIMAS = 5

const VACIO: ResumenInsiders = {
  compras: 0, ventas: 0, compradoUSD: 0, vendidoUSD: 0, insidersComprando: 0, insidersVendiendo: 0,
  neto30dUSD: 0, tendencia30d: 'neutral', senal: 'neutral', ultimas: [],
}

const signo = (neto: number): Tendencia => (neto > 0 ? 'compras' : neto < 0 ? 'ventas' : 'neutral')

function senalDe(r: Pick<ResumenInsiders, 'insidersComprando' | 'insidersVendiendo' | 'compradoUSD' | 'vendidoUSD'>): SenalInsiders {
  const neto = r.compradoUSD - r.vendidoUSD
  // Cluster de compras manda: varios insiders poniendo plata propia es más
  // raro (y más informativo) que varios vendiendo.
  if (r.insidersComprando >= MIN_INSIDERS_CLUSTER) return 'compra_cluster'
  if (r.insidersVendiendo >= MIN_INSIDERS_CLUSTER && neto < 0) return 'venta_cluster'
  return signo(neto)
}

// Aritmética ISO en UTC explícito (mismo criterio que contextoAgente).
function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}

// El mismo trade aparece repetido cuando se enmienda el Form 4 o cuando lo
// presentan dos entidades vinculadas (un fondo y su GP, un director y su
// trust). Se colapsa por (fecha, tipo, cantidad, precio): dos insiders
// realmente distintos comprando la misma cantidad al mismo centavo el mismo
// día es mucho menos probable que el duplicado, y el costo del error es
// inflar un "cluster" que no existe.
function sinDuplicados(ops: OperacionInsider[]): OperacionInsider[] {
  const vistos = new Set<string>()
  return ops.filter((o) => {
    const clave = `${o.ticker}|${o.fecha}|${o.tipo}|${o.cantidad}|${o.precio}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}

// Un resumen por ticker pedido (siempre presente, aunque sea neutral vacío,
// para que "sin datos" y "sin operaciones" se distingan en el contexto).
export function resumirInsiders(
  ops: OperacionInsider[],
  tickers: string[],
  hoy: string = new Date().toISOString().slice(0, 10)
): Record<string, ResumenInsiders> {
  const unicas = sinDuplicados(ops.filter((o) => o.valorUSD >= MIN_VALOR_USD))
  const desde30d = restarDias(hoy, DIAS_TENDENCIA)
  const out: Record<string, ResumenInsiders> = {}
  for (const t of tickers) {
    const propias = unicas.filter((o) => o.ticker === t).sort((a, b) => b.fecha.localeCompare(a.fecha))
    if (propias.length === 0) {
      out[t] = { ...VACIO, ultimas: [] }
      continue
    }
    const compras = propias.filter((o) => o.tipo === 'compra')
    const ventas = propias.filter((o) => o.tipo === 'venta')
    const neto30dUSD = propias
      .filter((o) => o.fecha >= desde30d)
      .reduce((s, o) => s + (o.tipo === 'compra' ? o.valorUSD : -o.valorUSD), 0)
    const base = {
      compras: compras.length,
      ventas: ventas.length,
      compradoUSD: compras.reduce((s, o) => s + o.valorUSD, 0),
      vendidoUSD: ventas.reduce((s, o) => s + o.valorUSD, 0),
      insidersComprando: new Set(compras.map((o) => o.insider)).size,
      insidersVendiendo: new Set(ventas.map((o) => o.insider)).size,
    }
    out[t] = {
      ...base,
      neto30dUSD,
      tendencia30d: signo(neto30dUSD),
      senal: senalDe(base),
      ultimas: propias.slice(0, MAX_ULTIMAS),
    }
  }
  return out
}

export interface Insiders {
  fecha: string // día en que se bajaron los datos
  porTicker: Record<string, ResumenInsiders>
  desactualizado: boolean
}

const CACHE_MS = 24 * 60 * 60 * 1000
const TAMANO_LOTE = 20 // verificado a mano: 20 tickers en un `s=` responden bien
const VENTANA_DIAS = 90

let cache: { hasta: number; clave: string; res: Insiders } | null = null
export function _resetCache() { cache = null }

function urlScreener(tickers: string[]): string {
  const u = new URL('http://openinsider.com/screener')
  u.searchParams.set('s', tickers.join(' '))
  u.searchParams.set('fd', String(VENTANA_DIAS)) // filing date: últimos N días
  u.searchParams.set('td', '0')
  u.searchParams.set('xp', '1') // incluir compras
  u.searchParams.set('xs', '1') // incluir ventas
  u.searchParams.set('cnt', '1000')
  u.searchParams.set('sortcol', '0')
  return u.toString()
}

const TIMEOUT_MS = 15_000

interface Bajada {
  ops: OperacionInsider[]
  respondidos: string[] // tickers cuyo lote respondió; los demás quedan sin dato
}

async function bajarOperaciones(tickers: string[], fetchFn: typeof fetch): Promise<Bajada | null> {
  const lotes: string[][] = []
  for (let i = 0; i < tickers.length; i += TAMANO_LOTE) lotes.push(tickers.slice(i, i + TAMANO_LOTE))
  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      try {
        const r = await fetchFn(urlScreener(lote), {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const html = await r.text()
        // Una página de error/bloqueo no trae la tabla de resultados: es un
        // fallo, no "cero operaciones" (que se cachearía como neutral 24 h).
        if (!/class="tinytable"/.test(html)) throw new Error('sin tabla de resultados')
        // Cada lote aporta SOLO sus tickers: una fila ajena (o repetida entre
        // lotes) no debe inflar el resumen de nadie.
        const pedidos = new Set(lote)
        return parsearScreener(html).filter((o) => pedidos.has(o.ticker))
      } catch {
        console.warn(`insiders: fallo el lote ${lote.join(',')}`)
        return null
      }
    })
  )
  // Si TODOS los lotes fallaron, no hay dato fresco: que el llamador degrade.
  if (resultados.every((r) => r === null)) return null
  return {
    ops: resultados.flatMap((r) => r ?? []),
    respondidos: lotes.flatMap((lote, i) => (resultados[i] === null ? [] : lote)),
  }
}

async function leerPersistido(storage: Storage): Promise<Insiders | null> {
  try {
    const raw = (await storage.leer('insiders')) as Partial<Insiders> | null
    if (!raw?.porTicker) return null
    return { fecha: raw.fecha ?? '', porTicker: raw.porTicker, desactualizado: true }
  } catch {
    return null
  }
}

/**
 * Operaciones de insiders (SEC Form 4 vía OpenInsider) de los últimos 90 días
 * para los tickers pedidos, resumidas por ticker. Caché en memoria de 24 h y
 * persistencia best-effort en el doc `insiders` como fallback si el sitio no
 * responde. Devuelve null solo si no hay dato fresco NI persistido.
 */
export async function obtenerInsiders(
  tickers: string[],
  fetchFn: typeof fetch = fetch,
  storage: Storage
): Promise<Insiders | null> {
  const unicos = [...new Set(tickers)].sort()
  const clave = unicos.join(',')
  if (cache && Date.now() < cache.hasta && cache.clave === clave) return cache.res

  const fecha = new Date().toISOString().slice(0, 10)
  if (unicos.length === 0) return { fecha, porTicker: {}, desactualizado: false }

  const bajada = await bajarOperaciones(unicos, fetchFn)
  if (bajada === null) return leerPersistido(storage)

  // Solo los tickers cuyo lote respondió reciben resumen: un lote caído no
  // debe convertir a sus tickers en "neutral" (eso es un dato, no una falta).
  const porTicker = resumirInsiders(bajada.ops, bajada.respondidos)
  const res: Insiders = { fecha, porTicker, desactualizado: false }
  try {
    // Al persistir se conserva lo previo de los tickers sin dato fresco, con
    // el mismo criterio que `historicos`: lo viejo es mejor que nada.
    const previo = await leerPersistido(storage)
    await storage.escribir('insiders', { fecha, porTicker: { ...(previo?.porTicker ?? {}), ...porTicker } })
  } catch {
    console.warn('insiders: no se pudo persistir')
  }
  // Un lote fallido no entra en la clave: el request siguiente lo reintenta.
  cache = { hasta: Date.now() + CACHE_MS, clave: bajada.respondidos.join(','), res }
  return res
}

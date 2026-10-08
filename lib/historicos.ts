import type { Portfolio } from './tipos'
import { crearStorage, type Storage } from './storage'

const CACHE_MS = 24 * 60 * 60 * 1000
const TAMANO_LOTE = 5

export interface Serie { fechas: string[]; precios: number[] }

export interface Historicos {
  fecha: string
  series: Record<string, Serie>
  desactualizado: boolean
}

export interface TickerTipo { ticker: string; tipo: 'acciones' | 'cripto' }

// La caché guarda también la clave del SET de tickers que sirvió: si el set
// pedido difiere (watchlist editada), la caché por tiempo NO alcanza.
let cache: { hasta: number; clave: string; res: Historicos } | null = null
export function _resetCache() { cache = null }

export function tickersDelPortfolio(pf: Portfolio): TickerTipo[] {
  const vistos = new Set<string>()
  const out: TickerTipo[] = []
  for (const plataforma of pf.plataformas) {
    for (const pos of plataforma.posiciones) {
      if ((pos.tipo === 'acciones' || pos.tipo === 'cripto') && pos.ticker && !vistos.has(pos.ticker)) {
        vistos.add(pos.ticker)
        out.push({ ticker: pos.ticker, tipo: pos.tipo })
      }
    }
  }
  return out
}

export function simboloYahoo(ticker: string, tipo: 'acciones' | 'cripto'): string {
  return tipo === 'cripto' ? `${ticker}-USD` : ticker
}

interface ChartJson {
  chart?: { result?: { timestamp?: (number | null)[]; indicators?: { adjclose?: { adjclose?: (number | null)[] }[] } }[] }
}

function parsearChart(json: ChartJson): Serie | null {
  const r = json?.chart?.result?.[0]
  const ts = r?.timestamp ?? []
  const adj = r?.indicators?.adjclose?.[0]?.adjclose ?? []
  const fechas: string[] = []
  const precios: number[] = []
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]
    const p = adj[i]
    if (typeof t === 'number' && typeof p === 'number') {
      fechas.push(new Date(t * 1000).toISOString().slice(0, 10))
      precios.push(p)
    }
  }
  return fechas.length ? { fechas, precios } : null
}

// Los adjclose de Yahoo traen 13+ decimales y duplican el tamaño del JSON
// que viaja al browser: se redondea a 4 decimales al persistir.
function redondearSerie(s: Serie): Serie {
  return { fechas: s.fechas, precios: s.precios.map((p) => Math.round(p * 10000) / 10000) }
}

function claveSet(tickers: TickerTipo[]): string {
  return tickers.map((t) => t.ticker).sort().join(',')
}

// Conserva solo las series del universo actual (cartera ∪ watchlist visible):
// las de tickers quitados no quedan huérfanas creciendo el doc para siempre.
function podar(series: Record<string, Serie>, universo: TickerTipo[]): Record<string, Serie> {
  const permitidos = new Set(universo.map((t) => t.ticker))
  return Object.fromEntries(Object.entries(series).filter(([t]) => permitidos.has(t)))
}

// Fetches a Yahoo en lotes de TAMANO_LOTE en paralelo: ~32 requests seriales
// rozan el timeout de la función; en lotes de 5 tardan 2-3 s.
async function bajarSeries(tickers: TickerTipo[], fetchFn: typeof fetch): Promise<Record<string, Serie>> {
  const out: Record<string, Serie> = {}
  for (let i = 0; i < tickers.length; i += TAMANO_LOTE) {
    const lote = tickers.slice(i, i + TAMANO_LOTE)
    await Promise.all(
      lote.map(async ({ ticker, tipo }) => {
        // Un ticker que falle (red, 404, JSON inválido) se excluye sin abortar el resto.
        try {
          const r = await fetchFn(
            `https://query1.finance.yahoo.com/v8/finance/chart/${simboloYahoo(ticker, tipo)}?range=2y&interval=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          )
          const serie = parsearChart(await r.json())
          if (serie) out[ticker] = redondearSerie(serie)
        } catch {
          console.warn(`historicos: fallo al obtener ${ticker}`)
        }
      })
    )
  }
  return out
}

async function leerPersistido(storage: Storage): Promise<Historicos> {
  // Degradación deliberada: esta función YA es el fallback ante fallos de red
  // al bajar series frescas. Si además falla la lectura del persistido (ahora
  // que `leer` puede relanzar errores reales), se trata igual que "no hay
  // persistido" en vez de tumbar la respuesta: raw = null.
  let raw: { fecha?: string; series?: Record<string, Serie> } | null = null
  try {
    raw = (await storage.leer('historicos')) as { fecha?: string; series?: Record<string, Serie> } | null
  } catch {
    raw = null
  }
  return { fecha: raw?.fecha ?? '', series: raw?.series ?? {}, desactualizado: true }
}

export async function obtenerHistoricos(
  pf: Portfolio,
  extraTickers: TickerTipo[] = [],
  fetchFn: typeof fetch = fetch,
  storage: Storage = crearStorage()
): Promise<Historicos> {
  // Universo = cartera ∪ extra (si un ticker está en ambos, manda la cartera).
  const delPortfolio = tickersDelPortfolio(pf)
  const enPortfolio = new Set(delPortfolio.map((t) => t.ticker))
  const universo = [...delPortfolio, ...extraTickers.filter((t) => !enPortfolio.has(t.ticker))]
  const clave = claveSet(universo)

  if (cache && Date.now() < cache.hasta) {
    if (cache.clave === clave) return cache.res
    // El set cambió dentro de las 24 h: se refetchean SOLO los tickers sin
    // serie en la caché (los presentes se bajaron hace < 24 h y no se vuelven
    // a pedir). Sin esto, un ticker recién agregado a la watchlist mostraría
    // "sin datos" hasta 24 h después.
    const faltantes = universo.filter((t) => !cache!.res.series[t.ticker])
    const frescas = await bajarSeries(faltantes, fetchFn)
    const series = podar({ ...cache.res.series, ...frescas }, universo)
    const res: Historicos = { fecha: cache.res.fecha, series, desactualizado: cache.res.desactualizado }
    try {
      await storage.escribir('historicos', { fecha: res.fecha, series })
    } catch {
      console.warn('historicos: no se pudo persistir el universo nuevo')
    }
    // La clave solo incluye tickers CON serie: si el refetch de un recién
    // agregado falló, el request siguiente lo reintenta (no espera al TTL).
    // No se extiende el TTL original: los datos siguen siendo los de hoy.
    cache = { hasta: cache.hasta, clave: claveSet(universo.filter((t) => series[t.ticker])), res }
    return res
  }

  try {
    // Persistido previo: se preserva lo viejo de los tickers que fallen hoy.
    // Degradación deliberada: un error de lectura (no solo "no existe") NO debe
    // abortar todo el intento de refresco — se trata como si no hubiera previo,
    // igual que antes de que `leer` pudiera relanzar errores reales.
    let persistidoPrevio: { fecha?: string; series?: Record<string, Serie> } | null = null
    try {
      persistidoPrevio = (await storage.leer('historicos')) as { fecha?: string; series?: Record<string, Serie> } | null
    } catch {
      persistidoPrevio = null
    }
    const seriesPrevias = persistidoPrevio?.series ?? {}

    const seriesFrescas = await bajarSeries(universo, fetchFn)
    if (Object.keys(seriesFrescas).length === 0) throw new Error('sin series')
    const fecha = new Date().toISOString().slice(0, 10)
    // Fusionar (frescas pisan previas, lo viejo de los fallidos se conserva) y podar.
    const series = podar({ ...seriesPrevias, ...seriesFrescas }, universo)
    await storage.escribir('historicos', { fecha, series })
    const res: Historicos = { fecha, series, desactualizado: false }
    // Misma regla que arriba: solo los tickers CON serie entran a la clave,
    // así un fallido se reintenta en el request siguiente.
    cache = { hasta: Date.now() + CACHE_MS, clave: claveSet(universo.filter((t) => series[t.ticker])), res }
    return res
  } catch {
    return leerPersistido(storage)
  }
}

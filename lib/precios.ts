import type { Portfolio, Precios } from './tipos'
import { crearStorage, type Storage } from './storage'
import { obtenerDolarBolsa } from './dolar'

// id de CoinGecko → ticker. Cubre las criptos grandes para que una carga
// nueva no quede valuada al costo para siempre; agregar acá si aparece otra.
const CRIPTOS: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  nexo: 'NEXO',
  solana: 'SOL',
  ripple: 'XRP',
  binancecoin: 'BNB',
  cardano: 'ADA',
  dogecoin: 'DOGE',
  'avalanche-2': 'AVAX',
  polkadot: 'DOT',
  chainlink: 'LINK',
  tron: 'TRX',
  litecoin: 'LTC',
  'matic-network': 'POL',
  uniswap: 'UNI',
  cosmos: 'ATOM',
  stellar: 'XLM',
  'the-open-network': 'TON',
  'near-protocol': 'NEAR',
  aptos: 'APT',
  sui: 'SUI',
  arbitrum: 'ARB',
  optimism: 'OP',
  'internet-computer': 'ICP',
  filecoin: 'FIL',
  'hedera-hashgraph': 'HBAR',
  injective: 'INJ',
  aave: 'AAVE',
  maker: 'MKR',
  algorand: 'ALGO',
  'vechain': 'VET',
  'shiba-inu': 'SHIB',
  pepe: 'PEPE',
  tether: 'USDT',
  'usd-coin': 'USDC',
  dai: 'DAI',
}
// Tickers de las criptos que la app sabe cotizar (CoinGecko). Consumido por
// lib/movimientos.ts para inferir el tipo de una posición nueva.
export const TICKERS_CRIPTO: Set<string> = new Set(Object.values(CRIPTOS))

// Instrumentos operados en BYMA (Balanz): Yahoo los publica con sufijo .BA y
// cotizados en pesos, así que el precio se divide por el MEP para dejarlo en
// la moneda base. Las obligaciones negociables (ON) además cotizan por cada
// 100 valores nominales, mientras que la cantidad en cartera está en
// nominales: `porCada` es el divisor extra. Agregar acá si aparece otro.
//
// A propósito NO va en simboloYahoo() de historicos.ts: ahí se bajan series
// de 2 años y convertirlas necesitaría el dólar histórico, que la app no
// tiene. Con el mapeo acá, historicos descarta estos tickers (degradación ya
// prevista en bajarSeries) en vez de meter una serie en pesos al predictor.
const BYMA: Record<string, { simbolo: string; porCada: number }> = {
  PAMP: { simbolo: 'PAMP.BA', porCada: 1 },
  YM44O: { simbolo: 'YM44O.BA', porCada: 100 }, // ON de YPF
}
const CACHE_MS = 10 * 60 * 1000

let cache: { hasta: number; res: Resultado } | null = null
export function _resetCache() { cache = null }

export interface Resultado {
  precios: Precios
  variaciones: Record<string, number>
  desactualizado: boolean
  fecha: string
}

function tickersPortfolio(portfolio: Portfolio | null): { acciones: string[]; todos: string[] } {
  const acciones = new Set<string>()
  const todos = new Set<string>()
  for (const pl of portfolio?.plataformas ?? []) {
    for (const pos of pl.posiciones) {
      if (pos.tipo === 'bono' || !pos.ticker) continue
      todos.add(pos.ticker)
      if (pos.tipo === 'acciones') acciones.add(pos.ticker)
    }
  }
  return { acciones: [...acciones], todos: [...todos] }
}

async function leerPersistido(storage: Storage): Promise<Resultado> {
  // Degradación deliberada: este es el fallback ante fallos de red al bajar
  // precios frescos. Si además falla la lectura del persistido (ahora que
  // `leer` puede relanzar errores reales), se trata igual que "no hay
  // persistido" en vez de tumbar la respuesta: raw = null.
  let raw: { precios?: Precios; variaciones?: Record<string, number>; fecha?: string } | null = null
  try {
    raw = (await storage.leer('last-prices')) as
      | { precios?: Precios; variaciones?: Record<string, number>; fecha?: string }
      | null
  } catch {
    raw = null
  }
  return {
    precios: raw?.precios ?? {},
    variaciones: raw?.variaciones ?? {},
    desactualizado: true,
    fecha: raw?.fecha ?? '',
  }
}

export async function obtenerPrecios(fetchFn: typeof fetch = fetch, storage: Storage = crearStorage()): Promise<Resultado> {
  if (cache && Date.now() < cache.hasta) return cache.res
  try {
    const precios: Precios = {}
    const variaciones: Record<string, number> = {}
    const cg = await fetchFn(
      `https://api.coingecko.com/api/v3/simple/price?ids=${Object.keys(CRIPTOS).join(',')}&vs_currencies=usd&include_24hr_change=true`
    )
    const cgJson = await cg.json()
    for (const [id, ticker] of Object.entries(CRIPTOS)) {
      const usd = cgJson?.[id]?.usd
      if (typeof usd === 'number') precios[ticker] = usd
      const cambio = cgJson?.[id]?.usd_24h_change
      if (typeof cambio === 'number') variaciones[ticker] = cambio
    }
    // Los tickers de acciones salen del portfolio: si falla su lectura, el
    // catch de abajo degrada a los últimos precios persistidos.
    const { acciones, todos } = tickersPortfolio((await storage.leer('portfolio')) as Portfolio | null)
    // El MEP se pide una sola vez y solo si hay algo de BYMA que convertir.
    const dolar = acciones.some((t) => BYMA[t]) ? await obtenerDolarBolsa(fetchFn) : null
    for (const t of acciones) {
      // Sin cotización del MEP la acción en pesos no se puede convertir: se
      // omite y queda como ticker faltante (desactualizado), en vez de entrar
      // al total valuada en pesos.
      if (BYMA[t] && !dolar) continue
      const r = await fetchFn(`https://query1.finance.yahoo.com/v8/finance/chart/${BYMA[t]?.simbolo ?? t}?range=1d&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      const j = await r.json()
      const meta = j?.chart?.result?.[0]?.meta
      const precio = meta?.regularMarketPrice
      // La variación se calcula más abajo con los valores sin convertir: como
      // ambos van sobre el mismo dólar, el porcentaje no cambia.
      const aUSD = BYMA[t] ? dolar!.valor * BYMA[t].porCada : 1
      if (typeof precio === 'number') precios[t] = precio / aUSD
      const previo = meta?.chartPreviousClose ?? meta?.previousClose
      if (typeof precio === 'number' && typeof previo === 'number' && previo !== 0) {
        variaciones[t] = ((precio - previo) / previo) * 100
      }
    }
    if (Object.keys(precios).length === 0) throw new Error('sin precios')
    const fecha = new Date().toISOString().slice(0, 10)
    await storage.escribir('last-prices', { fecha, precios, variaciones })
    // Un ticker en cartera sin precio se valúa a costo (valorPosicion): el
    // total queda distorsionado, así que no se puede reportar "al día".
    const faltanPrecios = todos.some(t => precios[t] === undefined)
    const res = { precios, variaciones, desactualizado: faltanPrecios, fecha }
    cache = { hasta: Date.now() + CACHE_MS, res }
    return res
  } catch {
    return leerPersistido(storage)
  }
}

import { simboloYahoo } from './historicos'

export interface EntradaWatchlist {
  ticker: string
  tipo: 'acciones' | 'cripto'
}

export interface WatchlistDoc {
  agregados: EntradaWatchlist[]
  ocultos: string[]
}

// 25 tickers líquidos: mega-caps + ETFs populares. Todos tipo 'acciones'.
export const LISTA_CURADA: EntradaWatchlist[] = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'BRK-B',
  'JPM', 'V', 'LLY', 'UNH', 'XOM', 'COST', 'WMT', 'NFLX', 'AMD',
  'QQQ', 'VTI', 'SCHD', 'VYM', 'GLD', 'IWM', 'EEM',
].map((ticker) => ({ ticker, tipo: 'acciones' as const }))

// Mayúsculas y punto → guion (BRK.B → BRK-B, la notación de Yahoo). Con tipo
// 'cripto', además quita un sufijo -USD tipeado por el usuario: el sufijo lo
// agrega el sistema en simboloYahoo, y sin esto "BTC-USD" generaría
// BTC-USD-USD → 404 engañoso.
export function normalizarTicker(ticker: string, tipo?: 'acciones' | 'cripto'): string {
  const t = ticker.trim().toUpperCase().replace(/\./g, '-')
  return tipo === 'cripto' && t.endsWith('-USD') ? t.slice(0, -4) : t
}

// Universo efectivo = (curada − ocultos) ∪ agregados − tickers ya en cartera.
// Un ticker de cartera nunca aparece en Oportunidades aunque esté en la curada.
export function universoEfectivo(doc: WatchlistDoc, tickersCartera: string[]): EntradaWatchlist[] {
  const cartera = new Set(tickersCartera)
  const ocultos = new Set(doc.ocultos)
  const vistos = new Set<string>()
  const out: EntradaWatchlist[] = []
  for (const e of [...LISTA_CURADA.filter((c) => !ocultos.has(c.ticker)), ...doc.agregados]) {
    if (!cartera.has(e.ticker) && !vistos.has(e.ticker)) {
      vistos.add(e.ticker)
      out.push(e)
    }
  }
  return out
}

export type ResultadoAgregar =
  | { ok: true; doc: WatchlistDoc }
  | { ok: false; error: 'cripto-mal-tipada' | 'reservado' }

// Idempotente. Si el ticker estaba oculto, lo desoculta; si es curado visible
// o ya está agregado, no hace nada; si no, lo suma a `agregados`.
export function agregarTicker(doc: WatchlistDoc, tickerCrudo: string, tipo: 'acciones' | 'cripto'): ResultadoAgregar {
  const ticker = normalizarTicker(tickerCrudo, tipo)
  // El sufijo -USD lo agrega el sistema para cripto: un ticker -USD con tipo
  // 'acciones' es una cripto mal tipada.
  if (tipo === 'acciones' && ticker.endsWith('-USD')) return { ok: false, error: 'cripto-mal-tipada' }
  // BONO y EFECTIVO son las claves sintéticas de la cartera (page.tsx y
  // simularCompra): un ticker real con ese nombre colisionaría con ellas.
  if (ticker === 'BONO' || ticker === 'EFECTIVO') return { ok: false, error: 'reservado' }
  if (doc.ocultos.includes(ticker)) {
    return { ok: true, doc: { agregados: doc.agregados, ocultos: doc.ocultos.filter((t) => t !== ticker) } }
  }
  const esCurado = LISTA_CURADA.some((c) => c.ticker === ticker)
  const yaAgregado = doc.agregados.some((a) => a.ticker === ticker)
  if (esCurado || yaAgregado) return { ok: true, doc }
  return { ok: true, doc: { agregados: [...doc.agregados, { ticker, tipo }], ocultos: doc.ocultos } }
}

export type ResultadoQuitar = { ok: true; doc: WatchlistDoc } | { ok: false; error: 'desconocido' }

// Curado → se agrega a `ocultos` (no reaparece); agregado → se borra de
// `agregados`; desconocido → error (la ruta responde 404).
export function quitarTicker(doc: WatchlistDoc, tickerCrudo: string): ResultadoQuitar {
  const ticker = normalizarTicker(tickerCrudo)
  if (doc.agregados.some((a) => a.ticker === ticker)) {
    return { ok: true, doc: { agregados: doc.agregados.filter((a) => a.ticker !== ticker), ocultos: doc.ocultos } }
  }
  if (LISTA_CURADA.some((c) => c.ticker === ticker)) {
    if (doc.ocultos.includes(ticker)) return { ok: true, doc }
    return { ok: true, doc: { agregados: doc.agregados, ocultos: [...doc.ocultos, ticker] } }
  }
  return { ok: false, error: 'desconocido' }
}

export type ValidacionTicker = 'ok' | 'no-encontrado' | 'yahoo-caido'

// Valida el ticker contra Yahoo con un chart de 1 mes. Distingue fallos:
// sin adjclose válido → 'no-encontrado'; 429/5xx o error de red →
// 'yahoo-caido' (NO se reporta como inexistente).
export async function validarTickerYahoo(
  ticker: string,
  tipo: 'acciones' | 'cripto',
  fetchFn: typeof fetch = fetch
): Promise<ValidacionTicker> {
  try {
    const r = await fetchFn(
      `https://query1.finance.yahoo.com/v8/finance/chart/${simboloYahoo(ticker, tipo)}?range=1mo&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (r.status === 429 || r.status >= 500) return 'yahoo-caido'
    const json = (await r.json()) as {
      chart?: { result?: { indicators?: { adjclose?: { adjclose?: (number | null)[] }[] } }[] }
    }
    const adj = json?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ?? []
    return adj.some((p) => typeof p === 'number') ? 'ok' : 'no-encontrado'
  } catch {
    return 'yahoo-caido'
  }
}

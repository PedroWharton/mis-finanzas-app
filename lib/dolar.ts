// Cotización USD→ARS para la vista en pesos. Fuente: DolarApi (pública, sin
// key). Se prefiere el dólar cripto (es el tipo de cambio al que realmente
// se mueve la plata de estas plataformas); si falla, cae al MEP.
const CACHE_MS = 10 * 60 * 1000

export interface Dolar {
  valor: number // pesos por dólar (punta vendedora)
  nombre: string // 'cripto' | 'MEP'
  fecha: string // ISO de la fuente
}

let cache: { hasta: number; res: Dolar } | null = null
let cacheBolsa: { hasta: number; res: Dolar } | null = null
export function _resetCache() {
  cache = null
  cacheBolsa = null
}

interface RespuestaDolarApi {
  venta?: number
  fechaActualizacion?: string
}

async function pedir(url: string, nombre: string, fetchFn: typeof fetch): Promise<Dolar | null> {
  try {
    const r = await fetchFn(url)
    if (!r.ok) return null
    const j = (await r.json()) as RespuestaDolarApi
    if (typeof j.venta !== 'number' || !Number.isFinite(j.venta) || j.venta <= 0) return null
    return { valor: j.venta, nombre, fecha: j.fechaActualizacion ?? '' }
  } catch {
    return null
  }
}

export async function obtenerDolar(fetchFn: typeof fetch = fetch): Promise<Dolar | null> {
  if (cache && Date.now() < cache.hasta) return cache.res
  const res =
    (await pedir('https://dolarapi.com/v1/dolares/cripto', 'cripto', fetchFn)) ??
    (await pedir('https://dolarapi.com/v1/dolares/bolsa', 'MEP', fetchFn))
  if (res) cache = { hasta: Date.now() + CACHE_MS, res }
  return res
}

// El MEP puntual, sin caer al cripto. Lo usan las acciones de BYMA: el tipo
// de cambio implícito entre la especie en pesos y la especie en dólares es
// el MEP, así que valuarlas al cripto las dejaría fuera de lo que informa el
// broker. Cache aparte para no pisar la del dólar de la vista en pesos.
export async function obtenerDolarBolsa(fetchFn: typeof fetch = fetch): Promise<Dolar | null> {
  if (cacheBolsa && Date.now() < cacheBolsa.hasta) return cacheBolsa.res
  const res = await pedir('https://dolarapi.com/v1/dolares/bolsa', 'MEP', fetchFn)
  if (res) cacheBolsa = { hasta: Date.now() + CACHE_MS, res }
  return res
}

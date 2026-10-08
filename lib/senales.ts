import type { Indicadores } from './indicadores'
import type { ResumenInsiders } from './insiders'

export type Veredicto = 'comprar' | 'mantener' | 'reducir' | 'vender'

export interface Evaluacion {
  veredicto: Veredicto
  razones: string[]
  alertas: string[]
}

interface Umbrales {
  rsiAlto: number
  rsiBajo: number
  caidaAlerta: number
}

// Los umbrales clásicos calibrados para acciones disparan constantemente en
// cripto por su volatilidad; cripto usa umbrales más anchos.
const UMBRALES: Record<'acciones' | 'cripto', Umbrales> = {
  acciones: { rsiAlto: 70, rsiBajo: 30, caidaAlerta: 0.15 },
  cripto: { rsiAlto: 80, rsiBajo: 25, caidaAlerta: 0.3 },
}

export const PESO_MAXIMO = 0.35

const pctf = (v: number) => `${(v * 100).toFixed(1)}%`
// "USD 152 mil" / "USD 90,1 M": los montos de Form 4 van de miles a cientos de millones.
const usdCorto = (n: number) =>
  n >= 1_000_000 ? `USD ${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : `USD ${Math.round(n / 1000)} mil`
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

export function evaluarPosicion(
  ticker: string,
  ind: Indicadores,
  tipo: 'acciones' | 'cripto',
  peso: number,
  insiders: ResumenInsiders | null = null
): Evaluacion {
  const u = UMBRALES[tipo]
  const razones: string[] = []
  const alertas: string[] = []
  let score = 0

  if (ind.sma200 !== null) {
    if (ind.precio > ind.sma200) {
      score++
      razones.push('cotiza sobre su media de 200 días (tendencia alcista)')
    } else {
      score--
      razones.push('cotiza bajo su media de 200 días (tendencia bajista)')
      alertas.push(`${ticker} está bajo su media de 200 días`)
    }
  }

  if (ind.sma50 !== null) {
    if (ind.precio > ind.sma50) {
      score++
      razones.push('cotiza sobre su media de 50 días')
    } else {
      score--
      razones.push('cotiza bajo su media de 50 días')
    }
  }

  if (ind.momentum6m !== null) {
    if (ind.momentum6m > 0) {
      score++
      razones.push(`momentum de 6 meses positivo (+${pctf(ind.momentum6m)})`)
    } else {
      score--
      razones.push(`momentum de 6 meses negativo (−${pctf(-ind.momentum6m)})`)
    }
  }

  if (ind.momentum12m !== null) {
    if (ind.momentum12m > 0) {
      score++
      razones.push(`momentum de 12 meses positivo (+${pctf(ind.momentum12m)})`)
    } else {
      score--
      razones.push(`momentum de 12 meses negativo (−${pctf(-ind.momentum12m)})`)
    }
  }

  if (ind.rsi14 !== null) {
    if (ind.rsi14 <= u.rsiBajo) {
      score++
      razones.push(`RSI en sobreventa (${ind.rsi14.toFixed(0)})`)
      alertas.push(`${ticker} en sobreventa (RSI ${ind.rsi14.toFixed(0)})`)
    } else if (ind.rsi14 >= u.rsiAlto) {
      score--
      razones.push(`RSI en sobrecompra (${ind.rsi14.toFixed(0)})`)
      alertas.push(`${ticker} en sobrecompra (RSI ${ind.rsi14.toFixed(0)})`)
    }
  }

  if (ind.distMaximo <= -u.caidaAlerta) {
    // No puntúa: una caída grande es ambigua (¿oportunidad o cuchillo cayendo?);
    // se muestra como razón y alerta para que el usuario la pondere.
    razones.push(`cayó ${pctf(-ind.distMaximo)} desde su máximo de 2 años`)
    alertas.push(`${ticker} cayó ${pctf(-ind.distMaximo)} desde su máximo de 2 años`)
  }

  // Insiders (SEC Form 4, últimos 90 días). Solo los clusters puntúan: varios
  // insiders moviéndose juntos es información; una operación suelta suele ser
  // liquidez o un plan automático y se muestra sin pesar en el veredicto.
  if (insiders && insiders.senal !== 'neutral') {
    const comp = `${plural(insiders.insidersComprando, 'insider compró', 'insiders compraron')} ${usdCorto(insiders.compradoUSD)}`
    const vend = `${plural(insiders.insidersVendiendo, 'insider vendió', 'insiders vendieron')} ${usdCorto(insiders.vendidoUSD)}`
    switch (insiders.senal) {
      case 'compra_cluster':
        score++
        razones.push(`${comp} en 90 días (cluster de compras de insiders)`)
        break
      case 'venta_cluster':
        score--
        razones.push(`${vend} en 90 días (cluster de ventas de insiders)`)
        alertas.push(`${ticker}: ${insiders.insidersVendiendo} insiders vendieron ${usdCorto(insiders.vendidoUSD)} en 90 días`)
        break
      case 'compras':
        razones.push(`${comp} en 90 días (insiders, señal moderada)`)
        break
      case 'ventas':
        razones.push(`${vend} en 90 días (insiders, señal débil)`)
        break
    }
    // La ventana de 90 puede contradecir a la de 30 (vendió en julio, compra
    // desde agosto): se dice para que nadie lea solo la etiqueta.
    const largo = insiders.senal.startsWith('compra') ? 'compras' : 'ventas'
    if (insiders.tendencia30d !== 'neutral' && insiders.tendencia30d !== largo) {
      const verbo = insiders.tendencia30d === 'compras' ? 'compraron' : 'vendieron'
      razones.push(`pero en los últimos 30 días los insiders ${verbo} ${usdCorto(Math.abs(insiders.neto30dUSD))} netos`)
    }
  }

  let veredicto: Veredicto = score >= 3 ? 'comprar' : score <= -3 ? 'vender' : 'mantener'

  if (peso > PESO_MAXIMO && veredicto !== 'vender') {
    veredicto = 'reducir'
    razones.push(`concentra ${pctf(peso)} de tu cartera (máximo sugerido ${pctf(PESO_MAXIMO)})`)
    alertas.push(`${ticker} concentra ${pctf(peso)} de la cartera`)
  }

  return { veredicto, razones, alertas }
}

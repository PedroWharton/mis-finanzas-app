import { describe, it, expect } from 'vitest'
import { evaluarPosicion, PESO_MAXIMO } from './senales'
import type { Indicadores } from './indicadores'
import type { ResumenInsiders } from './insiders'

const base: Indicadores = {
  precio: 100, sma50: 95, sma200: 90, rsi14: 50,
  momentum3m: 0.05, momentum6m: 0.1, momentum12m: 0.2, distMaximo: -0.05,
}

describe('evaluarPosicion', () => {
  it('tendencia y momentum positivos → comprar', () => {
    const e = evaluarPosicion('VOO', base, 'acciones', 0.2)
    expect(e.veredicto).toBe('comprar')
    expect(e.razones.length).toBeGreaterThanOrEqual(2)
  })

  it('tendencia y momentum negativos → vender', () => {
    // precio 80 bajo SMA50 (95) y SMA200 (90), momentum 6 y 12 m negativos → score −4
    const e = evaluarPosicion('MU', { ...base, precio: 80, momentum6m: -0.15, momentum12m: -0.1 }, 'acciones', 0.1)
    expect(e.veredicto).toBe('vender')
  })

  it('señales mixtas → mantener', () => {
    // sobre ambas SMA (+2) pero momentum 6 y 12 m negativos (−2) → score 0
    const e = evaluarPosicion('MELI', { ...base, momentum6m: -0.02, momentum12m: -0.05 }, 'acciones', 0.1)
    expect(e.veredicto).toBe('mantener')
  })

  it('concentración > 35% convierte comprar en reducir', () => {
    const e = evaluarPosicion('BTC', base, 'cripto', 0.4)
    expect(e.veredicto).toBe('reducir')
    expect(e.razones.some((r) => r.includes('concentra'))).toBe(true)
    expect(e.alertas.some((a) => a.includes('concentra'))).toBe(true)
  })

  it('concentración NO salva un vender', () => {
    const e = evaluarPosicion('MU', { ...base, precio: 80, momentum6m: -0.15, momentum12m: -0.1 }, 'acciones', 0.4)
    expect(e.veredicto).toBe('vender')
  })

  it('umbral RSI por tipo: 75 es sobrecompra en acciones pero no en cripto', () => {
    const acc = evaluarPosicion('VOO', { ...base, rsi14: 75 }, 'acciones', 0.1)
    const cri = evaluarPosicion('BTC', { ...base, rsi14: 75 }, 'cripto', 0.1)
    expect(acc.alertas.some((a) => a.includes('sobrecompra'))).toBe(true)
    expect(cri.alertas.some((a) => a.includes('sobrecompra'))).toBe(false)
  })

  it('caída desde máximo genera razón y alerta según umbral por tipo, sin puntuar', () => {
    const acc = evaluarPosicion('VIST', { ...base, distMaximo: -0.2 }, 'acciones', 0.1)
    const cri = evaluarPosicion('ETH', { ...base, distMaximo: -0.2 }, 'cripto', 0.1)
    expect(acc.alertas.some((a) => a.includes('máximo'))).toBe(true)
    expect(acc.razones.some((r) => r.includes('máximo'))).toBe(true)
    expect(cri.alertas.some((a) => a.includes('máximo'))).toBe(false)
    expect(acc.veredicto).toBe('comprar') // el score no cambia por la caída
  })

  it('bajo SMA200 genera alerta de tendencia', () => {
    const e = evaluarPosicion('MU', { ...base, precio: 85, sma200: 90 }, 'acciones', 0.1)
    expect(e.alertas.some((a) => a.includes('200'))).toBe(true)
  })

  it('indicadores null (serie corta) no rompen: quedan fuera del score', () => {
    const e = evaluarPosicion('NEXO', { ...base, sma200: null, rsi14: null, momentum6m: null }, 'cripto', 0.1)
    expect(e.veredicto).toBe('mantener')
  })

  it('PESO_MAXIMO exportado es 0.35', () => {
    expect(PESO_MAXIMO).toBe(0.35)
  })
})

const insiders = (o: Partial<ResumenInsiders>): ResumenInsiders => ({
  compras: 0, ventas: 0, compradoUSD: 0, vendidoUSD: 0, insidersComprando: 0, insidersVendiendo: 0,
  neto30dUSD: 0, tendencia30d: 'neutral', senal: 'neutral', ultimas: [], ...o,
})

describe('evaluarPosicion con insiders', () => {
  // Señales mixtas (score 0) para que un punto de insiders sea visible en el veredicto de borde.
  const mixto: Indicadores = { ...base, momentum6m: -0.02, momentum12m: -0.05 }

  it('un cluster de compras suma un punto y lo explica en las razones', () => {
    const sin = evaluarPosicion('AAPL', { ...base, momentum12m: -0.05 }, 'acciones', 0.1) // score 2 → mantener
    expect(sin.veredicto).toBe('mantener')
    const con = evaluarPosicion('AAPL', { ...base, momentum12m: -0.05 }, 'acciones', 0.1,
      insiders({ senal: 'compra_cluster', compras: 3, insidersComprando: 3, compradoUSD: 152400 }))
    expect(con.veredicto).toBe('comprar')
    expect(con.razones.some((r) => /3 insiders compraron/.test(r) && /152/.test(r))).toBe(true)
  })

  it('un cluster de ventas resta un punto, lo explica y dispara alerta', () => {
    const sin = evaluarPosicion('MU', { ...mixto, precio: 80, momentum6m: 0.1 }, 'acciones', 0.1) // −1+? → mantener
    expect(sin.veredicto).toBe('mantener')
    const e = evaluarPosicion('MU', { ...mixto, precio: 80 }, 'acciones', 0.1,
      insiders({ senal: 'venta_cluster', ventas: 10, insidersVendiendo: 3, vendidoUSD: 90140395 }))
    // precio 80 bajo ambas SMA (−2), momentum negativo (−2) = −4 ya es vender; el punto de insiders no cambia el veredicto pero sí las razones/alertas.
    expect(e.veredicto).toBe('vender')
    expect(e.razones.some((r) => /3 insiders vendieron/.test(r))).toBe(true)
    expect(e.alertas.some((a) => /MU/.test(a) && /insiders/.test(a))).toBe(true)
  })

  it('compras o ventas sueltas se mencionan como razón pero no puntúan', () => {
    const sin = evaluarPosicion('MELI', mixto, 'acciones', 0.1)
    const compras = evaluarPosicion('MELI', mixto, 'acciones', 0.1, insiders({ senal: 'compras', compras: 1, insidersComprando: 1, compradoUSD: 200000 }))
    const ventas = evaluarPosicion('UNH', mixto, 'acciones', 0.1, insiders({ senal: 'ventas', ventas: 2, insidersVendiendo: 1, vendidoUSD: 660910 }))
    expect(compras.veredicto).toBe(sin.veredicto)
    expect(ventas.veredicto).toBe(sin.veredicto)
    expect(compras.razones.some((r) => /insider/.test(r) && /200/.test(r))).toBe(true)
    expect(ventas.razones.some((r) => /insider/.test(r) && /661/.test(r))).toBe(true)
    expect(ventas.alertas).toEqual(sin.alertas) // ventas sueltas no alertan
  })

  it('cuando la tendencia de 30 días contradice la ventana de 90, lo dice', () => {
    const e = evaluarPosicion('PAM', mixto, 'acciones', 0.1,
      insiders({ senal: 'ventas', compras: 5, ventas: 2, insidersComprando: 1, insidersVendiendo: 1, compradoUSD: 11868812, vendidoUSD: 12405227, neto30dUSD: 7128931, tendencia30d: 'compras' }))
    expect(e.razones.some((r) => /últimos 30 días/.test(r) && /compr/.test(r))).toBe(true)
  })

  it('neutral o null no agregan nada', () => {
    const sin = evaluarPosicion('VOO', mixto, 'acciones', 0.1)
    expect(evaluarPosicion('VOO', mixto, 'acciones', 0.1, insiders({}))).toEqual(sin)
    expect(evaluarPosicion('VOO', mixto, 'acciones', 0.1, null)).toEqual(sin)
  })
})

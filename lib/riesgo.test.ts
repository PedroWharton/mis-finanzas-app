import { describe, it, expect } from 'vitest'
import {
  volatilidadAnualizada, sharpe, maxDrawdown, correlacion,
  retornosComunes, retornosCartera, pesos, FACTOR_ANUAL,
} from './riesgo'
import type { Serie } from './historicos'

describe('volatilidadAnualizada', () => {
  it('desviación muestral × √días', () => {
    // retornos [0.01, 0.03]: media 0.02, var muestral 0.0002, sd 0.0141421…
    expect(volatilidadAnualizada([0.01, 0.03], 252)).toBeCloseTo(0.0141421 * Math.sqrt(252), 4)
  })
  it('factores distintos por tipo', () => {
    expect(FACTOR_ANUAL.acciones).toBe(252)
    expect(FACTOR_ANUAL.cripto).toBe(365)
  })
})

describe('sharpe', () => {
  it('resta la tasa libre de riesgo anualizada', () => {
    const retornos = [0.01, 0.03]
    const vol = volatilidadAnualizada(retornos, 252)
    expect(sharpe(retornos, 252, 0.04)).toBeCloseTo((0.02 * 252 - 0.04) / vol, 6)
  })
  it('con vol cero devuelve 0', () => {
    expect(sharpe([0.01, 0.01, 0.01], 252)).toBe(0)
  })
})

describe('maxDrawdown', () => {
  it('peor caída pico a valle', () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(-0.5, 10)
  })
  it('serie creciente → 0', () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0)
  })
  it('ignora precios ≤ 0 sin contaminar resultado', () => {
    expect(maxDrawdown([100, 120, 0, 90])).toBeCloseTo(-0.25, 10)
    expect(isFinite(maxDrawdown([100, 120, 0, 90]))).toBe(true)
  })
})

describe('correlacion', () => {
  it('correlación perfecta → 1', () => {
    expect(correlacion([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10)
  })
  it('anticorrelación perfecta → −1', () => {
    expect(correlacion([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10)
  })
})

describe('retornosComunes', () => {
  it('intersecta fechas (descarta findes de cripto), sin forward-fill', () => {
    const acciones: Serie = { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [100, 110, 121] }
    const cripto: Serie = { fechas: ['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'], precios: [50, 50, 55, 66] }
    const [ra, rc] = retornosComunes(acciones, cripto)
    expect(ra).toHaveLength(2) // 3 fechas comunes → 2 retornos
    expect(ra[0]).toBeCloseTo(Math.log(1.1), 10)
    expect(rc[1]).toBeCloseTo(Math.log(66 / 55), 10)
  })
  it('ordena fechas comunes ascendentemente (igual que retornosCartera)', () => {
    const a: Serie = { fechas: ['2026-01-07', '2026-01-06', '2026-01-05'], precios: [121, 110, 100] }
    const b: Serie = { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [100, 110, 121] }
    const [ra, rb] = retornosComunes(a, b)
    // Mismo resultado que si a estuviera ordenado ascendentemente
    expect(ra).toHaveLength(2)
    expect(ra[0]).toBeCloseTo(Math.log(110 / 100), 10)
    expect(ra[1]).toBeCloseTo(Math.log(121 / 110), 10)
  })
  it('descarta fechas con precios ≤ 0', () => {
    const a: Serie = { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [100, 0, 110] }
    const b: Serie = { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [50, 50, 50] }
    const [ra, rb] = retornosComunes(a, b)
    // Solo 2026-01-05 y 2026-01-07 son válidas (2026-01-06 tiene precio 0 en a)
    expect(ra).toHaveLength(1)
    expect(ra[0]).toBeCloseTo(Math.log(110 / 100), 10)
    expect(isFinite(ra[0])).toBe(true)
  })
})

describe('retornosCartera', () => {
  it('índice ponderado sobre fechas comunes a todas las series', () => {
    const series: Record<string, Serie> = {
      A: { fechas: ['2026-01-05', '2026-01-06'], precios: [100, 110] },
      B: { fechas: ['2026-01-04', '2026-01-05', '2026-01-06'], precios: [10, 50, 50] },
    }
    const r = retornosCartera(series, { A: 0.5, B: 0.5 })
    // día 1 común: A 100→110 (+10%), B 50→50 (0%) → cartera +5% en simple
    expect(r).toHaveLength(1)
    expect(Math.exp(r[0]) - 1).toBeCloseTo(0.05, 10)
  })
  it('pesos sin serie (bono/efectivo) se modelan como componente constante, no se renormalizan', () => {
    const series: Record<string, Serie> = { A: { fechas: ['2026-01-05', '2026-01-06'], precios: [100, 110] } }
    const r = retornosCartera(series, { A: 0.6, BONO: 0.4 })
    // A +10% en el día común; BONO (peso 0.4, sin serie) se modela constante
    // a primer orden: índice = 0.6·1.1 + 0.4·1 = 1.06 → retorno simple 6%
    // (si se renormalizara sobre A solo, sería +10%: casi el doble)
    expect(r).toHaveLength(1)
    expect(Math.exp(r[0]) - 1).toBeCloseTo(0.06, 10)
  })
  it('con Σ pesos de series < 1, la componente constante se sostiene en múltiples días', () => {
    const series: Record<string, Serie> = {
      A: { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [100, 110, 121] },
    }
    const r = retornosCartera(series, { A: 0.5, BONO: 0.3, EFECTIVO: 0.2 })
    // Σ pesos con serie = 0.5 (< 1); componente constante = 1 − 0.5 = 0.5.
    // día 1: índice = 0.5·(110/100) + 0.5 = 1.05 → retorno simple +5%
    // día 2: índice = 0.5·(121/100) + 0.5 = 1.105 → retorno vs día 1: 1.105/1.05 − 1
    expect(r).toHaveLength(2)
    expect(Math.exp(r[0]) - 1).toBeCloseTo(0.05, 10)
    expect(Math.exp(r[1]) - 1).toBeCloseTo(1.105 / 1.05 - 1, 10)
  })
  it('Σ pesos con serie = 0 (todo el peso vivo está en tickers sin serie) → []', () => {
    const series: Record<string, Serie> = { A: { fechas: ['2026-01-05', '2026-01-06'], precios: [100, 110] } }
    expect(retornosCartera(series, { A: 0, BONO: 1 })).toEqual([])
  })
  it('descarta fechas con precios ≤ 0 en cualquier serie', () => {
    const series: Record<string, Serie> = {
      A: { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [100, 110, 120] },
      B: { fechas: ['2026-01-05', '2026-01-06', '2026-01-07'], precios: [50, 0, 50] },
    }
    const r = retornosCartera(series, { A: 0.5, B: 0.5 })
    // Solo 2026-01-05 y 2026-01-07 son válidas (2026-01-06 tiene precio 0 en B)
    expect(r).toHaveLength(1)
    expect(isFinite(r[0])).toBe(true)
  })
})

describe('pesos', () => {
  it('normaliza a 1', () => {
    expect(pesos({ A: 30, B: 70 })).toEqual({ A: 0.3, B: 0.7 })
  })
  it('todos ceros devuelve todos ceros (sin NaN)', () => {
    expect(pesos({ A: 0, B: 0 })).toEqual({ A: 0, B: 0 })
  })
})

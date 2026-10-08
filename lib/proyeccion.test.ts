import { describe, it, expect } from 'vitest'
import { mulberry32, proyectarBandas } from './proyeccion'

describe('mulberry32', () => {
  it('determinista con la misma semilla', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('valores en [0, 1)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('proyectarBandas', () => {
  it('con retorno constante todas las bandas coinciden en el valor exacto', () => {
    const r = Math.log(1.01)
    const bandas = proyectarBandas([r], 1000, 10, { cadaNDias: 5, sims: 50 })
    const final = bandas[bandas.length - 1]
    expect(final.dia).toBe(10)
    expect(final.p10).toBeCloseTo(1000 * 1.01 ** 10, 6)
    expect(final.p50).toBeCloseTo(final.p10, 6)
    expect(final.p90).toBeCloseTo(final.p10, 6)
  })
  it('empieza en dia 0 con el valor inicial y termina exactamente en `dias`', () => {
    const bandas = proyectarBandas([0.001, -0.002, 0.003], 500, 63)
    expect(bandas[0]).toEqual({ dia: 0, p10: 500, p50: 500, p90: 500 })
    expect(bandas[bandas.length - 1].dia).toBe(63)
  })
  it('percentiles ordenados: p10 ≤ p50 ≤ p90 en todos los puntos', () => {
    const retornos = [0.01, -0.02, 0.005, 0.03, -0.01]
    for (const p of proyectarBandas(retornos, 1000, 126)) {
      expect(p.p10).toBeLessThanOrEqual(p.p50)
      expect(p.p50).toBeLessThanOrEqual(p.p90)
    }
  })
  it('misma semilla → mismo resultado; distinta semilla → distinto', () => {
    const retornos = [0.01, -0.02, 0.005]
    const a = proyectarBandas(retornos, 1000, 21, { semilla: 1 })
    const b = proyectarBandas(retornos, 1000, 21, { semilla: 1 })
    const c = proyectarBandas(retornos, 1000, 21, { semilla: 2 })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
  it('sin retornos devuelve solo el punto inicial', () => {
    expect(proyectarBandas([], 1000, 21)).toEqual([{ dia: 0, p10: 1000, p50: 1000, p90: 1000 }])
  })
  it('cadaNDias ≤ 0 se normaliza a 1 y termina con último punto en dia exacto', () => {
    const bandas = proyectarBandas([0.01], 1000, 10, { cadaNDias: 0 })
    expect(bandas[bandas.length - 1].dia).toBe(10)
    expect(bandas[0].dia).toBe(0)
    // Verifica que no hay infinito loop: simplemente termina con puntos cada día
    expect(bandas.length).toBe(11) // dias 0 a 10
  })
  it('sims ≤ 0 se normaliza a 1 y devuelve valores finitos', () => {
    const bandas = proyectarBandas([0.01], 1000, 5, { sims: 0 })
    const final = bandas[bandas.length - 1]
    expect(Number.isFinite(final.p10)).toBe(true)
    expect(Number.isFinite(final.p50)).toBe(true)
    expect(Number.isFinite(final.p90)).toBe(true)
  })
})

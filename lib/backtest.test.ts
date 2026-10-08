import { describe, it, expect } from 'vitest'
import { backtest, senalEnDia, WARMUP } from './backtest'

function fechasDiarias(n: number): string[] {
  const out: string[] = []
  const base = Date.UTC(2024, 0, 1)
  for (let i = 0; i < n; i++) out.push(new Date(base + i * 86400000).toISOString().slice(0, 10))
  return out
}

// 220 días de suba suave con ruido (drift 0.1%/día, alternancia ±2%) y luego
// `pasosCrash` días alternando ×0.96 / ×1.025 (−1.6% cada 2 días). Con este
// patrón el RSI de Wilder queda en ~36–51 durante el crash: no dispara
// sobreventa (que sumaría +1 y taparía el 'vender') ni sobrecompra.
function serieDerrumbe(pasosCrash: number): number[] {
  const precios: number[] = []
  for (let i = 0; i < 220; i++) precios.push(100 * 1.001 ** i * (i % 2 === 1 ? 1.02 : 1))
  for (let i = 0; i < pasosCrash; i++) precios.push(precios[precios.length - 1] * (i % 2 === 0 ? 0.96 : 1.025))
  return precios
}

describe('senalEnDia (anti look-ahead)', () => {
  it('alterar precios posteriores a i no cambia la señal de i', () => {
    const precios = serieDerrumbe(80) // 300 puntos
    // Alteración salvaje de TODO lo posterior al día 240 (×5)
    const alterada = precios.map((p, idx) => (idx > 240 ? p * 5 : p))
    for (const i of [200, 220, 232, 240]) {
      expect(senalEnDia(alterada, i, 'acciones')).toBe(senalEnDia(precios, i, 'acciones'))
    }
    // Sanity check de que la alteración es real: DESPUÉS de 240 las señales sí difieren
    expect(senalEnDia(alterada, 250, 'acciones')).not.toBe(senalEnDia(precios, 250, 'acciones'))
  })
})

describe('backtest', () => {
  it('serie siempre alcista: 0 operaciones y estrategia = buy-and-hold', () => {
    const precios = Array.from({ length: 300 }, (_, i) => 100 * 1.002 ** i)
    const r = backtest(precios, fechasDiarias(300), 'acciones')
    expect(r).not.toBeNull()
    expect(r!.operaciones).toBe(0)
    expect(r!.dias).toBe(99) // 300 − 1 − 200
    // Siempre invertido → la suma de log-retornos telescopa: 1.002^99 − 1 ≈ 0.2187
    expect(r!.retornoEstrategia).toBeCloseTo(1.002 ** 99 - 1, 10)
    expect(r!.retornoEstrategia).toBeCloseTo(r!.retornoBuyHold, 10)
  })

  it('derrumbe: sale con "vender" una sola vez y pierde menos que buy-and-hold', () => {
    const precios = serieDerrumbe(80) // 300 puntos
    const r = backtest(precios, fechasDiarias(300), 'acciones')
    expect(r).not.toBeNull()
    // La señal pasa a 'vender' al cierre del día i=232 (precio ya bajo SMA 50
    // y 200, momentum 6 m negativo, RSI neutro) y no vuelve: 1 transición.
    expect(r!.operaciones).toBe(1)
    // Invertido desde i=200 hasta el cierre de 232, afuera después:
    // retorno = precios[232]/precios[200] − 1 ≈ −0.0941 (vs buy-hold ≈ −0.4547)
    expect(r!.retornoEstrategia).toBeCloseTo(precios[232] / precios[200] - 1, 10)
    expect(r!.retornoEstrategia).toBeCloseTo(-0.0941, 3)
    expect(r!.retornoBuyHold).toBeCloseTo(-0.4547, 3)
    expect(r!.retornoEstrategia).toBeGreaterThan(r!.retornoBuyHold)
  })

  it('derrumbe y recuperación: vuelve a entrar (conteo de operaciones)', () => {
    const precios = serieDerrumbe(40) // 260 puntos…
    for (let i = 0; i < 60; i++) precios.push(precios[precios.length - 1] * (i % 2 === 0 ? 1.04 : 0.995)) // …+60 de recuperación fuerte
    const r = backtest(precios, fechasDiarias(320), 'acciones')
    expect(r).not.toBeNull()
    // Sale en i=232; al recuperarse rebota una vez en el borde del score
    // (entra en 264, sale en 265, entra en 266 y se queda): 4 transiciones.
    expect(r!.operaciones).toBe(4)
    expect(r!.retornoEstrategia).toBeGreaterThan(0)
  })

  it('null con datos insuficientes (< WARMUP + 30) y con largos inconsistentes', () => {
    const p229 = Array.from({ length: 229 }, (_, i) => 100 * 1.002 ** i)
    expect(backtest(p229, fechasDiarias(229), 'acciones')).toBeNull()
    const p230 = Array.from({ length: 230 }, (_, i) => 100 * 1.002 ** i)
    expect(backtest(p230, fechasDiarias(230), 'acciones')?.dias).toBe(29)
    expect(backtest(p230, fechasDiarias(229), 'acciones')).toBeNull()
  })

  it('WARMUP exportado es 200', () => {
    expect(WARMUP).toBe(200)
  })
})

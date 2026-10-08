import { describe, it, expect } from 'vitest'
import { retornosLog, sma, rsi, momentum, distanciaAMaximo, calcularIndicadores } from './indicadores'

describe('retornosLog', () => {
  it('calcula log-retornos', () => {
    const r = retornosLog([100, 110, 99])
    expect(r).toHaveLength(2)
    expect(r[0]).toBeCloseTo(Math.log(1.1), 10)
    expect(r[1]).toBeCloseTo(Math.log(99 / 110), 10)
  })
})

describe('sma', () => {
  it('media de la última ventana', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5)
  })
  it('null si faltan datos', () => {
    expect(sma([1, 2], 3)).toBeNull()
  })
})

describe('rsi (Wilder)', () => {
  it('alternancia simétrica perfecta → 50', () => {
    // 15 precios, 14 diferencias: +1 −1 +1 … (7 ganancias y 7 pérdidas iguales)
    const precios = Array.from({ length: 15 }, (_, i) => 100 + (i % 2))
    expect(rsi(precios)).toBeCloseTo(50, 6)
  })
  it('solo subidas → 100 (sin división por cero)', () => {
    const precios = Array.from({ length: 20 }, (_, i) => 100 + i)
    expect(rsi(precios)).toBe(100)
  })
  it('null si faltan datos', () => {
    expect(rsi([1, 2, 3])).toBeNull()
  })
  it('usa suavizado de Wilder, no media simple', () => {
    // 14 subidas de 1 y una caída fuerte al final. Con Wilder:
    // ganancia = (1×13 + 0)/14 ≈ 0.9286, pérdida = (0×13 + 24)/14 ≈ 1.7143
    // → RSI ≈ 35.1. Una media simple de la última ventana daría otro valor.
    const precios = [...Array.from({ length: 15 }, (_, i) => 100 + i), 90]
    const r = rsi(precios)
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(35.135, 2)
  })
})

describe('momentum', () => {
  it('retorno acumulado a n días', () => {
    const precios = [100, 105, 110]
    expect(momentum(precios, 2)).toBeCloseTo(0.10, 10)
  })
  it('null si la serie no alcanza', () => {
    expect(momentum([100, 110], 2)).toBeNull()
  })
})

describe('distanciaAMaximo', () => {
  it('negativa cuando está bajo el máximo de la ventana', () => {
    expect(distanciaAMaximo([100, 200, 150])).toBeCloseTo(-0.25, 10)
  })
  it('cero en el máximo', () => {
    expect(distanciaAMaximo([100, 200])).toBe(0)
  })
})

describe('calcularIndicadores', () => {
  it('usa 21 días/mes para acciones y 30 para cripto', () => {
    const precios = Array.from({ length: 400 }, (_, i) => 100 + i * 0.1)
    const acc = calcularIndicadores(precios, 'acciones')
    const cri = calcularIndicadores(precios, 'cripto')
    expect(acc.momentum3m).toBeCloseTo(momentum(precios, 63)!, 10)
    expect(cri.momentum3m).toBeCloseTo(momentum(precios, 90)!, 10)
    expect(acc.precio).toBeCloseTo(precios[precios.length - 1], 10)
    expect(acc.sma50).not.toBeNull()
    expect(acc.sma200).not.toBeNull()
  })
})

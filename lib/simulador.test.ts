import { describe, it, expect } from 'vitest'
import { simularCompra, parsearMonto } from './simulador'
import type { Serie } from './historicos'

function fechasDiarias(n: number): string[] {
  const out: string[] = []
  const base = Date.UTC(2025, 0, 1)
  for (let i = 0; i < n; i++) out.push(new Date(base + i * 86400000).toISOString().slice(0, 10))
  return out
}

function serieAlternante(n: number, up: number, down: number): Serie {
  const precios = [100]
  for (let i = 0; i < n - 1; i++) precios.push(precios[precios.length - 1] * (i % 2 === 0 ? up : down))
  return { fechas: fechasDiarias(n), precios }
}

// A: 71 fechas alternando ×1.01 / ÷1.01 → 70 log-retornos ±ln(1.01) (35 y 35),
// media 0, sd muestral = ln(1.01)·√(70/69), vol anualizada = sd·√252 ≈ 0.1591.
const A = serieAlternante(71, 1.01, 1 / 1.01)

describe('simularCompra', () => {
  it('pesoNuevo de un ticker nuevo: monto/(total+monto)', () => {
    // total 1000 (VOO 600 + BONO 400) + monto 1000 → QQQ pesa 1000/2000 = 0.5
    const r = simularCompra(
      { VOO: 600, BONO: 400 },
      { VOO: A },
      { VOO: 'acciones', BONO: 'bono' },
      { ticker: 'QQQ', serie: A, tipo: 'acciones' },
      1000
    )
    expect(r).not.toBeNull()
    expect(r!.pesoNuevo).toBeCloseTo(0.5, 10)
  })

  it('pesoNuevo de un ticker que YA es posición: se suma al valor existente, sin pisar', () => {
    // VOO pasa de 600 a 1000; total 1400 → peso TOTAL resultante 1000/1400 = 5/7
    const r = simularCompra(
      { VOO: 600, BONO: 400 },
      { VOO: A },
      { VOO: 'acciones', BONO: 'bono' },
      { ticker: 'VOO', serie: A, tipo: 'acciones' },
      400
    )
    expect(r!.pesoNuevo).toBeCloseTo(5 / 7, 10)
  })

  it('sin posiciones con serie: correlacionMedia null y volAntes 0 (cartera constante)', () => {
    const r = simularCompra({ BONO: 1000 }, {}, { BONO: 'bono' }, { ticker: 'QQQ', serie: A, tipo: 'acciones' }, 500)
    expect(r).not.toBeNull()
    expect(r!.correlacionMedia).toBeNull()
    expect(r!.volAntes).toBe(0)
    expect(r!.volDespues).toBeGreaterThan(0)
  })

  it('candidato clon (correlación 1) sin efectivo: la vol no cambia', () => {
    const r = simularCompra({ A: 1000 }, { A }, { A: 'acciones' }, { ticker: 'B', serie: A, tipo: 'acciones' }, 500)
    // vol analítica: ln(1.01)·√(70/69)·√252 = 0.159097…
    expect(r!.volAntes).toBeCloseTo(0.1591, 4)
    expect(r!.volDespues).toBeCloseTo(r!.volAntes, 10)
    expect(r!.correlacionMedia).toBeCloseTo(1, 10)
  })

  it('candidato perfectamente correlacionado con efectivo de por medio: la vol sube ∝ al peso riesgoso', () => {
    const r = simularCompra(
      { A: 500, EFECTIVO: 500 },
      { A },
      { A: 'acciones', EFECTIVO: 'efectivo' },
      { ticker: 'B', serie: A, tipo: 'acciones' },
      500
    )
    // antes: índice 0.5·R + 0.5 → retornos ±ln(1.005) → vol = ln(1.005)·√(70/69)·√252 = 0.079746…
    // después: (2/3)·R + 1/3 → ±ln(1 + 0.01·2/3) → vol = 0.106240… (peso riesgoso 1/2 → 2/3, ratio ≈ 4/3)
    expect(r!.volAntes).toBeCloseTo(0.07975, 4)
    expect(r!.volDespues).toBeCloseTo(0.10624, 4)
    expect(r!.volDespues / r!.volAntes).toBeCloseTo(4 / 3, 2)
    expect(r!.pesoNuevo).toBeCloseTo(1 / 3, 10)
  })

  it('candidato no correlacionado diversifica: volDespues < volAntes', () => {
    const A69 = serieAlternante(69, 1.01, 1 / 1.01)
    const preciosB = [100]
    for (let i = 0; i < 68; i++) preciosB.push(preciosB[preciosB.length - 1] * (i % 4 < 2 ? 1.01 : 1 / 1.01))
    const B: Serie = { fechas: fechasDiarias(69), precios: preciosB }
    // ra = +,−,+,− y rb = +,+,−,− (ciclo de 4): producto por ciclo 1−1−1+1 = 0 → correlación 0
    const r = simularCompra({ A: 500 }, { A: A69 }, { A: 'acciones' }, { ticker: 'B', serie: B, tipo: 'acciones' }, 500)
    expect(r!.correlacionMedia).toBeCloseTo(0, 10)
    expect(r!.volDespues).toBeLessThan(r!.volAntes)
  })

  it('volAntes y volDespues usan la MISMA ventana intersecada', () => {
    // A: 65 fechas calmas (±0.1%) + 66 salvajes (±2%). El candidato constante
    // solo cubre las últimas 65 fechas → la ventana común es solo la parte
    // salvaje y volAntes debe reflejarla: ln(1.02)·√(64/63)·√252 = 0.316842…
    // (sobre la serie completa daría ≈ 0.2251 — si este test falla con ese
    // valor, volAntes NO está usando la ventana intersecada).
    const precios = [100]
    for (let i = 0; i < 64; i++) precios.push(precios[precios.length - 1] * (i % 2 === 0 ? 1.001 : 1 / 1.001))
    for (let i = 0; i < 66; i++) precios.push(precios[precios.length - 1] * (i % 2 === 0 ? 1.02 : 1 / 1.02))
    const ACambio: Serie = { fechas: fechasDiarias(131), precios }
    const B: Serie = { fechas: ACambio.fechas.slice(66), precios: Array<number>(65).fill(100) }
    const r = simularCompra({ A: 1000 }, { A: ACambio }, { A: 'acciones' }, { ticker: 'B', serie: B, tipo: 'acciones' }, 1000)
    expect(r).not.toBeNull()
    expect(r!.volAntes).toBeCloseTo(0.31684, 4)
    expect(r!.volDespues).toBeLessThan(r!.volAntes) // el candidato constante diluye
  })

  it('menos de 60 retornos comunes → null (histórico insuficiente)', () => {
    const corto: Serie = { fechas: A.fechas.slice(21), precios: A.precios.slice(21) } // 50 fechas → 49 retornos
    expect(
      simularCompra({ A: 1000 }, { A }, { A: 'acciones' }, { ticker: 'C', serie: corto, tipo: 'acciones' }, 500)
    ).toBeNull()
  })
})

describe('parsearMonto', () => {
  it('miles con punto y decimal con coma (es-AR): "1.500,50" → 1500.50', () => {
    expect(parsearMonto('1.500,50')).toBeCloseTo(1500.5, 10)
  })

  it('sin miles, decimal con coma: "1500,50" → 1500.50', () => {
    expect(parsearMonto('1500,50')).toBeCloseTo(1500.5, 10)
  })

  it('solo grupos de miles con punto, sin coma: "1.500" → 1500', () => {
    expect(parsearMonto('1.500')).toBe(1500)
  })

  it('sin separadores: "1500" → 1500', () => {
    expect(parsearMonto('1500')).toBe(1500)
  })

  it('decimal con punto (formato plano): "1500.50" → 1500.50', () => {
    expect(parsearMonto('1500.50')).toBeCloseTo(1500.5, 10)
  })

  it('texto inválido: "abc" → NaN', () => {
    expect(parsearMonto('abc')).toBeNaN()
  })
})

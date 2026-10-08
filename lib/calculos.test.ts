import { describe, it, expect } from 'vitest'
import { valorPosicion, totalUSD, porPlataforma, porTipo, filasTabla } from './calculos'
import type { Portfolio, Posicion } from './tipos'

const HOY = new Date('2026-07-14T12:00:00Z')

const accion: Posicion = { ticker: 'VOO', nombre: 'VOO', tipo: 'acciones', cantidad: 2, costoUSD: 1000, fecha: '2026-06-18' }
const bono: Posicion = { ticker: '', nombre: 'Bono', tipo: 'bono', cantidad: 1, costoUSD: 15000, fecha: '2025-01-15', tasaAnual: 0.1, ultimaRenovacion: '2026-01-15' }

const pf: Portfolio = {
  monedaBase: 'USD',
  plataformas: [
    { nombre: 'Broker', efectivoUSD: 50, posiciones: [accion] },
    { nombre: 'Bonos', efectivoUSD: 0, posiciones: [bono] },
  ],
  operaciones: [],
}

describe('valorPosicion', () => {
  it('acción con precio: cantidad * precio', () => {
    expect(valorPosicion(accion, { VOO: 600 }, HOY)).toBe(1200)
  })
  it('sin precio disponible: fallback al costo', () => {
    expect(valorPosicion(accion, {}, HOY)).toBe(1000)
  })
  it('bono: nominal + interés devengado lineal (180 días desde 2026-01-15)', () => {
    expect(valorPosicion(bono, {}, HOY)).toBeCloseTo(15000 * (1 + 0.1 * 180 / 365), 2)
  })
})

describe('agregaciones', () => {
  it('totalUSD suma posiciones + efectivo', () => {
    const esperado = 1200 + 50 + valorPosicion(bono, {}, HOY)
    expect(totalUSD(pf, { VOO: 600 }, HOY)).toBeCloseTo(esperado, 2)
  })
  it('porPlataforma', () => {
    expect(porPlataforma(pf, { VOO: 600 }, HOY)['Broker']).toBe(1250)
  })
  it('porTipo separa efectivo', () => {
    const t = porTipo(pf, { VOO: 600 }, HOY)
    expect(t.acciones).toBe(1200)
    expect(t.efectivo).toBe(50)
    expect(t.bono).toBeGreaterThan(15000)
  })
})

describe('filasTabla', () => {
  it('excluye efectivo y calcula ganancia', () => {
    const filas = filasTabla(pf, { VOO: 600 }, HOY)
    expect(filas).toHaveLength(2)
    const voo = filas.find(f => f.ticker === 'VOO')!
    expect(voo.fecha).toBe('2026-06-18')
    expect(voo.precioCompra).toBe(500)
    expect(voo.precioActual).toBe(600)
    expect(voo.gananciaUSD).toBe(200)
    expect(voo.gananciaPct).toBeCloseTo(20, 5)
  })
  it('sin precio: precioActual null y ganancia 0', () => {
    const voo = filasTabla(pf, {}, HOY).find(f => f.ticker === 'VOO')!
    expect(voo.precioActual).toBeNull()
    expect(voo.gananciaUSD).toBe(0)
  })
  it('cantidad 0: precioCompra es 0 en vez de NaN/Infinity', () => {
    const cero: Posicion = { ticker: 'ZZZ', nombre: 'Cero', tipo: 'acciones', cantidad: 0, costoUSD: 500, fecha: '2026-06-18' }
    const pfCero: Portfolio = { monedaBase: 'USD', plataformas: [{ nombre: 'Broker', efectivoUSD: 0, posiciones: [cero] }], operaciones: [] }
    const fila = filasTabla(pfCero, {}, HOY)[0]
    expect(fila.precioCompra).toBe(0)
  })
})

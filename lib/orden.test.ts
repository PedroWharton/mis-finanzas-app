import { describe, it, expect } from 'vitest'
import { ordenarFilas } from './orden'
import type { Fila } from './calculos'

function fila(overrides: Partial<Fila>): Fila {
  return {
    plataforma: 'Broker',
    nombre: 'Nombre',
    ticker: 'TCK',
    tipo: 'acciones',
    fecha: '2026-01-01',
    cantidad: 1,
    costoUSD: 100,
    precioCompra: 100,
    precioActual: 100,
    valorUSD: 100,
    gananciaUSD: 0,
    gananciaPct: 0,
    ...overrides,
  }
}

describe('ordenarFilas', () => {
  it('ordena strings con localeCompare es (acentos y mayúsculas)', () => {
    const filas = [fila({ nombre: 'Ñandú' }), fila({ nombre: 'Azul' }), fila({ nombre: 'ábaco' })]
    const out = ordenarFilas(filas, 'nombre', 'asc')
    expect(out.map(f => f.nombre)).toEqual(['ábaco', 'Azul', 'Ñandú'])
  })

  it('invierte con dir desc', () => {
    const filas = [fila({ nombre: 'Azul' }), fila({ nombre: 'Beta' })]
    const out = ordenarFilas(filas, 'nombre', 'desc')
    expect(out.map(f => f.nombre)).toEqual(['Beta', 'Azul'])
  })

  it('ordena números ascendente y descendente', () => {
    const filas = [fila({ cantidad: 3 }), fila({ cantidad: 1 }), fila({ cantidad: 2 })]
    expect(ordenarFilas(filas, 'cantidad', 'asc').map(f => f.cantidad)).toEqual([1, 2, 3])
    expect(ordenarFilas(filas, 'cantidad', 'desc').map(f => f.cantidad)).toEqual([3, 2, 1])
  })

  it('ordena fechas ISO como comparación directa', () => {
    const filas = [fila({ fecha: '2026-03-01' }), fila({ fecha: '2025-01-01' }), fila({ fecha: '2025-12-31' })]
    expect(ordenarFilas(filas, 'fecha', 'asc').map(f => f.fecha)).toEqual([
      '2025-01-01',
      '2025-12-31',
      '2026-03-01',
    ])
  })

  it('precioActual null siempre al final, sin importar dirección', () => {
    const filas = [
      fila({ nombre: 'A', precioActual: 50 }),
      fila({ nombre: 'B', precioActual: null }),
      fila({ nombre: 'C', precioActual: 20 }),
    ]
    expect(ordenarFilas(filas, 'precioActual', 'asc').map(f => f.nombre)).toEqual(['C', 'A', 'B'])
    expect(ordenarFilas(filas, 'precioActual', 'desc').map(f => f.nombre)).toEqual(['A', 'C', 'B'])
  })

  it('no muta el arreglo original', () => {
    const filas = [fila({ nombre: 'B' }), fila({ nombre: 'A' })]
    const copia = [...filas]
    ordenarFilas(filas, 'nombre', 'asc')
    expect(filas).toEqual(copia)
  })

  it('estabilidad: filas con mismo valor mantienen orden relativo', () => {
    const filas = [
      fila({ plataforma: 'Broker', nombre: 'X', cantidad: 5 }),
      fila({ plataforma: 'Broker', nombre: 'Y', cantidad: 5 }),
      fila({ plataforma: 'Broker', nombre: 'Z', cantidad: 5 }),
    ]
    expect(ordenarFilas(filas, 'cantidad', 'asc').map(f => f.nombre)).toEqual(['X', 'Y', 'Z'])
  })
})

import { describe, it, expect } from 'vitest'
import { seguirRecomendacion, resumirDesempenoAgente } from './seguimientoRecomendaciones'
import type { RecomendacionesDoc } from './recomendaciones'
import type { Operacion } from './tipos'

const serie = {
  fechas: ['2026-08-01', '2026-08-05', '2026-08-10', '2026-08-15'],
  precios: [100, 120, 90, 110],
}
const series = { VOO: serie }
const precios = { VOO: 110 }

describe('seguirRecomendacion', () => {
  it('calcula retorno, target y stop tocados para una compra', () => {
    const s = seguirRecomendacion(
      { accion: 'comprar', ticker: 'VOO', precioAlRecomendar: 100, precioObjetivo: 115, stopLoss: 92 },
      '2026-08-01T12:00:00Z',
      precios,
      series,
      []
    )
    expect(s).not.toBeNull()
    expect(s!.retornoPct).toBe(10)
    expect(s!.precioActual).toBe(110)
    // Después del 08-01 el precio tocó 120 (≥115) y 90 (≤92).
    expect(s!.tocoTarget).toBe(true)
    expect(s!.tocoStop).toBe(true)
    expect(s!.seguida).toBe(false)
  })

  it('marca seguida si hay una operación real acorde dentro de los 7 días', () => {
    const ops: Operacion[] = [
      { fecha: '2026-08-04', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 100 },
    ]
    const s = seguirRecomendacion(
      { accion: 'comprar', ticker: 'VOO', precioAlRecomendar: 100 },
      '2026-08-01T12:00:00Z',
      precios,
      series,
      ops
    )
    expect(s!.seguida).toBe(true)
    // Fuera de la ventana de 7 días no cuenta.
    const tarde = seguirRecomendacion(
      { accion: 'comprar', ticker: 'VOO', precioAlRecomendar: 100 },
      '2026-07-01T12:00:00Z',
      precios,
      series,
      ops
    )
    expect(tarde!.seguida).toBe(false)
  })

  it('sin precio estampado o con acción no direccional devuelve null', () => {
    expect(
      seguirRecomendacion({ accion: 'comprar', ticker: 'VOO' }, '2026-08-01', precios, series, [])
    ).toBeNull()
    expect(
      seguirRecomendacion({ accion: 'mantener', ticker: 'VOO', precioAlRecomendar: 100 }, '2026-08-01', precios, series, [])
    ).toBeNull()
  })

  it('cae al último cierre de la serie si no hay precio fresco', () => {
    const s = seguirRecomendacion(
      { accion: 'comprar', ticker: 'VOO', precioAlRecomendar: 100 },
      '2026-08-01',
      {},
      series,
      []
    )
    expect(s!.precioActual).toBe(110)
  })
})

describe('resumirDesempenoAgente', () => {
  const doc: RecomendacionesDoc = {
    corridas: [
      {
        tipo: 'diario',
        fecha: '2026-08-01T12:00:00Z',
        resumen: 'r',
        analisis: '',
        recomendaciones: [
          { accion: 'comprar', ticker: 'VOO', razon: 'x', precioAlRecomendar: 100 }, // +10% ⇒ acierto
          { accion: 'vender', ticker: 'VOO', razon: 'x', precioAlRecomendar: 120 }, // −8.33% ⇒ acierto (evitó caída)
          { accion: 'mantener', ticker: 'VOO', razon: 'x', precioAlRecomendar: 100 }, // no direccional
          { accion: 'comprar', ticker: 'MELI', razon: 'x', precioAlRecomendar: 100 }, // sin serie ni precio
          { accion: 'comprar', ticker: 'VOO', razon: 'x' }, // sin precio estampado
        ],
      },
      { tipo: 'error', fecha: '2026-08-02T12:00:00Z', resumen: 'e', analisis: '', recomendaciones: [] },
    ],
  }

  it('agrega aciertos y retornos medianos por lado', () => {
    const d = resumirDesempenoAgente(doc, precios, series, [])
    expect(d).not.toBeNull()
    expect(d!.evaluadas).toBe(2)
    expect(d!.compras).toEqual({ n: 1, aciertos: 1, retornoMedianoPct: 10 })
    expect(d!.ventas.n).toBe(1)
    expect(d!.ventas.aciertos).toBe(1)
    expect(d!.ventas.retornoMedianoPct).toBeCloseTo(-8.33)
    expect(d!.seguidas).toBe(0)
  })

  it('devuelve null sin recomendaciones evaluables', () => {
    expect(resumirDesempenoAgente(null, precios, series, [])).toBeNull()
    expect(resumirDesempenoAgente({ corridas: [] }, precios, series, [])).toBeNull()
  })
})

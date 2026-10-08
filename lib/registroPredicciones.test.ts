import { describe, it, expect } from 'vitest'
import type { Prediccion } from './predictor'
import {
  MAX_RESUELTOS,
  actualizarRegistros,
  sumarDias,
  type PrediccionesDoc,
  type Registro,
  type Vigente,
} from './registroPredicciones'

const PRED: Prediccion = {
  m1: { p10: 90, p50: 110, p90: 120, h: 21 },
  m3: { p10: 80, p50: 130, p90: 150, h: 63 },
}

function vigente(ticker: string, fechas: string[], precios: number[]): Vigente {
  return { ticker, tipo: 'acciones', serie: { fechas, precios }, prediccion: PRED }
}

function pendiente(sobre: Partial<Registro>): Registro {
  return {
    fechaOrigen: '2026-06-01',
    ticker: 'VOO',
    tipo: 'acciones',
    horizonte: '1m',
    precioOrigen: 100,
    p10: 90,
    p50: 105,
    p90: 120,
    fechaVencimiento: '2026-07-01',
    resultado: null,
    ...sobre,
  }
}

describe('sumarDias (UTC, sin off-by-one por timezone)', () => {
  it('cruza mes y año calendario', () => {
    expect(sumarDias('2026-07-30', 30)).toBe('2026-08-29')
    expect(sumarDias('2026-07-30', 90)).toBe('2026-10-28')
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14')
    expect(sumarDias('2026-12-15', 90)).toBe('2027-03-15')
  })
})

describe('actualizarRegistros — altas', () => {
  it('alta inicial: un registro pendiente por horizonte, vencimiento +30/+90 corridos', () => {
    const r = actualizarRegistros({ registros: [] }, [vigente('VOO', ['2026-07-29', '2026-07-30'], [99, 100])])
    expect(r.cambio).toBe(true)
    expect(r.doc.registros).toEqual([
      {
        fechaOrigen: '2026-07-30',
        ticker: 'VOO',
        tipo: 'acciones',
        horizonte: '1m',
        precioOrigen: 100,
        p10: 90,
        p50: 110,
        p90: 120,
        fechaVencimiento: '2026-08-29',
        resultado: null,
      },
      {
        fechaOrigen: '2026-07-30',
        ticker: 'VOO',
        tipo: 'acciones',
        horizonte: '3m',
        precioOrigen: 100,
        p10: 80,
        p50: 130,
        p90: 150,
        fechaVencimiento: '2026-10-28',
        resultado: null,
      },
    ])
  })

  it('idempotente con la misma fecha de serie: sin re-alta y cambio false', () => {
    const v = vigente('VOO', ['2026-07-29', '2026-07-30'], [99, 100])
    const r1 = actualizarRegistros({ registros: [] }, [v])
    const r2 = actualizarRegistros(r1.doc, [v])
    expect(r2.cambio).toBe(false)
    expect(r2.doc.registros).toEqual(r1.doc.registros)
  })

  it('fecha de serie nueva: alta nueva (el ticker no acumula por visita, sí por dato)', () => {
    const r1 = actualizarRegistros({ registros: [] }, [vigente('VOO', ['2026-07-30'], [100])])
    const r2 = actualizarRegistros(r1.doc, [vigente('VOO', ['2026-07-30', '2026-07-31'], [100, 101])])
    expect(r2.cambio).toBe(true)
    expect(r2.doc.registros).toHaveLength(4)
    const nuevos = r2.doc.registros.filter((x) => x.fechaOrigen === '2026-07-31')
    expect(nuevos).toHaveLength(2)
    expect(nuevos[0].precioOrigen).toBe(101)
  })
})

describe('actualizarRegistros — resolución', () => {
  it('resuelve con el PRIMER precio de fecha ≥ vencimiento, dentro y fuera de banda', () => {
    // Vence 2026-07-01; la serie salta ese día: el primer precio elegible es
    // el de 2026-07-02 (99), no el último disponible.
    const dentro = pendiente({ horizonte: '1m' }) // banda [90, 120], p50 105
    // fechaOrigen 2026-04-04 + 90 = 2026-07-03: resuelve con 97, banda [101, 120]
    const fuera = pendiente({
      horizonte: '3m',
      fechaOrigen: '2026-04-04',
      p10: 101,
      p50: 110,
      p90: 120,
      fechaVencimiento: '2026-07-03',
    })
    const v = vigente('VOO', ['2026-06-28', '2026-07-02', '2026-07-03'], [98, 99, 97])
    const r = actualizarRegistros({ registros: [dentro, fuera] }, [v])
    expect(r.cambio).toBe(true)
    const res1 = r.doc.registros.find((x) => x.fechaOrigen === '2026-06-01')!
    expect(res1.resultado).toEqual({ fecha: '2026-07-02', precioReal: 99, dentroBanda: true, errorPct: 0.06 })
    const res2 = r.doc.registros.find((x) => x.fechaOrigen === '2026-04-04')!
    expect(res2.resultado).toEqual({ fecha: '2026-07-03', precioReal: 97, dentroBanda: false, errorPct: 0.13 })
    // además dio de alta los registros de hoy (fechaOrigen 2026-07-03)
    expect(r.doc.registros.filter((x) => x.fechaOrigen === '2026-07-03' && x.resultado === null)).toHaveLength(2)
  })

  it('sin precio ≥ vencimiento el registro sigue pendiente; ticker fuera de vigentes queda intacto', () => {
    const p = pendiente({ fechaVencimiento: '2027-01-01' })
    const ajeno = pendiente({ ticker: 'BTC', fechaOrigen: '2026-05-05', fechaVencimiento: '2026-06-04' })
    // BTC no está en vigentes: aunque venció, queda como está (se resuelve si vuelve)
    const v = vigente('VOO', ['2026-06-01'], [100]) // misma fechaOrigen: tampoco hay alta
    const conAlta1m = pendiente({ horizonte: '3m', fechaVencimiento: '2026-08-30' })
    const r = actualizarRegistros({ registros: [p, conAlta1m, ajeno] }, [v])
    expect(r.cambio).toBe(false)
    expect(r.doc.registros).toEqual([p, conAlta1m, ajeno])
  })
})

describe('actualizarRegistros — poda', () => {
  it('tope de 400 SOLO sobre resueltos, por fechaOrigen más antigua; pendientes nunca', () => {
    expect(MAX_RESUELTOS).toBe(400)
    const resueltos: Registro[] = Array.from({ length: 402 }, (_, i) =>
      pendiente({
        fechaOrigen: sumarDias('2020-01-01', i),
        fechaVencimiento: sumarDias('2020-01-31', i),
        resultado: { fecha: sumarDias('2020-01-31', i), precioReal: 100, dentroBanda: true, errorPct: 0 },
      })
    )
    // pendiente MÁS VIEJO que todos los resueltos: aun así no se poda
    const viejo = pendiente({ fechaOrigen: '2019-01-01', fechaVencimiento: '2019-01-31' })
    const r = actualizarRegistros({ registros: [viejo, ...resueltos] }, [])
    expect(r.cambio).toBe(true)
    expect(r.doc.registros).toHaveLength(401)
    expect(r.doc.registros).toContainEqual(viejo)
    // se fueron los dos resueltos más antiguos
    expect(r.doc.registros.some((x) => x.fechaOrigen === '2020-01-01')).toBe(false)
    expect(r.doc.registros.some((x) => x.fechaOrigen === '2020-01-02')).toBe(false)
    expect(r.doc.registros.some((x) => x.fechaOrigen === '2020-01-03')).toBe(true)
  })

  it('cambio false con doc vacío y sin vigentes', () => {
    const doc: PrediccionesDoc = { registros: [] }
    const r = actualizarRegistros(doc, [])
    expect(r.cambio).toBe(false)
    expect(r.doc.registros).toEqual([])
  })
})

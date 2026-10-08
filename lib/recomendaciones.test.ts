import { describe, it, expect } from 'vitest'
import { validarResultado, agregarCorrida, estamparPrecios, MAX_CORRIDAS, type Resultado } from './recomendaciones'

const valido: Resultado = {
  tipo: 'diario',
  fecha: '2026-08-05T12:00:00.000Z',
  resumen: 'VIST sobrecomprada, mantener el resto',
  recomendaciones: [
    { accion: 'vender', ticker: 'VIST', montoUSD: 500, razon: 'RSI 78 y +40% en un mes' },
    { accion: 'comprar', ticker: 'NVDA', razon: 'corrección del 12%', esNuevo: true },
  ],
  analisis: '## Análisis\ntexto largo',
}

describe('validarResultado', () => {
  it('acepta un payload válido y lo reconstruye solo con campos conocidos', () => {
    const r = validarResultado({ ...valido, extra: 'basura' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resultado).toEqual(valido)
      expect('extra' in r.resultado).toBe(false)
    }
  })
  it('acepta tipo error sin recomendaciones', () => {
    const r = validarResultado({ tipo: 'error', fecha: valido.fecha, resumen: 'falló el fetch', recomendaciones: [], analisis: '' })
    expect(r.ok).toBe(true)
  })
  it.each([
    ['tipo inválido', { ...valido, tipo: 'mensual' }],
    ['sin fecha', { ...valido, fecha: 42 }],
    ['accion inválida', { ...valido, recomendaciones: [{ accion: 'apostar', ticker: 'X', razon: 'r' }] }],
    ['montoUSD no numérico', { ...valido, recomendaciones: [{ accion: 'comprar', ticker: 'X', razon: 'r', montoUSD: 'mil' }] }],
    ['no objeto', null],
  ])('rechaza %s', (_n, payload) => {
    expect(validarResultado(payload).ok).toBe(false)
  })
  it.each([
    ['más de 20 recomendaciones', { ...valido, recomendaciones: Array.from({ length: 21 }, () => valido.recomendaciones[0]) }],
    ['resumen vacío', { ...valido, resumen: '' }],
    ['ticker > 12', { ...valido, recomendaciones: [{ accion: 'comprar', ticker: 'TICKERDEMASIADOLARGO', razon: 'r' }] }],
  ])('rechaza límites: %s', (_n, payload) => {
    expect(validarResultado(payload).ok).toBe(false)
  })
  it('acepta textos largos sin truncarlos (los textos se muestran completos en la app)', () => {
    const r = validarResultado({
      ...valido,
      resumen: 'x'.repeat(2000),
      analisis: 'x'.repeat(50000),
      recomendaciones: [{ accion: 'comprar', ticker: 'X', razon: 'x'.repeat(3000) }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resultado.resumen).toHaveLength(2000)
      expect(r.resultado.analisis).toHaveLength(50000)
      expect(r.resultado.recomendaciones[0].razon).toHaveLength(3000)
    }
  })
  it('coerciona montoUSD numérico en string', () => {
    const r = validarResultado({ ...valido, recomendaciones: [{ accion: 'comprar', ticker: 'X', razon: 'r', montoUSD: '500' }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resultado.recomendaciones[0].montoUSD).toBe(500)
  })
  it('los errores nombran el campo exacto que falló', () => {
    const r = validarResultado({ ...valido, recomendaciones: [{ accion: 'apostar', ticker: 'X', razon: 'r' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('recomendaciones[0].accion')
  })
  it('acepta niveles de orden numéricos y en string, y los persiste campo a campo', () => {
    const r = validarResultado({
      ...valido,
      recomendaciones: [
        { accion: 'comprar', ticker: 'VOO', razon: 'r', montoUSD: 500, precioLimite: 612, stopLoss: '580', precioObjetivo: 660.5 },
      ],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resultado.recomendaciones[0]).toEqual({
        accion: 'comprar', ticker: 'VOO', razon: 'r', montoUSD: 500,
        precioLimite: 612, stopLoss: 580, precioObjetivo: 660.5,
      })
    }
  })
  it('omite niveles ausentes o null', () => {
    const r = validarResultado({
      ...valido,
      recomendaciones: [{ accion: 'vender', ticker: 'VIST', razon: 'r', precioLimite: null }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect('precioLimite' in r.resultado.recomendaciones[0]).toBe(false)
  })
  it.each([
    ['precioLimite no numérico', { precioLimite: 'seiscientos' }, 'recomendaciones[0].precioLimite: debe ser numérico'],
    ['stopLoss cero', { stopLoss: 0 }, 'recomendaciones[0].stopLoss: debe ser > 0'],
    ['precioObjetivo negativo', { precioObjetivo: -5 }, 'recomendaciones[0].precioObjetivo: debe ser > 0'],
  ])('rechaza %s con el campo exacto', (_n, extra, error) => {
    const r = validarResultado({ ...valido, recomendaciones: [{ accion: 'comprar', ticker: 'X', razon: 'r', ...extra }] })
    expect(r).toEqual({ ok: false, error })
  })
  it('acepta niveles en acción mantener', () => {
    const r = validarResultado({
      ...valido,
      recomendaciones: [
        { accion: 'mantener', ticker: 'VOO', razon: 'posición core', precioObjetivo: 700 },
      ],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resultado.recomendaciones[0].precioObjetivo).toBe(700)
      expect('precioObjetivo' in r.resultado.recomendaciones[0]).toBe(true)
    }
  })
  it('estamparPrecios preserva los niveles de orden', () => {
    const resultadoConNiveles: Resultado = {
      tipo: 'diario',
      fecha: '2026-08-05T12:00:00.000Z',
      resumen: 'test',
      recomendaciones: [
        {
          accion: 'comprar',
          ticker: 'TICKER',
          razon: 'test',
          montoUSD: 100,
          precioLimite: 50,
          stopLoss: 40,
          precioObjetivo: 100,
        },
      ],
      analisis: 'test',
    }
    const r = estamparPrecios(resultadoConNiveles, { TICKER: 100 })
    expect(r.recomendaciones[0].precioAlRecomendar).toBe(100)
    expect(r.recomendaciones[0].precioLimite).toBe(50)
    expect(r.recomendaciones[0].stopLoss).toBe(40)
    expect(r.recomendaciones[0].precioObjetivo).toBe(100)
  })
})

describe('estamparPrecios', () => {
  it('estampa el precio conocido y deja intactas las recomendaciones sin precio', () => {
    const r = estamparPrecios(valido, { VIST: 67.2 })
    expect(r.recomendaciones[0].precioAlRecomendar).toBe(67.2)
    expect(r.recomendaciones[1].precioAlRecomendar).toBeUndefined()
    // no muta el original
    expect(valido.recomendaciones[0].precioAlRecomendar).toBeUndefined()
  })
})

describe('agregarCorrida', () => {
  it('agrega al frente y arranca de doc null', () => {
    const doc = agregarCorrida(null, valido)
    expect(doc.corridas).toHaveLength(1)
    const doc2 = agregarCorrida(doc, { ...valido, fecha: '2026-08-06T12:00:00.000Z' })
    expect(doc2.corridas[0].fecha).toBe('2026-08-06T12:00:00.000Z')
  })
  it(`recorta a ${MAX_CORRIDAS} corridas`, () => {
    let doc = agregarCorrida(null, valido)
    for (let i = 0; i < MAX_CORRIDAS + 5; i++) doc = agregarCorrida(doc, valido)
    expect(doc.corridas).toHaveLength(MAX_CORRIDAS)
  })
})

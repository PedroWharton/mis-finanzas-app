import { describe, it, expect } from 'vitest'
import { validarMovimientos, esDuplicada, descripcion, aplicarMovimientos, eliminarOperacion, eliminarPlataforma } from './movimientos'
import type { Operacion, Portfolio } from './tipos'

const compra = { fecha: '2026-08-06', tipo: 'compra', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.5, montoUSD: 900 }

describe('validarMovimientos', () => {
  it('acepta un batch válido y reconstruye solo campos conocidos', () => {
    const r = validarMovimientos({ operaciones: [{ ...compra, anioRenta: 2025, extra: 'basura' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.operaciones[0]).toEqual(compra)
      expect('anioRenta' in r.operaciones[0]).toBe(false)
    }
  })
  it('normaliza ticker a mayúsculas y coerciona números en string', () => {
    const r = validarMovimientos({ operaciones: [{ ...compra, ticker: 'meli', montoUSD: '900', cantidad: '0.5' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.operaciones[0].ticker).toBe('MELI')
      expect(r.operaciones[0].montoUSD).toBe(900)
      expect(r.operaciones[0].cantidad).toBe(0.5)
    }
  })
  it.each([
    ['payload no objeto', null],
    ['lista vacía', { operaciones: [] }],
    ['fecha inválida', { operaciones: [{ ...compra, fecha: '06/08/2026' }] }],
    ['tipo inválido', { operaciones: [{ ...compra, tipo: 'apostar' }] }],
    ['plataforma vacía', { operaciones: [{ ...compra, plataforma: '  ' }] }],
    ['montoUSD cero', { operaciones: [{ ...compra, montoUSD: 0 }] }],
    ['ticker largo', { operaciones: [{ ...compra, ticker: 'TICKERDEMASIADOLARGO' }] }],
    ['compra sin ticker', { operaciones: [{ fecha: '2026-08-06', tipo: 'compra', plataforma: 'X', cantidad: 1, montoUSD: 10 }] }],
    ['venta sin cantidad', { operaciones: [{ fecha: '2026-08-06', tipo: 'venta', plataforma: 'X', ticker: 'VOO', montoUSD: 10 }] }],
    ['interes con cantidad sin ticker', { operaciones: [{ fecha: '2026-08-06', tipo: 'interes', plataforma: 'Nexo', cantidad: 1, montoUSD: 10 }] }],
    ['plataforma demasiado larga', { operaciones: [{ ...compra, plataforma: 'X'.repeat(61) }] }],
  ])('rechaza %s', (_n, payload) => {
    expect(validarMovimientos(payload).ok).toBe(false)
  })
  it('el error nombra índice y campo', () => {
    const r = validarMovimientos({ operaciones: [compra, { ...compra, montoUSD: -1 }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('operaciones[1].montoUSD')
  })
  it('descarta cantidad en deposito/retiro/dividendo', () => {
    const r = validarMovimientos({ operaciones: [{ fecha: '2026-08-06', tipo: 'deposito', plataforma: 'X', montoUSD: 100, cantidad: 5 }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.operaciones[0].cantidad).toBeUndefined()
  })
})

describe('esDuplicada', () => {
  const base: Operacion = { fecha: '2026-08-06', tipo: 'compra', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.5, montoUSD: 900 }
  it('detecta idéntica con tolerancia de monto', () => {
    expect(esDuplicada(base, { ...base, montoUSD: 900.005 })).toBe(true)
  })
  it('distinta cantidad no es duplicada', () => {
    expect(esDuplicada(base, { ...base, cantidad: 0.6 })).toBe(false)
  })
  it('distinta fecha/tipo/plataforma/ticker no es duplicada', () => {
    expect(esDuplicada(base, { ...base, fecha: '2026-08-07' })).toBe(false)
    expect(esDuplicada(base, { ...base, tipo: 'venta' })).toBe(false)
    expect(esDuplicada(base, { ...base, plataforma: 'Nexo' })).toBe(false)
    expect(esDuplicada(base, { ...base, ticker: 'VOO' })).toBe(false)
  })
})

describe('descripcion', () => {
  it('arma una línea legible', () => {
    const r = descripcion({ fecha: '2026-08-06', tipo: 'compra', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.5, montoUSD: 900 })
    expect(r).toContain('compra')
    expect(r).toContain('MELI')
    expect(r).toContain('900')
    expect(r).toContain('DolarApp')
  })
})

function portfolioBase(): Portfolio {
  return {
    monedaBase: 'USD',
    plataformas: [
      {
        nombre: 'DolarApp',
        efectivoUSD: 1000,
        posiciones: [
          { ticker: 'VOO', nombre: 'Vanguard S&P 500 ETF', tipo: 'acciones', cantidad: 2, costoUSD: 1200, fecha: '2026-06-18' },
        ],
      },
      {
        nombre: 'Nexo',
        efectivoUSD: 0,
        posiciones: [{ ticker: 'NEXO', nombre: 'Nexo Token', tipo: 'cripto', cantidad: 100, costoUSD: 80, fecha: '2026-01-01' }],
      },
    ],
    operaciones: [
      { fecha: '2026-06-18', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 2, montoUSD: 1200 },
    ],
  }
}

const op = (extra: Partial<Operacion> & Pick<Operacion, 'tipo' | 'montoUSD'>): Operacion => ({
  fecha: '2026-08-06', plataforma: 'DolarApp', ...extra,
})

describe('aplicarMovimientos', () => {
  it('no muta el portfolio original', () => {
    const pf = portfolioBase()
    aplicarMovimientos(pf, [op({ tipo: 'deposito', montoUSD: 100 })])
    expect(pf.plataformas[0].efectivoUSD).toBe(1000)
    expect(pf.operaciones).toHaveLength(1)
  })
  it('deposito y dividendo suman al efectivo; retiro resta', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'deposito', montoUSD: 100 }),
      op({ tipo: 'dividendo', montoUSD: 4.22, ticker: 'VOO' }),
      op({ tipo: 'retiro', montoUSD: 50 }),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.portfolio.plataformas[0].efectivoUSD).toBeCloseTo(1054.22, 2)
  })
  it('retiro que deja efectivo negativo es error', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'retiro', montoUSD: 2000 })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe('invalido')
  })
  it('compra crea posición nueva con tipo inferido y fecha de la operación', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'compra', ticker: 'MELI', cantidad: 0.5, montoUSD: 900 }),
      op({ tipo: 'compra', ticker: 'BTC', cantidad: 0.01, montoUSD: 600, fecha: '2026-08-07' }),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const dolarApp = r.portfolio.plataformas[0]
      const meli = dolarApp.posiciones.find((p) => p.ticker === 'MELI')
      const btc = dolarApp.posiciones.find((p) => p.ticker === 'BTC')
      expect(meli).toMatchObject({ tipo: 'acciones', cantidad: 0.5, costoUSD: 900, fecha: '2026-08-06' })
      expect(btc?.tipo).toBe('cripto')
      expect(dolarApp.efectivoUSD).toBeCloseTo(1000 - 900 - 600, 2)
    }
  })
  it('compra sobre posición existente acumula y actualiza fecha', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'compra', ticker: 'VOO', cantidad: 1, montoUSD: 700 })])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const voo = r.portfolio.plataformas[0].posiciones.find((p) => p.ticker === 'VOO')
      expect(voo).toMatchObject({ cantidad: 3, costoUSD: 1900, fecha: '2026-08-06' })
    }
  })
  it('compra con efectivo insuficiente se permite con advertencia', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'compra', ticker: 'VOO', cantidad: 2, montoUSD: 1400 })])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.portfolio.plataformas[0].efectivoUSD).toBeCloseTo(-400, 2)
      expect(r.advertencias.length).toBeGreaterThan(0)
    }
  })
  it('venta parcial reduce costo proporcionalmente', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'VOO', cantidad: 1, montoUSD: 700 })])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const voo = r.portfolio.plataformas[0].posiciones.find((p) => p.ticker === 'VOO')
      expect(voo).toMatchObject({ cantidad: 1, costoUSD: 600 })
      expect(r.portfolio.plataformas[0].efectivoUSD).toBeCloseTo(1700, 2)
    }
  })
  it('venta total (con tolerancia) elimina la posición', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'VOO', cantidad: 1.9999999, montoUSD: 1400 })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.portfolio.plataformas[0].posiciones.find((p) => p.ticker === 'VOO')).toBeUndefined()
  })
  it('venta parcial registra la ganancia realizada (monto - costo removido)', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'VOO', cantidad: 1, montoUSD: 700 })])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const venta = r.portfolio.operaciones.find((o) => o.tipo === 'venta')
      expect(venta?.gananciaRealizadaUSD).toBeCloseTo(100, 2) // 700 - 600 de costo removido
    }
  })
  it('venta total registra la ganancia contra el costo completo, también si es pérdida', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'VOO', cantidad: 2, montoUSD: 1100 })])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const venta = r.portfolio.operaciones.find((o) => o.tipo === 'venta')
      expect(venta?.gananciaRealizadaUSD).toBeCloseTo(-100, 2) // 1100 - 1200
    }
  })
  it('validarMovimientos descarta gananciaRealizadaUSD si viene del cliente (campo derivado)', () => {
    const v = validarMovimientos({
      operaciones: [{ fecha: '2026-08-06', tipo: 'venta', plataforma: 'X', ticker: 'VOO', cantidad: 1, montoUSD: 700, gananciaRealizadaUSD: 9999 }],
    })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.operaciones[0].gananciaRealizadaUSD).toBeUndefined()
  })
  it('venta en exceso o sin posición es error', () => {
    expect(aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'VOO', cantidad: 3, montoUSD: 100 })]).ok).toBe(false)
    expect(aplicarMovimientos(portfolioBase(), [op({ tipo: 'venta', ticker: 'NVDA', cantidad: 1, montoUSD: 100 })]).ok).toBe(false)
  })
  it('rendimiento in-kind suma cantidad sin tocar costo ni efectivo', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'rendimiento', plataforma: 'Nexo', ticker: 'NEXO', cantidad: 0.76, montoUSD: 0.57 }),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const nexo = r.portfolio.plataformas[1]
      expect(nexo.posiciones[0].cantidad).toBeCloseTo(100.76, 6)
      expect(nexo.posiciones[0].costoUSD).toBe(80)
      expect(nexo.efectivoUSD).toBe(0)
    }
  })
  it('rendimiento in-kind sin posición es error; interes cash va al efectivo', () => {
    expect(aplicarMovimientos(portfolioBase(), [op({ tipo: 'rendimiento', ticker: 'SOL', cantidad: 1, montoUSD: 10 })]).ok).toBe(false)
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'interes', plataforma: 'Nexo', montoUSD: 10 })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.portfolio.plataformas[1].efectivoUSD).toBe(10)
  })
  it('deposito crea plataforma nueva; otros tipos sobre plataforma inexistente fallan', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'deposito', plataforma: 'Mercury', montoUSD: 500 })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.portfolio.plataformas.find((p) => p.nombre === 'Mercury')?.efectivoUSD).toBe(500)
    expect(aplicarMovimientos(portfolioBase(), [op({ tipo: 'compra', plataforma: 'Mercury', ticker: 'X', cantidad: 1, montoUSD: 10 })]).ok).toBe(false)
  })
  it('duplicado contra el historial completo → codigo duplicado, todo-o-nada', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'deposito', montoUSD: 100 }),
      { fecha: '2026-06-18', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 2, montoUSD: 1200 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok && r.codigo === 'duplicado') expect(r.duplicados).toHaveLength(1)
  })
  it('duplicado dentro del mismo batch también se rechaza (OCR que lee dos veces la misma fila)', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'deposito', montoUSD: 100 }),
      op({ tipo: 'deposito', montoUSD: 100 }),
    ])
    expect(r.ok).toBe(false)
    if (!r.ok && r.codigo === 'duplicado') expect(r.duplicados).toHaveLength(1)
  })
  it('inserta las operaciones ordenadas por fecha en el array global', () => {
    const r = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'deposito', montoUSD: 100, fecha: '2026-08-06' }),
      op({ tipo: 'deposito', montoUSD: 200, fecha: '2026-05-01' }),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.portfolio.operaciones.map((o) => o.fecha)).toEqual(['2026-05-01', '2026-06-18', '2026-08-06'])
  })
  it('resumen tiene una línea por operación aplicada', () => {
    const r = aplicarMovimientos(portfolioBase(), [op({ tipo: 'deposito', montoUSD: 100 })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resumen).toHaveLength(1)
  })
})

describe('eliminarOperacion', () => {
  const compraVOO: Operacion = { fecha: '2026-06-18', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 2, montoUSD: 1200 }

  it('deshace una compra: devuelve el efectivo y quita la posición si queda en cero', () => {
    const r = eliminarOperacion(portfolioBase(), compraVOO)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const pl = r.portfolio.plataformas[0]
      expect(pl.efectivoUSD).toBe(2200)
      expect(pl.posiciones.some((p) => p.ticker === 'VOO')).toBe(false)
      expect(r.portfolio.operaciones).toHaveLength(0)
    }
  })

  it('no muta el portfolio original', () => {
    const pf = portfolioBase()
    eliminarOperacion(pf, compraVOO)
    expect(pf.plataformas[0].efectivoUSD).toBe(1000)
    expect(pf.operaciones).toHaveLength(1)
  })

  it('deshace una venta restaurando la posición con su costo original', () => {
    // Vender 1 VOO por $700 (costo removido $600, ganancia $100) y deshacerlo.
    const conVenta = aplicarMovimientos(portfolioBase(), [
      op({ tipo: 'venta', ticker: 'VOO', cantidad: 1, montoUSD: 700, fecha: '2026-07-01' }),
    ])
    expect(conVenta.ok).toBe(true)
    if (!conVenta.ok) return
    const venta = conVenta.portfolio.operaciones.find((o) => o.tipo === 'venta')!
    expect(venta.gananciaRealizadaUSD).toBe(100)

    const r = eliminarOperacion(conVenta.portfolio, venta)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const pl = r.portfolio.plataformas[0]
      const pos = pl.posiciones.find((p) => p.ticker === 'VOO')!
      expect(pos.cantidad).toBe(2)
      expect(pos.costoUSD).toBe(1200)
      expect(pl.efectivoUSD).toBe(1000)
    }
  })

  it('rechaza deshacer un depósito cuya plata ya se usó (efectivo quedaría negativo)', () => {
    const pf = portfolioBase()
    pf.operaciones.push({ fecha: '2026-06-01', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 5000 })
    const r = eliminarOperacion(pf, { fecha: '2026-06-01', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 5000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('negativo')
  })

  it('rechaza deshacer una compra cuyas unidades ya no están', () => {
    const pf = portfolioBase()
    pf.plataformas[0].posiciones[0].cantidad = 0.5
    const r = eliminarOperacion(pf, compraVOO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('deshacer la compra')
  })

  it('operación inexistente → error de no encontrada', () => {
    const r = eliminarOperacion(portfolioBase(), op({ tipo: 'deposito', montoUSD: 999 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('no se encontró')
  })
})

describe('eliminarPlataforma', () => {
  it('borra la plataforma y todas sus operaciones del historial', () => {
    const pf = portfolioBase()
    pf.operaciones.push({ fecha: '2026-07-01', tipo: 'deposito', plataforma: 'Nexo', montoUSD: 50 })
    const r = eliminarPlataforma(pf, 'DolarApp')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.portfolio.plataformas.map((p) => p.nombre)).toEqual(['Nexo'])
      expect(r.portfolio.operaciones).toHaveLength(1)
      expect(r.operacionesEliminadas).toBe(1)
    }
  })

  it('plataforma inexistente → error', () => {
    const r = eliminarPlataforma(portfolioBase(), 'Mercury')
    expect(r.ok).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { aportesAcumuladosHasta, aportesNetosEntre, serieAportes, rentaDelAnio, modifiedDietz, exposicion, gananciaRealizadaPorPlataforma } from './analitica'
import type { Operacion, Portfolio, Posicion, Snapshot } from './tipos'

const ops: Operacion[] = [
  { fecha: '2025-01-15', tipo: 'deposito', plataforma: 'Bono Ejemplo', montoUSD: 15000, nota: 'Suscripción bono' },
  { fecha: '2026-01-15', tipo: 'interes', plataforma: 'Bono Ejemplo', montoUSD: 1500, anioRenta: 2025, nota: 'Interés anual 10% (devengado 2025)' },
  { fecha: '2026-06-08', tipo: 'deposito', plataforma: 'Nexo', montoUSD: 5000, nota: 'Aporte inicial' },
  { fecha: '2026-06-08', tipo: 'compra', plataforma: 'Nexo', ticker: 'ETH', cantidad: 0.5, montoUSD: 1000 },
  { fecha: '2026-06-08', tipo: 'compra', plataforma: 'Nexo', ticker: 'BTC', cantidad: 0.05, montoUSD: 3000 },
  { fecha: '2026-06-08', tipo: 'compra', plataforma: 'Nexo', ticker: 'NEXO', cantidad: 1000, montoUSD: 1000 },
  { fecha: '2026-06-10', tipo: 'rendimiento', plataforma: 'Nexo', ticker: 'NEXO', cantidad: 0.75, montoUSD: 0.57, nota: 'Staking NEXO (3 acreditaciones)' },
  { fecha: '2026-06-18', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 5000 },
  { fecha: '2026-06-18', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 3.5, montoUSD: 2000 },
  { fecha: '2026-06-18', tipo: 'compra', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.6, montoUSD: 1000 },
  { fecha: '2026-06-25', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VIST', cantidad: 30, montoUSD: 2000 },
  { fecha: '2026-06-30', tipo: 'dividendo', plataforma: 'DolarApp', ticker: 'VOO', montoUSD: 4.22 },
  { fecha: '2026-07-08', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 2000 },
  { fecha: '2026-07-08', tipo: 'compra', plataforma: 'DolarApp', ticker: 'MU', cantidad: 2, montoUSD: 2000 },
  { fecha: '2026-07-14', tipo: 'deposito', plataforma: 'Binance', montoUSD: 2000 },
  { fecha: '2026-07-14', tipo: 'compra', plataforma: 'Binance', ticker: 'BTC', cantidad: 0.03, montoUSD: 2000 },
  { fecha: '2026-07-14', tipo: 'deposito', plataforma: 'Banco', montoUSD: 10000 },
]

describe('aportesAcumuladosHasta', () => {
  it('solo suma deposito/retiro, no compra/venta/dividendo/interes/rendimiento', () => {
    expect(aportesAcumuladosHasta(ops, '2025-01-15')).toBe(15000)
  })
  it('es inclusive en el borde de fecha (mismo día cuenta)', () => {
    expect(aportesAcumuladosHasta(ops, '2026-06-18')).toBe(15000 + 5000 + 5000)
  })
  it('acumula todo hasta la última fecha', () => {
    expect(aportesAcumuladosHasta(ops, '2026-07-14')).toBeCloseTo(
      15000 + 5000 + 5000 + 2000 + 2000 + 10000, 6
    )
  })
  it('retiro resta (monto positivo, convención de la API)', () => {
    const conRetiro: Operacion[] = [
      { fecha: '2026-01-01', tipo: 'deposito', plataforma: 'X', montoUSD: 1000 },
      { fecha: '2026-01-10', tipo: 'retiro', plataforma: 'X', montoUSD: 300 },
    ]
    expect(aportesAcumuladosHasta(conRetiro, '2026-01-10')).toBe(700)
  })
  it('fecha anterior a cualquier operación da 0', () => {
    expect(aportesAcumuladosHasta(ops, '2024-01-01')).toBe(0)
  })
})

describe('aportesNetosEntre', () => {
  const flujos: Operacion[] = [
    { fecha: '2026-08-09', tipo: 'deposito', plataforma: 'X', montoUSD: 100 },
    { fecha: '2026-08-10', tipo: 'deposito', plataforma: 'X', montoUSD: 1500 },
    { fecha: '2026-08-11', tipo: 'retiro', plataforma: 'X', montoUSD: 200 },
    { fecha: '2026-08-13', tipo: 'deposito', plataforma: 'X', montoUSD: 50 },
  ]
  it('excluye la fecha inicial e incluye la final, neteando retiros', () => {
    // (09, 13] → 1500 - 200 + 50
    expect(aportesNetosEntre(flujos, '2026-08-09', '2026-08-13')).toBe(1350)
  })
  it('sin flujos en el rango da 0', () => {
    expect(aportesNetosEntre(flujos, '2026-08-13', '2026-08-20')).toBe(0)
  })
})

describe('serieAportes', () => {
  it('es monótona no decreciente y escalonada según fechas de depósito', () => {
    const fechas = ['2025-01-01', '2025-01-15', '2026-06-01', '2026-06-18', '2026-07-14']
    const serie = serieAportes(ops, fechas)
    expect(serie).toEqual([
      0,
      15000,
      15000,
      15000 + 5000 + 5000,
      15000 + 5000 + 5000 + 2000 + 2000 + 10000,
    ])
    for (let i = 1; i < serie.length; i++) expect(serie[i]).toBeGreaterThanOrEqual(serie[i - 1])
  })
})

describe('rentaDelAnio', () => {
  const bono: Posicion = {
    ticker: '', nombre: 'Bono Ejemplo', tipo: 'bono', cantidad: 1, costoUSD: 15000,
    fecha: '2025-01-15', tasaAnual: 0.1, ultimaRenovacion: '2026-01-15',
  }
  const pf: Portfolio = {
    monedaBase: 'USD',
    plataformas: [{ nombre: 'Bono Ejemplo', efectivoUSD: 0, posiciones: [bono] }],
    operaciones: ops,
  }
  const HOY = new Date('2026-07-14T12:00:00Z')

  it('2026: dividendos, intereses, rendimientos y bono devengado prorrateado desde 15-ene', () => {
    const r = rentaDelAnio(ops, pf, 2026, HOY)
    const diasDevengo = Math.floor((HOY.getTime() - new Date('2026-01-15').getTime()) / 86_400_000)
    const bonoEsperado = 15000 * 0.1 * diasDevengo / 365
    expect(r.dividendos).toBeCloseTo(4.22, 6)
    expect(r.intereses).toBe(0) // el cupón de enero devengó en 2025 (anioRenta)
    expect(r.rendimientos).toBeCloseTo(0.57, 6)
    expect(r.bonoDevengado).toBeCloseTo(bonoEsperado, 6)
    expect(r.total).toBeCloseTo(4.22 + 0.57 + bonoEsperado, 6)
  })

  it('año sin datos aún (2027, futuro) da todo 0', () => {
    const r = rentaDelAnio(ops, pf, 2027, HOY)
    expect(r).toEqual({ dividendos: 0, intereses: 0, rendimientos: 0, ventas: 0, bonoDevengado: 0, total: 0 })
  })

  it('suma el resultado realizado de las ventas del año (incluye pérdidas) en ventas y en total', () => {
    const conVentas: Operacion[] = [
      ...ops,
      { fecha: '2026-07-05', tipo: 'venta', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.3, montoUSD: 700, gananciaRealizadaUSD: 120 },
      { fecha: '2026-07-06', tipo: 'venta', plataforma: 'Nexo', ticker: 'NEXO', cantidad: 100, montoUSD: 80, gananciaRealizadaUSD: -20 },
      // venta vieja sin el campo (pre-backfill): cuenta 0, no rompe
      { fecha: '2026-07-07', tipo: 'venta', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 600 },
    ]
    const r = rentaDelAnio(conVentas, pf, 2026, HOY)
    expect(r.ventas).toBeCloseTo(100, 6)
    expect(r.total).toBeCloseTo(r.dividendos + r.intereses + r.rendimientos + r.bonoDevengado + 100, 6)
  })

  it('año previo a la última renovación del bono: bonoDevengado 0', () => {
    const r = rentaDelAnio(ops, pf, 2025, HOY)
    expect(r.bonoDevengado).toBe(0)
  })
})

describe('gananciaRealizadaPorPlataforma', () => {
  it('acumula gananciaRealizadaUSD por plataforma, ignorando ventas sin el campo', () => {
    const ops: Operacion[] = [
      { fecha: '2026-07-05', tipo: 'venta', plataforma: 'DolarApp', ticker: 'MELI', cantidad: 0.3, montoUSD: 700, gananciaRealizadaUSD: 120 },
      { fecha: '2026-08-06', tipo: 'venta', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 600, gananciaRealizadaUSD: 49.49 },
      { fecha: '2026-07-30', tipo: 'venta', plataforma: 'Nexo', ticker: 'NEXO', cantidad: 100, montoUSD: 80, gananciaRealizadaUSD: -20 },
      { fecha: '2026-07-01', tipo: 'venta', plataforma: 'Binance', ticker: 'BTC', cantidad: 0.1, montoUSD: 600 },
      { fecha: '2026-07-01', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 500 },
    ]
    expect(gananciaRealizadaPorPlataforma(ops)).toEqual({ DolarApp: 169.49, Nexo: -20 })
  })
})

describe('modifiedDietz', () => {
  it('null con menos de 2 snapshots', () => {
    expect(modifiedDietz([], [])).toBeNull()
    expect(modifiedDietz([{ fecha: '2026-01-01', totalUSD: 1000, porPlataforma: {} }], [])).toBeNull()
  })

  it('sin flujos: retorno = VF/VI - 1', () => {
    const snapshots: Snapshot[] = [
      { fecha: '2026-01-01', totalUSD: 1000, porPlataforma: {} },
      { fecha: '2026-02-01', totalUSD: 1100, porPlataforma: {} },
    ]
    const r = modifiedDietz(snapshots, [])
    expect(r).not.toBeNull()
    expect(r!.retorno).toBeCloseTo(1100 / 1000 - 1, 10)
    expect(r!.desde).toBe('2026-01-01')
  })

  it('con flujo a mitad de período: pondera por wi', () => {
    // Período de 30 días, depósito de 100 a los 15 días (wi = (30-15)/30 = 0.5)
    const snapshots: Snapshot[] = [
      { fecha: '2026-01-01', totalUSD: 1000, porPlataforma: {} },
      { fecha: '2026-01-31', totalUSD: 1150, porPlataforma: {} },
    ]
    const ops: Operacion[] = [
      { fecha: '2026-01-16', tipo: 'deposito', plataforma: 'X', montoUSD: 100 },
    ]
    const r = modifiedDietz(snapshots, ops)
    const D = 30
    const di = 15
    const wi = (D - di) / D
    const esperado = (1150 - 1000 - 100) / (1000 + 100 * wi)
    expect(r).not.toBeNull()
    expect(r!.retorno).toBeCloseTo(esperado, 10)
  })

  it('retiro con monto positivo entra como flujo negativo', () => {
    // Período de 30 días, retiro de 100 a los 15 días (wi = 0.5)
    const snapshots: Snapshot[] = [
      { fecha: '2026-01-01', totalUSD: 1000, porPlataforma: {} },
      { fecha: '2026-01-31', totalUSD: 950, porPlataforma: {} },
    ]
    const ops: Operacion[] = [
      { fecha: '2026-01-16', tipo: 'retiro', plataforma: 'X', montoUSD: 100 },
    ]
    const r = modifiedDietz(snapshots, ops)
    const esperado = (950 - 1000 - -100) / (1000 + -100 * 0.5)
    expect(r).not.toBeNull()
    expect(r!.retorno).toBeCloseTo(esperado, 10)
  })

  it('ignora flujos fuera del período (antes del primer snapshot)', () => {
    const snapshots: Snapshot[] = [
      { fecha: '2026-01-01', totalUSD: 1000, porPlataforma: {} },
      { fecha: '2026-02-01', totalUSD: 1100, porPlataforma: {} },
    ]
    const ops: Operacion[] = [
      { fecha: '2025-12-01', tipo: 'deposito', plataforma: 'X', montoUSD: 5000 },
    ]
    const r = modifiedDietz(snapshots, ops)
    expect(r!.retorno).toBeCloseTo(1100 / 1000 - 1, 10)
  })
})

describe('exposicion', () => {
  const accion: Posicion = { ticker: 'VOO', nombre: 'VOO', tipo: 'acciones', cantidad: 2, costoUSD: 1000, fecha: '2026-06-18' }
  const cripto: Posicion = { ticker: 'BTC', nombre: 'BTC', tipo: 'cripto', cantidad: 1, costoUSD: 500, fecha: '2026-06-18' }
  const bono: Posicion = { ticker: '', nombre: 'Bono', tipo: 'bono', cantidad: 1, costoUSD: 15000, fecha: '2025-01-15', tasaAnual: 0.1, ultimaRenovacion: '2026-01-15' }
  const HOY = new Date('2026-07-14T12:00:00Z')

  const pf: Portfolio = {
    monedaBase: 'USD',
    plataformas: [
      { nombre: 'Broker', efectivoUSD: 50, posiciones: [accion, cripto] },
      { nombre: 'Bonos', efectivoUSD: 0, posiciones: [bono] },
    ],
    operaciones: [],
  }

  it('agrupa variable/fija/liquido y por moneda (default USD)', () => {
    const precios = { VOO: 600, BTC: 700 }
    const e = exposicion(pf, precios, HOY)
    expect(e.variable).toBeCloseTo(1200 + 700, 6)
    expect(e.fija).toBeCloseTo(15000 * (1 + 0.1 * 180 / 365), 2)
    expect(e.liquido).toBeCloseTo(50, 6)
    expect(e.porMoneda['USD']).toBeCloseTo(e.variable + e.fija + e.liquido, 2)
    expect(Object.keys(e.porMoneda)).toEqual(['USD'])
  })

  it('respeta campo moneda por plataforma cuando está presente', () => {
    const pfMulti: Portfolio = {
      monedaBase: 'USD',
      plataformas: [
        { nombre: 'Broker', efectivoUSD: 50, posiciones: [accion], moneda: 'ARS' },
        { nombre: 'Bonos', efectivoUSD: 0, posiciones: [bono] },
      ],
      operaciones: [],
    }
    const e = exposicion(pfMulti, { VOO: 600 }, HOY)
    expect(e.porMoneda['ARS']).toBeCloseTo(1250, 2)
    expect(e.porMoneda['USD']).toBeCloseTo(15000 * (1 + 0.1 * 180 / 365), 2)
  })
})

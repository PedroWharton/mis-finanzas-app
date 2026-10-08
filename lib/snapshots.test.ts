import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { registrarSnapshot, ajustarSnapshotsPorAportes, quitarPlataformaDeSnapshots } from './snapshots'
import { crearStorageFs } from './storage'
import type { Storage } from './storage'
import type { Operacion, Snapshot } from './tipos'

const HOY = new Date('2026-07-14T12:00:00Z')
let dir: string
let storage: Storage

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'snap-'))
  writeFileSync(path.join(dir, 'portfolio.json'), JSON.stringify({
    monedaBase: 'USD',
    plataformas: [{ nombre: 'Broker', efectivoUSD: 100, posiciones: [] }],
  }))
  writeFileSync(path.join(dir, 'snapshots.json'), '[]')
  storage = crearStorageFs(dir)
})

describe('registrarSnapshot', () => {
  it('agrega snapshot de hoy con total y porPlataforma', async () => {
    const lista = await registrarSnapshot(storage, HOY, {})
    expect(lista).toHaveLength(1)
    expect(lista[0]).toEqual({ fecha: '2026-07-14', totalUSD: 100, porPlataforma: { Broker: 100 } })
  })
  it('es idempotente en el mismo día', async () => {
    await registrarSnapshot(storage, HOY, {})
    const lista = await registrarSnapshot(storage, HOY, {})
    expect(lista).toHaveLength(1)
    expect(JSON.parse(readFileSync(path.join(dir, 'snapshots.json'), 'utf8'))).toHaveLength(1)
  })
  it('al día siguiente agrega otro', async () => {
    await registrarSnapshot(storage, HOY, {})
    const lista = await registrarSnapshot(storage, new Date('2026-07-15T12:00:00Z'), {})
    expect(lista).toHaveLength(2)
  })
  it('usa la fecha local, no UTC, para horas nocturnas (ART, UTC-3)', async () => {
    const nocheLocal = new Date(2026, 6, 14, 23, 0)
    const lista = await registrarSnapshot(storage, nocheLocal, {})
    expect(lista[0].fecha).toBe('2026-07-14')
  })
})

describe('ajustarSnapshotsPorAportes', () => {
  const base = (): Snapshot[] => [
    { fecha: '2026-08-09', totalUSD: 1000, porPlataforma: { DolarApp: 600, Nexo: 400 } },
    { fecha: '2026-08-10', totalUSD: 1010, porPlataforma: { DolarApp: 605, Nexo: 405 } },
    { fecha: '2026-08-12', totalUSD: 1020, porPlataforma: { DolarApp: 610, Nexo: 410 } },
  ]

  it('un depósito retroactivo suma su monto a los snapshots con fecha >= la del depósito', () => {
    const ops: Operacion[] = [{ fecha: '2026-08-10', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 1500 }]
    const { snapshots, ajustados } = ajustarSnapshotsPorAportes(base(), ops)
    expect(ajustados).toBe(2)
    expect(snapshots[0].totalUSD).toBe(1000) // anterior al depósito: intacto
    expect(snapshots[1].totalUSD).toBe(2510)
    expect(snapshots[1].porPlataforma.DolarApp).toBe(2105)
    expect(snapshots[2].totalUSD).toBe(2520)
    expect(snapshots[2].porPlataforma.DolarApp).toBe(2110)
    expect(snapshots[2].porPlataforma.Nexo).toBe(410) // otra plataforma: intacta
  })

  it('un retiro resta', () => {
    const ops: Operacion[] = [{ fecha: '2026-08-12', tipo: 'retiro', plataforma: 'Nexo', montoUSD: 100 }]
    const { snapshots, ajustados } = ajustarSnapshotsPorAportes(base(), ops)
    expect(ajustados).toBe(1)
    expect(snapshots[2].totalUSD).toBe(920)
    expect(snapshots[2].porPlataforma.Nexo).toBe(310)
  })

  it('compra/venta/rendimiento no ajustan nada (flujos internos)', () => {
    const ops: Operacion[] = [
      { fecha: '2026-08-09', tipo: 'compra', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 500 },
      { fecha: '2026-08-09', tipo: 'venta', plataforma: 'DolarApp', ticker: 'VOO', cantidad: 1, montoUSD: 500 },
      { fecha: '2026-08-09', tipo: 'rendimiento', plataforma: 'Nexo', montoUSD: 5 },
    ]
    const { snapshots, ajustados } = ajustarSnapshotsPorAportes(base(), ops)
    expect(ajustados).toBe(0)
    expect(snapshots).toEqual(base())
  })

  it('crea la clave de plataforma si el snapshot no la tenía', () => {
    const ops: Operacion[] = [{ fecha: '2026-08-12', tipo: 'deposito', plataforma: 'Mercury', montoUSD: 200 }]
    const { snapshots } = ajustarSnapshotsPorAportes(base(), ops)
    expect(snapshots[2].porPlataforma.Mercury).toBe(200)
    expect(snapshots[2].totalUSD).toBe(1220)
  })

  it('no muta la lista original', () => {
    const original = base()
    const copia = JSON.parse(JSON.stringify(original))
    ajustarSnapshotsPorAportes(original, [
      { fecha: '2026-08-09', tipo: 'deposito', plataforma: 'DolarApp', montoUSD: 50 },
    ])
    expect(original).toEqual(copia)
  })
})

describe('quitarPlataformaDeSnapshots', () => {
  it('resta el valor de la plataforma y borra su entrada en cada snapshot', () => {
    const lista: Snapshot[] = [
      { fecha: '2026-08-01', totalUSD: 1000, porPlataforma: { Mercury: 400, Nexo: 600 } },
      { fecha: '2026-08-02', totalUSD: 700, porPlataforma: { Nexo: 700 } },
    ]
    const { snapshots, ajustados } = quitarPlataformaDeSnapshots(lista, 'Mercury')
    expect(ajustados).toBe(1)
    expect(snapshots[0].totalUSD).toBe(600)
    expect(snapshots[0].porPlataforma).toEqual({ Nexo: 600 })
    expect(snapshots[1]).toEqual(lista[1])
    // No muta el original.
    expect(lista[0].totalUSD).toBe(1000)
  })
})

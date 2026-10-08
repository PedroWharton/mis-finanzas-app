import type { Operacion, Portfolio, Precios, Snapshot } from './tipos'
import { porTipo, valorPlataforma } from './calculos'

const MS_DIA = 86_400_000

function esAporte(op: Operacion): boolean {
  return op.tipo === 'deposito' || op.tipo === 'retiro'
}

// Los montos se persisten siempre positivos (validarMovimientos exige > 0);
// el signo del flujo lo da el tipo.
export function montoAporte(op: Operacion): number {
  return op.tipo === 'retiro' ? -op.montoUSD : op.montoUSD
}

export function aportesAcumuladosHasta(ops: Operacion[], fechaISO: string): number {
  return ops.reduce((acc, op) => {
    if (!esAporte(op)) return acc
    return op.fecha <= fechaISO ? acc + montoAporte(op) : acc
  }, 0)
}

// Flujos externos netos en (desde, hasta]: lo que entró o salió de la cartera
// entre dos fechas, para descontarlo de una variación de valor.
export function aportesNetosEntre(ops: Operacion[], desdeISO: string, hastaISO: string): number {
  return aportesAcumuladosHasta(ops, hastaISO) - aportesAcumuladosHasta(ops, desdeISO)
}

export function serieAportes(ops: Operacion[], fechasISO: string[]): number[] {
  return fechasISO.map(f => aportesAcumuladosHasta(ops, f))
}

function bonoDevengadoDelAnio(pf: Portfolio, anio: number, hoy: Date): number {
  const inicioAnio = new Date(Date.UTC(anio, 0, 1))
  const finAnio = new Date(Date.UTC(anio, 11, 31))
  const fin = hoy.getTime() < finAnio.getTime() ? hoy : finAnio
  if (fin.getTime() < inicioAnio.getTime()) return 0

  let total = 0
  for (const pl of pf.plataformas) {
    for (const p of pl.posiciones) {
      if (p.tipo !== 'bono') continue
      const ultimaRenovacion = new Date(p.ultimaRenovacion ?? p.fecha)
      const inicio = ultimaRenovacion.getTime() > inicioAnio.getTime() ? ultimaRenovacion : inicioAnio
      if (inicio.getTime() > fin.getTime()) continue
      const dias = Math.floor((fin.getTime() - inicio.getTime()) / MS_DIA)
      total += p.costoUSD * (p.tasaAnual ?? 0) * dias / 365
    }
  }
  return total
}

export function rentaDelAnio(
  ops: Operacion[],
  pf: Portfolio,
  anio: number,
  hoy: Date
): { dividendos: number; intereses: number; rendimientos: number; ventas: number; bonoDevengado: number; total: number } {
  // Una operación de renta pertenece a su anioRenta si está declarado
  // (ej.: cupón cobrado en enero que devengó el año anterior); si no, al año de su fecha.
  const opsDelAnio = ops.filter(
    op =>
      (op.anioRenta ?? Number(op.fecha.slice(0, 4))) === anio &&
      op.fecha <= hoy.toISOString().slice(0, 10)
  )

  const sumaPorTipo = (tipo: Operacion['tipo']) =>
    opsDelAnio.filter(op => op.tipo === tipo).reduce((acc, op) => acc + op.montoUSD, 0)

  const dividendos = sumaPorTipo('dividendo')
  const intereses = sumaPorTipo('interes')
  const rendimientos = sumaPorTipo('rendimiento')
  // Resultado realizado por ventas: el campo lo deriva aplicarMovimientos.
  // Puede ser negativo (pérdida realizada).
  const ventas = opsDelAnio
    .filter(op => op.tipo === 'venta')
    .reduce((acc, op) => acc + (op.gananciaRealizadaUSD ?? 0), 0)
  const bonoDevengado = bonoDevengadoDelAnio(pf, anio, hoy)

  return {
    dividendos,
    intereses,
    rendimientos,
    ventas,
    bonoDevengado,
    total: dividendos + intereses + rendimientos + ventas + bonoDevengado,
  }
}

export function gananciaRealizadaPorPlataforma(ops: Operacion[]): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const op of ops) {
    if (op.tipo !== 'venta' || op.gananciaRealizadaUSD === undefined) continue
    acc[op.plataforma] = Math.round(((acc[op.plataforma] ?? 0) + op.gananciaRealizadaUSD) * 100) / 100
  }
  return acc
}

export function modifiedDietz(
  snapshots: Snapshot[],
  ops: Operacion[]
): { retorno: number; desde: string } | null {
  if (snapshots.length < 2) return null

  const ordenados = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const primero = ordenados[0]
  const ultimo = ordenados[ordenados.length - 1]

  const inicio = new Date(primero.fecha).getTime()
  const fin = new Date(ultimo.fecha).getTime()
  const D = (fin - inicio) / MS_DIA

  const VI = primero.totalUSD
  const VF = ultimo.totalUSD

  const flujos = ops.filter(op => esAporte(op) && op.fecha > primero.fecha && op.fecha <= ultimo.fecha)

  let F = 0
  let sumaPonderada = 0
  for (const flujo of flujos) {
    const monto = montoAporte(flujo)
    F += monto
    const di = (new Date(flujo.fecha).getTime() - inicio) / MS_DIA
    const wi = D === 0 ? 0 : (D - di) / D
    sumaPonderada += monto * wi
  }

  const denominador = VI + sumaPonderada
  const retorno = denominador === 0 ? 0 : (VF - VI - F) / denominador

  return { retorno, desde: primero.fecha }
}

export function exposicion(
  pf: Portfolio,
  precios: Precios,
  hoy: Date
): { variable: number; fija: number; liquido: number; porMoneda: Record<string, number> } {
  const t = porTipo(pf, precios, hoy)
  const variable = t.acciones + t.cripto
  const fija = t.bono
  const liquido = t.efectivo

  const porMoneda: Record<string, number> = {}
  for (const pl of pf.plataformas) {
    const moneda = pl.moneda ?? 'USD'
    porMoneda[moneda] = (porMoneda[moneda] ?? 0) + valorPlataforma(pl, precios, hoy)
  }

  return { variable, fija, liquido, porMoneda }
}

import type { Plataforma, Portfolio, Posicion, Precios, TipoActivo } from './tipos'

const MS_DIA = 86_400_000

function valorBono(p: Posicion, hoy: Date): number {
  const desde = new Date(p.ultimaRenovacion ?? p.fecha)
  const dias = Math.max(0, Math.floor((hoy.getTime() - desde.getTime()) / MS_DIA))
  return p.costoUSD * (1 + (p.tasaAnual ?? 0) * dias / 365)
}

export function valorPosicion(p: Posicion, precios: Precios, hoy: Date): number {
  if (p.tipo === 'bono') return valorBono(p, hoy)
  const precio = precios[p.ticker]
  return precio === undefined ? p.costoUSD : p.cantidad * precio
}

export function valorPlataforma(pl: Plataforma, precios: Precios, hoy: Date): number {
  return pl.efectivoUSD + pl.posiciones.reduce((s, p) => s + valorPosicion(p, precios, hoy), 0)
}

export function totalUSD(pf: Portfolio, precios: Precios, hoy: Date): number {
  return pf.plataformas.reduce((s, pl) => s + valorPlataforma(pl, precios, hoy), 0)
}

export function porPlataforma(pf: Portfolio, precios: Precios, hoy: Date): Record<string, number> {
  return Object.fromEntries(pf.plataformas.map(pl => [pl.nombre, valorPlataforma(pl, precios, hoy)]))
}

export function porTipo(pf: Portfolio, precios: Precios, hoy: Date): Record<TipoActivo, number> {
  const acc: Record<TipoActivo, number> = { acciones: 0, cripto: 0, bono: 0, efectivo: 0 }
  for (const pl of pf.plataformas) {
    acc.efectivo += pl.efectivoUSD
    for (const p of pl.posiciones) acc[p.tipo] += valorPosicion(p, precios, hoy)
  }
  return acc
}

export interface Fila {
  plataforma: string
  nombre: string
  ticker: string
  tipo: TipoActivo
  fecha: string
  cantidad: number
  costoUSD: number
  precioCompra: number
  precioActual: number | null
  valorUSD: number
  gananciaUSD: number
  gananciaPct: number
}

export function filasTabla(pf: Portfolio, precios: Precios, hoy: Date): Fila[] {
  const filas: Fila[] = []
  for (const pl of pf.plataformas) {
    for (const p of pl.posiciones) {
      const valorUSD = valorPosicion(p, precios, hoy)
      const gananciaUSD = valorUSD - p.costoUSD
      filas.push({
        plataforma: pl.nombre,
        nombre: p.nombre,
        ticker: p.ticker,
        tipo: p.tipo,
        fecha: p.fecha,
        cantidad: p.cantidad,
        costoUSD: p.costoUSD,
        precioCompra: p.cantidad === 0 ? 0 : p.costoUSD / p.cantidad,
        precioActual: p.tipo === 'bono' ? null : precios[p.ticker] ?? null,
        valorUSD,
        gananciaUSD,
        gananciaPct: p.costoUSD === 0 ? 0 : (gananciaUSD / p.costoUSD) * 100,
      })
    }
  }
  return filas
}

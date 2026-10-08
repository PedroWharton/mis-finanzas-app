import { NextResponse } from 'next/server'
import { crearStorage } from '@/lib/storage'
import { obtenerPrecios } from '@/lib/precios'
import { filasTabla } from '@/lib/calculos'
import type { Portfolio } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

const BOM = '﻿'
const HEADER = [
  'Activo',
  'Ticker',
  'Plataforma',
  'Tipo',
  'FechaCompra',
  'Cantidad',
  'InvertidoUSD',
  'PrecioCompraUSD',
  'PrecioActualUSD',
  'VariacionDiaPct',
  'ValorUSD',
  'GananciaUSD',
  'GananciaPct',
].join(',')

function csvCampo(valor: string): string {
  if (valor.includes(',') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

function num(n: number | null, decimales = 2): string {
  if (n === null) return ''
  return (Math.round(n * 10 ** decimales) / 10 ** decimales).toString()
}

export async function GET() {
  const storage = crearStorage()
  let portfolio: Portfolio
  try {
    portfolio = ((await storage.leer('portfolio')) as Portfolio | null) ?? {
      monedaBase: 'USD',
      plataformas: [],
      operaciones: [],
    }
  } catch {
    // Error real de lectura (no "no existe"): no degradar a portfolio vacío,
    // que exportaría un CSV mintiendo "sin posiciones".
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
  const { precios, variaciones } = await obtenerPrecios()
  const hoy = new Date()
  const filas = filasTabla(portfolio, precios, hoy)

  const lineas = filas.map((f) => {
    const variacion = f.ticker ? variaciones[f.ticker] : undefined
    return [
      csvCampo(f.nombre),
      csvCampo(f.ticker),
      csvCampo(f.plataforma),
      csvCampo(f.tipo),
      f.fecha,
      num(f.cantidad, 8),
      num(f.costoUSD),
      num(f.precioCompra),
      num(f.precioActual),
      variacion === undefined ? '' : num(variacion),
      num(f.valorUSD),
      num(f.gananciaUSD),
      num(f.gananciaPct),
    ].join(',')
  })

  const csv = BOM + [HEADER, ...lineas].join('\r\n') + '\r\n'

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mis-finanzas-posiciones.csv"',
    },
  })
}

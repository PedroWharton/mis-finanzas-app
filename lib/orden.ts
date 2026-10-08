import type { Fila } from './calculos'

export type ColumnaOrden =
  | 'nombre'
  | 'plataforma'
  | 'fecha'
  | 'cantidad'
  | 'costoUSD'
  | 'precioCompra'
  | 'precioActual'
  | 'valorUSD'
  | 'gananciaUSD'
  | 'gananciaPct'

const COLUMNAS_STRING = new Set<ColumnaOrden>(['nombre', 'plataforma'])

function comparar(va: string | number, vb: string | number, col: ColumnaOrden): number {
  if (COLUMNAS_STRING.has(col)) {
    return (va as string).localeCompare(vb as string, 'es')
  }
  if (col === 'fecha') {
    return va < vb ? -1 : va > vb ? 1 : 0
  }
  return (va as number) - (vb as number)
}

export function ordenarFilas(filas: Fila[], col: ColumnaOrden, dir: 'asc' | 'desc'): Fila[] {
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const va = a.f[col]
      const vb = b.f[col]

      // Los valores null (precioActual sin dato) siempre quedan al final,
      // sin importar la dirección de orden.
      if (va === null && vb === null) return a.i - b.i
      if (va === null) return 1
      if (vb === null) return -1

      const base = comparar(va, vb, col)
      if (base !== 0) return dir === 'asc' ? base : -base
      return a.i - b.i
    })
    .map(({ f }) => f)
}

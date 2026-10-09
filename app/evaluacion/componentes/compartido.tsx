import type { TipoActivo } from '@/lib/tipos'

export interface PosicionInfo {
  clave: string
  nombre: string
  tipo: TipoActivo
  valorUSD: number
  plataformas: string[]
}

// Ancla de la tarjeta de un activo (posición o candidato): las alertas linkean acá.
export function idActivo(ticker: string): string {
  return `activo-${ticker.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

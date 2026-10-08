import type { TipoActivo } from '@/lib/tipos'

export interface PosicionInfo {
  clave: string
  nombre: string
  tipo: TipoActivo
  valorUSD: number
  plataformas: string[]
}

export type TipoActivo = 'acciones' | 'cripto' | 'bono' | 'efectivo'

export interface Posicion {
  ticker: string          // '' para efectivo y bono
  nombre: string
  tipo: TipoActivo
  cantidad: number        // unidades; para efectivo/bono: 1
  costoUSD: number        // total invertido en USD
  fecha: string           // ISO yyyy-mm-dd
  // solo tipo 'bono':
  tasaAnual?: number      // 0.10
  ultimaRenovacion?: string // ISO yyyy-mm-dd
}

export interface Plataforma {
  nombre: string
  efectivoUSD: number
  posiciones: Posicion[]
  moneda?: string // default 'USD'
}

export type TipoOperacion = 'deposito' | 'retiro' | 'compra' | 'venta' | 'dividendo' | 'interes' | 'rendimiento'

export interface Operacion {
  fecha: string // ISO yyyy-mm-dd
  tipo: TipoOperacion
  plataforma: string
  ticker?: string
  cantidad?: number
  montoUSD: number
  nota?: string
  // Año al que corresponde la renta si difiere del año de cobro
  // (ej.: cupón cobrado en enero que devengó el año anterior).
  anioRenta?: number
  // Solo ventas. Derivado al aplicar la operación (monto - costo removido);
  // nunca viene del cliente. Negativo = pérdida realizada.
  gananciaRealizadaUSD?: number
}

export interface Portfolio {
  monedaBase: 'USD'
  plataformas: Plataforma[]
  operaciones: Operacion[]
}

export type Precios = Record<string, number> // ticker -> precio USD

export interface Snapshot {
  fecha: string // yyyy-mm-dd
  totalUSD: number
  porPlataforma: Record<string, number>
}

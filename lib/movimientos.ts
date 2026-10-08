import type { Operacion, TipoOperacion, Plataforma, Portfolio } from './tipos'
import { TICKERS_CRIPTO } from './precios'

const TIPOS: TipoOperacion[] = ['deposito', 'retiro', 'compra', 'venta', 'dividendo', 'interes', 'rendimiento']
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAX_OPERACIONES = 50

export type ResultadoValidacion = { ok: true; operaciones: Operacion[] } | { ok: false; error: string }

// Reconstruye cada operación solo con campos validados (patrón de
// validarResultado en lib/recomendaciones.ts): lo que no se conoce o no
// corresponde al tipo se descarta en vez de persistirse a ciegas.
export function validarMovimientos(payload: unknown): ResultadoValidacion {
  if (typeof payload !== 'object' || payload === null) return { ok: false, error: 'el payload debe ser un objeto { operaciones: [...] }' }
  const lista = (payload as { operaciones?: unknown }).operaciones
  if (!Array.isArray(lista) || lista.length === 0) return { ok: false, error: 'operaciones debe ser una lista no vacía' }
  if (lista.length > MAX_OPERACIONES) return { ok: false, error: `máximo ${MAX_OPERACIONES} operaciones por request` }

  const out: Operacion[] = []
  for (let i = 0; i < lista.length; i++) {
    const raw = lista[i]
    const falla = (campo: string, det: string) => ({ ok: false as const, error: `operaciones[${i}].${campo}: ${det}` })
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `operaciones[${i}]: debe ser un objeto` }
    const o = raw as Record<string, unknown>

    if (typeof o.fecha !== 'string' || !RE_FECHA.test(o.fecha)) return falla('fecha', 'se espera YYYY-MM-DD')
    if (typeof o.tipo !== 'string' || !TIPOS.includes(o.tipo as TipoOperacion)) return falla('tipo', `debe ser uno de: ${TIPOS.join(', ')}`)
    const tipo = o.tipo as TipoOperacion
    if (typeof o.plataforma !== 'string' || o.plataforma.trim() === '') return falla('plataforma', 'string no vacío')
    if (o.plataforma.trim().length > 60) return falla('plataforma', 'hasta 60 caracteres')
    const montoUSD = typeof o.montoUSD === 'string' ? Number(o.montoUSD) : o.montoUSD
    if (typeof montoUSD !== 'number' || !Number.isFinite(montoUSD) || montoUSD <= 0) return falla('montoUSD', 'número > 0')

    let ticker: string | undefined
    if (o.ticker !== undefined && o.ticker !== '' && o.ticker !== null) {
      if (typeof o.ticker !== 'string' || o.ticker.length > 12) return falla('ticker', 'string de hasta 12 caracteres')
      ticker = o.ticker.toUpperCase()
    }
    let cantidad: number | undefined
    if (o.cantidad !== undefined && o.cantidad !== null) {
      const c = typeof o.cantidad === 'string' ? Number(o.cantidad) : o.cantidad
      if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return falla('cantidad', 'número > 0')
      cantidad = c
    }

    if (tipo === 'compra' || tipo === 'venta') {
      if (!ticker) return falla('ticker', 'requerido para compra/venta')
      if (cantidad === undefined) return falla('cantidad', 'requerida para compra/venta')
    }
    // deposito/retiro/dividendo son movimientos de cash puros: cantidad no aplica.
    if (tipo === 'deposito' || tipo === 'retiro' || tipo === 'dividendo') cantidad = undefined
    // Renta in-kind (Nexo): cantidad acredita unidades a la posición del ticker.
    if ((tipo === 'interes' || tipo === 'rendimiento') && cantidad !== undefined && !ticker)
      return falla('ticker', 'requerido cuando hay cantidad (renta in-kind)')

    const op: Operacion = { fecha: o.fecha, tipo, plataforma: o.plataforma.trim(), montoUSD }
    if (ticker && tipo !== 'deposito' && tipo !== 'retiro') op.ticker = ticker
    if (cantidad !== undefined) op.cantidad = cantidad
    if (typeof o.nota === 'string' && o.nota.trim() !== '') op.nota = o.nota.trim()
    out.push(op)
  }
  return { ok: true, operaciones: out }
}

export function esDuplicada(a: Operacion, b: Operacion): boolean {
  if (a.fecha !== b.fecha || a.tipo !== b.tipo || a.plataforma !== b.plataforma) return false
  if ((a.ticker ?? '') !== (b.ticker ?? '')) return false
  if (Math.abs(a.montoUSD - b.montoUSD) > 0.01) return false
  if (a.cantidad !== undefined && b.cantidad !== undefined && Math.abs(a.cantidad - b.cantidad) > 1e-9) return false
  return true
}

export function descripcion(op: Operacion): string {
  const centro = [op.tipo, op.ticker, op.cantidad !== undefined ? String(op.cantidad) : undefined].filter(Boolean).join(' ')
  return `${op.fecha} ${centro} por $${op.montoUSD} en ${op.plataforma}`
}

const TOL_CANTIDAD = 1e-6
const redondear2 = (n: number) => Math.round(n * 100) / 100

export type ResultadoAplicacion =
  | { ok: true; portfolio: Portfolio; resumen: string[]; advertencias: string[] }
  | { ok: false; codigo: 'duplicado'; duplicados: string[] }
  | { ok: false; codigo: 'invalido'; error: string }

// Aplica un batch completo o nada: la primera operación inválida aborta sin
// efectos (se trabaja sobre un clon). Los duplicados se chequean contra TODO
// el historial, no solo contra lo reciente.
export function aplicarMovimientos(portfolio: Portfolio, nuevas: Operacion[]): ResultadoAplicacion {
  // Duplicado contra el historial O contra una operación anterior del mismo
  // batch (un OCR puede leer dos veces la misma fila del screenshot).
  const duplicados = nuevas.filter(
    (n, i) => portfolio.operaciones.some((e) => esDuplicada(n, e)) || nuevas.slice(0, i).some((e) => esDuplicada(n, e))
  )
  if (duplicados.length > 0) return { ok: false, codigo: 'duplicado', duplicados: duplicados.map(descripcion) }

  const pf: Portfolio = JSON.parse(JSON.stringify(portfolio))
  const resumen: string[] = []
  const advertencias: string[] = []
  const ordenadas = [...nuevas].sort((a, b) => a.fecha.localeCompare(b.fecha))

  for (const operacion of ordenadas) {
    let pl = pf.plataformas.find((p) => p.nombre === operacion.plataforma)
    if (!pl) {
      if (operacion.tipo !== 'deposito')
        return { ok: false, codigo: 'invalido', error: `la plataforma "${operacion.plataforma}" no existe (solo un deposito puede crearla)` }
      pl = { nombre: operacion.plataforma, efectivoUSD: 0, posiciones: [] } satisfies Plataforma
      pf.plataformas.push(pl)
    }
    const error = aplicarUna(pl, operacion, advertencias)
    if (error) return { ok: false, codigo: 'invalido', error }
    resumen.push(descripcion(operacion))
  }

  pf.operaciones = [...pf.operaciones, ...ordenadas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { ok: true, portfolio: pf, resumen, advertencias }
}

export type ResultadoEliminacion =
  | { ok: true; portfolio: Portfolio; eliminada: Operacion }
  | { ok: false; error: string }

/**
 * Elimina una operación del historial deshaciendo su efecto exacto sobre la
 * plataforma (inverso de aplicarUna). Si deshacerla dejaría un estado
 * imposible (efectivo negativo, más unidades vendidas que las que habría),
 * falla sin efectos: ese error es la señal de que la eliminación está mal.
 */
export function eliminarOperacion(portfolio: Portfolio, objetivo: Operacion): ResultadoEliminacion {
  const idx = portfolio.operaciones.findIndex((e) => esDuplicada(objetivo, e))
  if (idx === -1) return { ok: false, error: 'no se encontró la operación en el historial' }

  const pf: Portfolio = JSON.parse(JSON.stringify(portfolio))
  const original = pf.operaciones[idx]
  const pl = pf.plataformas.find((p) => p.nombre === original.plataforma)
  if (!pl) return { ok: false, error: `la plataforma "${original.plataforma}" no existe` }

  const error = revertirUna(pl, original)
  if (error) return { ok: false, error }

  pf.operaciones.splice(idx, 1)
  return { ok: true, portfolio: pf, eliminada: original }
}

// Inverso exacto de aplicarUna. Muta la plataforma (ya clonada).
function revertirUna(pl: Plataforma, op: Operacion): string | null {
  const sinEfectivo = (monto: number) =>
    `deshacer esta operación deja el efectivo de ${pl.nombre} en negativo ($${redondear2(pl.efectivoUSD - monto).toFixed(2)}): probablemente ese dinero ya se usó`
  switch (op.tipo) {
    case 'deposito':
    case 'dividendo': {
      if (pl.efectivoUSD - op.montoUSD < -0.005) return sinEfectivo(op.montoUSD)
      pl.efectivoUSD = redondear2(pl.efectivoUSD - op.montoUSD)
      return null
    }
    case 'retiro':
      pl.efectivoUSD = redondear2(pl.efectivoUSD + op.montoUSD)
      return null
    case 'interes':
    case 'rendimiento': {
      if (op.ticker && op.cantidad !== undefined) {
        const pos = pl.posiciones.find((p) => p.ticker === op.ticker)
        if (!pos || pos.cantidad + TOL_CANTIDAD < op.cantidad)
          return `no hay ${op.cantidad} ${op.ticker} en ${pl.nombre} para deshacer la renta in-kind`
        pos.cantidad -= op.cantidad
        if (pos.cantidad <= TOL_CANTIDAD && Math.abs(pos.costoUSD) <= 0.005) {
          pl.posiciones = pl.posiciones.filter((p) => p !== pos)
        }
        return null
      }
      if (pl.efectivoUSD - op.montoUSD < -0.005) return sinEfectivo(op.montoUSD)
      pl.efectivoUSD = redondear2(pl.efectivoUSD - op.montoUSD)
      return null
    }
    case 'compra': {
      const pos = pl.posiciones.find((p) => p.ticker === op.ticker)
      if (!pos || pos.cantidad + TOL_CANTIDAD < op.cantidad!)
        return `no hay ${op.cantidad} ${op.ticker} en ${pl.nombre} para deshacer la compra (¿ya se vendieron?)`
      pl.efectivoUSD = redondear2(pl.efectivoUSD + op.montoUSD)
      pos.cantidad -= op.cantidad!
      pos.costoUSD = redondear2(pos.costoUSD - op.montoUSD)
      if (pos.cantidad <= TOL_CANTIDAD) pl.posiciones = pl.posiciones.filter((p) => p !== pos)
      return null
    }
    case 'venta': {
      if (pl.efectivoUSD - op.montoUSD < -0.005) return sinEfectivo(op.montoUSD)
      pl.efectivoUSD = redondear2(pl.efectivoUSD - op.montoUSD)
      // Restaurar la posición con el costo que la venta removió.
      const costoRemovido = redondear2(op.montoUSD - (op.gananciaRealizadaUSD ?? 0))
      let pos = pl.posiciones.find((p) => p.ticker === op.ticker)
      if (!pos) {
        pos = {
          ticker: op.ticker!,
          nombre: op.ticker!,
          tipo: TICKERS_CRIPTO.has(op.ticker!) ? 'cripto' : 'acciones',
          cantidad: 0,
          costoUSD: 0,
          fecha: op.fecha,
        }
        pl.posiciones.push(pos)
      }
      pos.cantidad += op.cantidad!
      pos.costoUSD = redondear2(pos.costoUSD + costoRemovido)
      return null
    }
  }
}

export type ResultadoBajaPlataforma =
  | { ok: true; portfolio: Portfolio; operacionesEliminadas: number }
  | { ok: false; error: string }

/**
 * Elimina una plataforma completa: la entrada en `plataformas` Y todas sus
 * operaciones del historial, como si nunca hubiera existido. La limpieza de
 * snapshots (restar su valor histórico) la hace el route con
 * quitarPlataformaDeSnapshots — acá solo el portfolio.
 */
export function eliminarPlataforma(portfolio: Portfolio, nombre: string): ResultadoBajaPlataforma {
  if (!portfolio.plataformas.some((p) => p.nombre === nombre)) {
    return { ok: false, error: `la plataforma "${nombre}" no existe` }
  }
  const pf: Portfolio = JSON.parse(JSON.stringify(portfolio))
  const antes = pf.operaciones.length
  pf.plataformas = pf.plataformas.filter((p) => p.nombre !== nombre)
  pf.operaciones = pf.operaciones.filter((op) => op.plataforma !== nombre)
  return { ok: true, portfolio: pf, operacionesEliminadas: antes - pf.operaciones.length }
}

// Muta la plataforma (ya clonada). Devuelve el mensaje de error o null.
function aplicarUna(pl: Plataforma, op: Operacion, advertencias: string[]): string | null {
  switch (op.tipo) {
    case 'deposito':
    case 'dividendo':
      pl.efectivoUSD = redondear2(pl.efectivoUSD + op.montoUSD)
      return null
    case 'retiro': {
      const resto = pl.efectivoUSD - op.montoUSD
      if (resto < -0.005) return `el retiro de $${op.montoUSD} deja el efectivo de ${pl.nombre} en negativo`
      pl.efectivoUSD = redondear2(resto)
      return null
    }
    case 'interes':
    case 'rendimiento': {
      if (op.ticker && op.cantidad !== undefined) {
        const pos = pl.posiciones.find((p) => p.ticker === op.ticker)
        if (!pos) return `renta in-kind de ${op.ticker} sin posición en ${pl.nombre}`
        pos.cantidad += op.cantidad
        return null
      }
      pl.efectivoUSD = redondear2(pl.efectivoUSD + op.montoUSD)
      return null
    }
    case 'compra': {
      pl.efectivoUSD = redondear2(pl.efectivoUSD - op.montoUSD)
      if (pl.efectivoUSD < -0.005)
        advertencias.push(`el efectivo de ${pl.nombre} quedó negativo ($${pl.efectivoUSD.toFixed(2)}): puede faltar el depósito que fondeó la compra`)
      let pos = pl.posiciones.find((p) => p.ticker === op.ticker)
      if (!pos) {
        pos = {
          ticker: op.ticker!,
          nombre: op.ticker!,
          tipo: TICKERS_CRIPTO.has(op.ticker!) ? 'cripto' : 'acciones',
          cantidad: 0,
          costoUSD: 0,
          fecha: op.fecha,
        }
        pl.posiciones.push(pos)
      }
      pos.cantidad += op.cantidad!
      pos.costoUSD = redondear2(pos.costoUSD + op.montoUSD)
      pos.fecha = op.fecha
      return null
    }
    case 'venta': {
      const pos = pl.posiciones.find((p) => p.ticker === op.ticker)
      if (!pos) return `venta de ${op.ticker} sin posición en ${pl.nombre}`
      if (op.cantidad! > pos.cantidad + TOL_CANTIDAD)
        return `venta de ${op.cantidad} ${op.ticker} pero la posición tiene ${pos.cantidad}`
      pl.efectivoUSD = redondear2(pl.efectivoUSD + op.montoUSD)
      if (op.cantidad! >= pos.cantidad - TOL_CANTIDAD) {
        op.gananciaRealizadaUSD = redondear2(op.montoUSD - pos.costoUSD)
        pl.posiciones = pl.posiciones.filter((p) => p !== pos)
      } else {
        const restante = pos.cantidad - op.cantidad!
        const costoRestante = redondear2(pos.costoUSD * (restante / pos.cantidad))
        op.gananciaRealizadaUSD = redondear2(op.montoUSD - (pos.costoUSD - costoRestante))
        pos.costoUSD = costoRestante
        pos.cantidad = restante
      }
      return null
    }
  }
}

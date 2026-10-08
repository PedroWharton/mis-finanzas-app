import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crearStorage } from '@/lib/storage'
import type { Registro } from '@/lib/registroPredicciones'

const MAX_REGISTROS = 5000

export const dynamic = 'force-dynamic'

// typeof x === 'object' no alcanza: un array también lo es.
function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function esFinito(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function esResultado(x: unknown): boolean {
  if (x === null) return true
  return (
    esObjeto(x) &&
    typeof x.fecha === 'string' &&
    esFinito(x.precioReal) &&
    typeof x.dentroBanda === 'boolean' &&
    esFinito(x.errorPct)
  )
}

function esRegistro(x: unknown): boolean {
  return (
    esObjeto(x) &&
    typeof x.fechaOrigen === 'string' &&
    typeof x.ticker === 'string' &&
    (x.tipo === 'acciones' || x.tipo === 'cripto') &&
    (x.horizonte === '1m' || x.horizonte === '3m') &&
    esFinito(x.precioOrigen) &&
    esFinito(x.p10) &&
    esFinito(x.p50) &&
    esFinito(x.p90) &&
    typeof x.fechaVencimiento === 'string' &&
    esResultado(x.resultado)
  )
}

export async function GET() {
  try {
    return NextResponse.json((await crearStorage().leer('predicciones')) ?? null)
  } catch {
    // Error real de lectura (no "no existe"): NO se responde 200 null, porque
    // el cliente lo tomaría como "primera visita" y el POST siguiente
    // pisaría el historial existente.
    return NextResponse.json({ error: 'no se pudo leer el registro' }, { status: 503 })
  }
}

// Reconstruye cada registro con SOLO los campos validados: el spread de lo
// que mande el cliente perpetuaría propiedades desconocidas en el doc persistido.
function sanitizarRegistro(x: Record<string, unknown>): Registro {
  const resultado =
    x.resultado === null
      ? null
      : {
          fecha: (x.resultado as Record<string, unknown>).fecha as string,
          precioReal: (x.resultado as Record<string, unknown>).precioReal as number,
          dentroBanda: (x.resultado as Record<string, unknown>).dentroBanda as boolean,
          errorPct: (x.resultado as Record<string, unknown>).errorPct as number,
        }
  return {
    fechaOrigen: x.fechaOrigen as string,
    ticker: x.ticker as string,
    tipo: x.tipo as Registro['tipo'],
    horizonte: x.horizonte as Registro['horizonte'],
    precioOrigen: x.precioOrigen as number,
    p10: x.p10 as number,
    p50: x.p50 as number,
    p90: x.p90 as number,
    fechaVencimiento: x.fechaVencimiento as string,
    resultado,
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!esObjeto(body) || !Array.isArray(body.registros) || !body.registros.every(esRegistro)) {
    return NextResponse.json({ error: 'se espera { registros: Registro[] }' }, { status: 400 })
  }
  if (body.registros.length > MAX_REGISTROS) {
    return NextResponse.json({ error: `se esperan a lo sumo ${MAX_REGISTROS} registros` }, { status: 400 })
  }
  const registros = (body.registros as Record<string, unknown>[]).map(sanitizarRegistro)
  await crearStorage().escribir('predicciones', { registros })
  return NextResponse.json({ ok: true })
}

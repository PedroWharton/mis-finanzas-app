import { NextResponse } from 'next/server'
import { registrarSnapshot } from '@/lib/snapshots'
import { obtenerPrecios } from '@/lib/precios'
import { crearStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function POST() {
  const storage = crearStorage()
  try {
    const { precios } = await obtenerPrecios(fetch, storage)
    const snapshots = await registrarSnapshot(storage, new Date(), precios)
    return NextResponse.json({ snapshots })
  } catch {
    // registrarSnapshot lee 'portfolio' sin degradar (un error real de
    // lectura no debe registrar un snapshot en cero ni pisar 'snapshots').
    return NextResponse.json({ error: 'no se pudo leer el portfolio' }, { status: 503 })
  }
}

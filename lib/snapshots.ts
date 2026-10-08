import type { Operacion, Portfolio, Precios, Snapshot } from './tipos'
import type { Storage } from './storage'
import { totalUSD, porPlataforma } from './calculos'
import { montoAporte } from './analitica'

const redondear2 = (n: number) => Math.round(n * 100) / 100

// Los snapshots se calculan con el portfolio del momento en que se abre el
// panel; una operación cargada tarde (fecha pasada) los deja subestimados.
// Para depósitos/retiros el ajuste es exacto: el cash no cambia de valor.
export function ajustarSnapshotsPorAportes(
  snapshots: Snapshot[],
  ops: Operacion[]
): { snapshots: Snapshot[]; ajustados: number } {
  const aportes = ops.filter(op => op.tipo === 'deposito' || op.tipo === 'retiro')
  const lista: Snapshot[] = JSON.parse(JSON.stringify(snapshots))
  const tocados = new Set<string>()
  for (const s of lista) {
    for (const op of aportes) {
      if (op.fecha > s.fecha) continue
      const monto = montoAporte(op)
      s.totalUSD = redondear2(s.totalUSD + monto)
      s.porPlataforma[op.plataforma] = redondear2((s.porPlataforma[op.plataforma] ?? 0) + monto)
      tocados.add(s.fecha)
    }
  }
  return { snapshots: lista, ajustados: tocados.size }
}

// Reescribe el historial como si la plataforma nunca hubiera existido: le
// resta su valor a cada snapshot y borra su entrada. Sin esto, eliminar una
// plataforma haría aparecer una "pérdida" falsa contra los snapshots viejos.
export function quitarPlataformaDeSnapshots(
  snapshots: Snapshot[],
  nombre: string
): { snapshots: Snapshot[]; ajustados: number } {
  const lista: Snapshot[] = JSON.parse(JSON.stringify(snapshots))
  let ajustados = 0
  for (const s of lista) {
    if (s.porPlataforma[nombre] === undefined) continue
    s.totalUSD = redondear2(s.totalUSD - s.porPlataforma[nombre])
    delete s.porPlataforma[nombre]
    ajustados++
  }
  return { snapshots: lista, ajustados }
}

export async function registrarSnapshot(storage: Storage, hoy: Date, precios: Precios): Promise<Snapshot[]> {
  const pf = (await storage.leer('portfolio')) as Portfolio
  const lista = ((await storage.leer('snapshots')) as Snapshot[] | null) ?? []
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  if (!lista.some(s => s.fecha === fecha)) {
    lista.push({
      fecha,
      totalUSD: Math.round(totalUSD(pf, precios, hoy) * 100) / 100,
      porPlataforma: Object.fromEntries(
        Object.entries(porPlataforma(pf, precios, hoy)).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
    })
    await storage.escribir('snapshots', lista)
  }
  return lista
}

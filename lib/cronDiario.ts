import type { Storage } from './storage'
import type { Portfolio } from './tipos'
import type { Veredicto } from './senales'
import { obtenerPrecios } from './precios'
import { registrarSnapshot } from './snapshots'
import { obtenerHistoricos, tickersDelPortfolio } from './historicos'
import { predecir } from './predictor'
import { actualizarRegistros, type PrediccionesDoc, type Vigente } from './registroPredicciones'
import { armarContexto } from './contextoAgente'
import { enviarATodos, enviarWebPush, type PushSubsDoc, type Suscripcion } from './push'
import { universoEfectivo, type WatchlistDoc } from './watchlist'

export interface EvaluacionesDoc {
  fecha: string
  veredictos: Record<string, Veredicto>
}

export interface CambioVeredicto {
  ticker: string
  antes: Veredicto
  ahora: Veredicto
}

export interface ResultadoCron {
  snapshot: string | null // fecha registrada (o ya existente); null si falló
  prediccionesActualizadas: boolean
  veredictosGuardados: number
  cambios: CambioVeredicto[]
  push: { enviados: number; podadas: number } | null
  advertencias: string[]
}

type EnviarPush = (s: Suscripcion, payload: string) => Promise<void>

/**
 * Corrida diaria del lado del servidor: lo que antes solo pasaba cuando el
 * usuario abría la app (snapshot del patrimonio, resolución de predicciones
 * vencidas, registro de veredictos) ahora corre solo. Además detecta cambios
 * de veredicto contra el registro anterior y los avisa por push.
 *
 * Cada paso degrada por separado: un fallo se anota en `advertencias` y no
 * aborta los demás. La regla que NO se relaja es la de escritura sobre
 * lectura fallida: si un doc no se pudo leer (error real, no "no existe"),
 * ese doc no se escribe — pisar historial es peor que saltear un día.
 */
export async function correrCronDiario(
  storage: Storage,
  fetchFn: typeof fetch = fetch,
  enviarPush: EnviarPush = enviarWebPush
): Promise<ResultadoCron> {
  const advertencias: string[] = []
  const hoy = new Date()

  // 1) Precios frescos (persiste last-prices como efecto).
  const precios = await obtenerPrecios(fetchFn, storage)
  if (precios.desactualizado) advertencias.push('precios desactualizados: se usó el último dato persistido')

  // 2) Snapshot del día (idempotente: si ya existe la fecha, no duplica).
  let snapshot: string | null = null
  try {
    const lista = await registrarSnapshot(storage, hoy, precios.precios)
    snapshot = lista[lista.length - 1]?.fecha ?? null
  } catch {
    advertencias.push('no se pudo registrar el snapshot (portfolio ilegible)')
  }

  // 3) Históricos frescos del universo cartera ∪ watchlist. Si vienen
  // desactualizados, predicciones y veredictos se saltean (misma regla que
  // las páginas: registrar sobre datos viejos genera historial mentiroso).
  let prediccionesActualizadas = false
  let veredictosGuardados = 0
  let cambios: CambioVeredicto[] = []
  let push: ResultadoCron['push'] = null
  try {
    const pf = ((await storage.leer('portfolio')) as Portfolio | null) ?? {
      monedaBase: 'USD' as const,
      plataformas: [],
      operaciones: [],
    }
    const rawWatchlist = (await storage.leer('watchlist')) as Partial<WatchlistDoc> | null
    const watchlist = universoEfectivo(
      { agregados: rawWatchlist?.agregados ?? [], ocultos: rawWatchlist?.ocultos ?? [] },
      tickersDelPortfolio(pf).map((t) => t.ticker)
    )
    const historicos = await obtenerHistoricos(pf, watchlist, fetchFn, storage)

    if (historicos.desactualizado) {
      advertencias.push('históricos desactualizados: no se registran predicciones ni veredictos')
    } else {
      // 3a) Predicciones: resolver vencidas + altas del día (mismo cálculo
      // que /predicciones, pero sin depender de una visita).
      try {
        const docPrevio = ((await storage.leer('predicciones')) as PrediccionesDoc | null) ?? { registros: [] }
        const universo = [
          ...tickersDelPortfolio(pf),
          ...watchlist.filter((w) => !tickersDelPortfolio(pf).some((t) => t.ticker === w.ticker)),
        ]
        const vigentes: Vigente[] = []
        for (const u of universo) {
          const serie = historicos.series[u.ticker]
          const prediccion = serie ? predecir(serie.precios, u.tipo) : null
          if (serie && prediccion) vigentes.push({ ticker: u.ticker, tipo: u.tipo, serie, prediccion })
        }
        const { doc, cambio } = actualizarRegistros(docPrevio, vigentes)
        if (cambio) {
          await storage.escribir('predicciones', doc)
          prediccionesActualizadas = true
        }
      } catch {
        advertencias.push('no se pudo leer/escribir el registro de predicciones')
      }

      // 3b) Veredictos frescos (posiciones + candidatos, vía armarContexto:
      // exactamente la misma cadena de señales que ve el usuario) y cambios
      // contra el registro anterior.
      try {
        const ctx = await armarContexto(storage, fetchFn)
        const frescos: Record<string, Veredicto> = {}
        for (const p of ctx.posiciones) if (p.evaluacion) frescos[p.ticker] = p.evaluacion.veredicto
        for (const c of ctx.watchlist) if (c.evaluacion) frescos[c.ticker] = c.evaluacion.veredicto

        if (Object.keys(frescos).length > 0) {
          let previoLegible = true
          let previo: EvaluacionesDoc | null = null
          try {
            const e = (await storage.leer('evaluaciones')) as EvaluacionesDoc | null
            if (e && typeof e.fecha === 'string' && e.veredictos && typeof e.veredictos === 'object') previo = e
          } catch {
            previoLegible = false
          }
          if (previoLegible) {
            cambios = Object.entries(frescos)
              .filter(([t, v]) => previo?.veredictos[t] && previo.veredictos[t] !== v)
              .map(([ticker, ahora]) => ({ ticker, antes: previo!.veredictos[ticker], ahora }))
            const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
            await storage.escribir('evaluaciones', { fecha, veredictos: frescos })
            veredictosGuardados = Object.keys(frescos).length
          } else {
            advertencias.push('no se pudo leer el registro de veredictos: no se sobreescribe')
          }
        }
      } catch {
        advertencias.push('no se pudieron calcular los veredictos del día')
      }

      // 3c) Push de cambios de señal. Best-effort, mismo patrón de poda de
      // suscripciones vencidas que /api/agente/resultado.
      if (cambios.length > 0) {
        try {
          const subsDoc = (await storage.leer('push-subs')) as PushSubsDoc | null
          const subs = subsDoc?.subs ?? []
          if (subs.length > 0) {
            const cuerpo = cambios.map((c) => `${c.ticker}: ${c.antes} → ${c.ahora}`).join(' · ')
            const payload = JSON.stringify({ title: 'Cambio de señal', body: cuerpo })
            const r = await enviarATodos(subs, payload, enviarPush)
            if (r.vencidas.length > 0) {
              const vivas = subs.filter((s) => !r.vencidas.some((x) => x.endpoint === s.endpoint))
              await storage.escribir('push-subs', { subs: vivas })
            }
            push = { enviados: r.enviados, podadas: r.vencidas.length }
          }
        } catch {
          advertencias.push('no se pudieron enviar los avisos de cambio de señal')
        }
      }
    }
  } catch {
    advertencias.push('no se pudo leer el portfolio/watchlist: predicciones y veredictos salteados')
  }

  return { snapshot, prediccionesActualizadas, veredictosGuardados, cambios, push, advertencias }
}

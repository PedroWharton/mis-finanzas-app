'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import type { Portfolio } from '@/lib/tipos'
import type { Historicos } from '@/lib/historicos'
import type { EntradaWatchlist } from '@/lib/watchlist'
import { MIN_DIAS_PREDICCION, predecir, type TipoSerie } from '@/lib/predictor'
import { evaluarPredictor } from '@/lib/evaluacionPredictor'
import { actualizarRegistros, type PrediccionesDoc, type Vigente } from '@/lib/registroPredicciones'
import { fechaLarga, parseISO } from '@/app/componentes/ui/formatters'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { claseBotonSecundario } from '@/app/componentes/ui/campos'
import { TablaEvaluacion, type EvaluacionCompleta } from './componentes/TablaEvaluacion'
import { Vigentes, type FilaVigente } from './componentes/Vigentes'
import { Historial } from './componentes/Historial'

const DISCLAIMER =
  'Modelo estadístico simple (momentum encogido + volatilidad EWMA) sobre precios pasados: no sabe de noticias, resultados, tasas ni cambios de régimen. Las bandas p10–p90 describen incertidumbre estadística — el 80% central si el modelo fuera correcto —, no garantías. La evaluación walk-forward usa ventanas superpuestas y n chico: el veredicto "gana / no gana" es orientativo, no un test de significancia. Nada de esto es una recomendación de inversión.'

interface Datos {
  pf: Portfolio | null
  historicos: Historicos
  efectivos: EntradaWatchlist[]
  docPrevio: PrediccionesDoc
  // false si el GET de /api/predicciones respondió pero no se pudo parsear:
  // en ese caso NO se postea (un POST sobre un doc que no pudimos leer
  // sobreescribiría el historial persistido). El caso `null` (primera visita)
  // sí habilita el POST con registros vacíos.
  docPrevioOk: boolean
}

export default function Predicciones() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [fallo, setFallo] = useState(false)
  const posteado = useRef(false)

  useEffect(() => {
    ;(async () => {
      // Fetch en paralelo y UN SOLO commit de estado al final: sin renders
      // intermedios con datos a medias (lección del flash de T7).
      const [rData, rHist, rWatch, rPred] = await Promise.all([
        fetch('/api/data'),
        fetch('/api/historicos'),
        fetch('/api/watchlist'),
        fetch('/api/predicciones'),
      ])
      const data = (await rData.json()) as { portfolio: Portfolio | null }
      const historicos = (await rHist.json()) as Historicos
      let efectivos: EntradaWatchlist[] = []
      try {
        const w = (await rWatch.json()) as { efectivos?: EntradaWatchlist[] } | null
        efectivos = w?.efectivos ?? []
      } catch {
        console.warn('predicciones: no se pudo leer la watchlist')
      }
      // GET null (primera visita) ⇒ registros vacíos.
      let docPrevio: PrediccionesDoc = { registros: [] }
      // GET no-ok (p. ej. 503 por error real de lectura) ⇒ NO es "primera
      // visita": docPrevioOk queda en false para no habilitar el POST y
      // arriesgar pisar el historial existente.
      let docPrevioOk = rPred.ok
      try {
        const d = (await rPred.json()) as PrediccionesDoc | null
        if (d && Array.isArray(d.registros)) docPrevio = d
      } catch {
        docPrevioOk = false
        console.warn('predicciones: no se pudo leer el registro previo')
      }
      setDatos({ pf: data.portfolio ?? null, historicos, efectivos, docPrevio, docPrevioOk })
    })().catch(() => {
      console.warn('predicciones: falló la carga de datos')
      setFallo(true)
    })
  }, [])

  const calculo = useMemo(() => {
    if (!datos || !datos.pf) return null
    const { pf, historicos, efectivos } = datos

    // Universo = cartera (acciones/cripto) ∪ watchlist efectiva. El tipo y el
    // badge "posición" salen del portfolio: /api/historicos devuelve series
    // sin tipo y `efectivos` excluye los tickers de cartera.
    const enCartera = new Map<string, TipoSerie>()
    for (const pl of pf.plataformas) {
      for (const p of pl.posiciones) {
        if ((p.tipo === 'acciones' || p.tipo === 'cripto') && p.ticker && !enCartera.has(p.ticker)) {
          enCartera.set(p.ticker, p.tipo)
        }
      }
    }
    const universo: { ticker: string; tipo: TipoSerie; posicion: boolean }[] = [
      ...[...enCartera].map(([ticker, tipo]) => ({ ticker, tipo, posicion: true })),
      ...efectivos.filter((e) => !enCartera.has(e.ticker)).map((e) => ({ ticker: e.ticker, tipo: e.tipo, posicion: false })),
    ]

    const filas: FilaVigente[] = []
    const vigentes: Vigente[] = []
    const evaluaciones: EvaluacionCompleta[] = []
    const insuficientes: string[] = []
    const excluidos: string[] = []
    for (const u of universo) {
      const serie = historicos.series[u.ticker]
      const prediccion = serie ? predecir(serie.precios, u.tipo) : null
      if (!serie || !prediccion) {
        // sin serie, serie < MIN_DIAS_PREDICCION o retornos no finitos
        excluidos.push(u.ticker)
        continue
      }
      const precio = serie.precios[serie.precios.length - 1]
      vigentes.push({ ticker: u.ticker, tipo: u.tipo, serie, prediccion })
      filas.push({
        ticker: u.ticker,
        posicion: u.posicion,
        precio,
        prediccion,
        retorno3m: prediccion.m3.p50 / precio - 1,
      })
      const ev = evaluarPredictor(serie.precios, u.tipo)
      if (ev.modelo && ev.baseline && ev.gana !== null) {
        evaluaciones.push({ ticker: u.ticker, gana: ev.gana, modelo: ev.modelo, baseline: ev.baseline })
      } else {
        insuficientes.push(u.ticker)
      }
    }
    filas.sort((a, b) => b.retorno3m - a.retorno3m)
    evaluaciones.sort((a, b) => a.ticker.localeCompare(b.ticker))
    insuficientes.sort()
    excluidos.sort()
    const ganadas = evaluaciones.filter((e) => e.gana).length

    // Registro prospectivo (puro): resolución de vencidas + altas de hoy.
    const { doc, cambio } = actualizarRegistros(datos.docPrevio, vigentes)
    return { filas, evaluaciones, insuficientes, excluidos, ganadas, doc, cambio }
  }, [datos])

  // POST una sola vez, y NUNCA con históricos desactualizados (los registros
  // llevarían fechas y precios viejos). El GET previo ya está adentro de
  // `datos` (mismo Promise.all), así que no hay carrera GET/POST; la ref
  // `posteado` es síncrona contra el doble efecto de StrictMode.
  useEffect(() => {
    if (!datos || !calculo || !datos.docPrevioOk || datos.historicos.desactualizado || !calculo.cambio || posteado.current) return
    posteado.current = true
    fetch('/api/predicciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calculo.doc),
    }).catch(() => console.warn('predicciones: no se pudo guardar el registro'))
  }, [datos, calculo])

  // Dato clave del header: el veredicto del modelo, con la proporción de
  // tickers ganados frente a la mitad (el umbral para agregar valor).
  const agregaValor = calculo ? calculo.ganadas * 2 > calculo.evaluaciones.length : false
  const dato =
    calculo && calculo.evaluaciones.length > 0 ? (
      <div className="max-w-[560px]">
        <p className="font-display text-[22px] italic leading-snug text-[var(--fg-1)] sm:text-[26px]">
          {agregaValor ? 'El modelo le gana al baseline' : 'El modelo no está agregando valor'}
        </p>
        <div className="mt-5" aria-hidden="true">
          <div className="relative h-2.5 rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]">
            <div
              className="h-full rounded-[var(--radius-pill)]"
              style={{
                width: `${(calculo.ganadas / calculo.evaluaciones.length) * 100}%`,
                background: 'var(--mark)',
              }}
            />
            <span className="absolute -top-1 left-1/2 h-[18px] w-[1.5px] bg-[var(--fg-1)]" />
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-[var(--fg-3)]">
            <span className="absolute left-1/2 -translate-x-1/2">mitad</span>
          </div>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--fg-2)]">
          Gana en{' '}
          <span className="font-semibold text-[var(--fg-1)]">
            {calculo.ganadas} de {calculo.evaluaciones.length}
          </span>{' '}
          tickers: su error mediano es menor que el del baseline a 1 y a 3 meses. Para agregar valor tiene que
          ganar en más de la mitad.
        </p>
      </div>
    ) : undefined

  if (fallo) {
    return (
      <AppShell titulo="Predicciones" ancha>
        <EstadoVacio
          titulo="No se pudieron cargar los datos"
          detalle="Revisá la conexión y volvé a intentar."
          accion={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={claseBotonSecundario}
            >
              Reintentar
            </button>
          }
        />
      </AppShell>
    )
  }

  if (!datos) {
    return (
      <AppShell titulo="Predicciones" ancha>
        <SkeletonPagina paneles={3} />
      </AppShell>
    )
  }

  const { historicos } = datos
  const sinHistoricos = Object.keys(historicos.series).length === 0
  // Con datos desactualizados NO se registra: el historial muestra lo
  // persistido tal cual; fresco, muestra el doc ya actualizado (el que se postea).
  const registrosMostrados = historicos.desactualizado || !calculo ? datos.docPrevio.registros : calculo.doc.registros

  return (
    <AppShell titulo="Predicciones" ancha dato={dato}>
      <div className="flex flex-col gap-6 sm:gap-8">
        {historicos.desactualizado && (
          <p aria-live="polite" className="flex items-center gap-1.5 text-[13px] text-[var(--fg-3)]">
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] rounded-[var(--radius-pill)]"
              style={{ background: 'var(--bad)' }}
            />
            Históricos desactualizados: las predicciones se muestran pero no se registran
            {historicos.fecha && ` · último dato ${fechaLarga.format(parseISO(historicos.fecha))}`}
          </p>
        )}

        {sinHistoricos ? (
          <EstadoVacio
            titulo="No hay datos históricos"
            detalle="Sin conexión y sin caché: no se pueden calcular predicciones. Reintentá cuando vuelva la conexión."
            accion={
              <button type="button" onClick={() => window.location.reload()} className={claseBotonSecundario}>
                Reintentar
              </button>
            }
          />
        ) : (
          calculo && (
            <>
              {calculo.evaluaciones.length > 0 && !agregaValor && (
                <p className="max-w-[62ch] px-1 font-display text-[18px] leading-relaxed text-[var(--fg-1)]">
                  Tomá los p50 con pinzas y mirá las bandas del baseline (precio actual ± incertidumbre histórica).
                </p>
              )}

              <Vigentes filas={calculo.filas} />

              {calculo.excluidos.length > 0 && (
                <p className="-mt-2 text-xs text-[var(--fg-3)] sm:-mt-4">
                  Sin histórico suficiente (menos de {MIN_DIAS_PREDICCION} datos o serie inválida):{' '}
                  <span translate="no" className="font-mono">
                    {calculo.excluidos.join(', ')}
                  </span>
                </p>
              )}

              <TablaEvaluacion evaluaciones={calculo.evaluaciones} insuficientes={calculo.insuficientes} />

              <Historial registros={registrosMostrados} />
            </>
          )
        )}

        <footer className="max-w-[78ch] border-t border-[var(--border-1)] px-1 pt-5 text-xs leading-relaxed text-[var(--fg-3)]">
          {DISCLAIMER}
        </footer>
      </div>
    </AppShell>
  )
}

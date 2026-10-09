'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { claseBotonSecundario } from '@/app/componentes/ui/campos'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { Panel } from '@/app/componentes/ui/Panel'
import { diasDeRezago, fechaLarga, parseISO, usdEntero } from '@/app/componentes/ui/formatters'
import { valorPosicion } from '@/lib/calculos'
import type { Portfolio, Precios, TipoActivo } from '@/lib/tipos'
import type { Historicos } from '@/lib/historicos'
import type { Insiders } from '@/lib/insiders'
import { calcularIndicadores, retornosLog, type Indicadores } from '@/lib/indicadores'
import {
  FACTOR_ANUAL,
  volatilidadAnualizada,
  sharpe,
  maxDrawdown,
  correlacion,
  retornosComunes,
  retornosCartera,
  pesos,
} from '@/lib/riesgo'
import { predecir, type Banda } from '@/lib/predictor'
import { proyectarBandas, type PuntoBanda } from '@/lib/proyeccion'
import { evaluarPosicion, type Evaluacion, type Veredicto } from '@/lib/senales'
import { VEREDICTO_COLOR, VEREDICTO_LABEL } from '@/app/componentes/ui/colores'
import type { EntradaWatchlist } from '@/lib/watchlist'
import { backtest } from '@/lib/backtest'
import { type PosicionInfo } from './componentes/compartido'
import { ResumenCartera } from './componentes/ResumenCartera'
import { Alertas, type CambioSenal } from './componentes/Alertas'
import { TarjetaActivo, TarjetaSinDatos, type LineaBacktest } from './componentes/TarjetaActivo'
import { Concentracion } from './componentes/Concentracion'
import { GrupoOportunidades, Oportunidades } from './componentes/Oportunidades'
import { Simulador } from './componentes/Simulador'

const DISCLAIMER =
  'Este análisis es estadístico y se basa solo en precios pasados. La proyección Monte Carlo asume retornos independientes día a día (ignora rachas de volatilidad). Las señales son heurísticas transparentes para ayudarte a pensar, no recomendaciones de inversión. El máximo de referencia es el de los últimos 2 años. En tokens poco líquidos (p. ej. NEXO) la volatilidad y la correlación pueden estar subestimadas. El backtest no incluye costos de transacción ni impuestos, cubre una ventana corta (~14 meses tras el warm-up) y sufre el sesgo de la ventana elegida: no es evidencia estadística.'

interface PosicionEvaluada {
  ticker: string
  nombre: string
  tipo: 'acciones' | 'cripto'
  valorUSD: number
  peso: number
  ind: Indicadores
  evaluacion: Evaluacion
  vol: number
  sharpeVal: number
  drawdown: number
  correlacionMedia: number | null
  proyeccion: PuntoBanda
  ultimaFecha: string
  backtest?: LineaBacktest
  pred1m?: Banda
}

interface PosicionSinDatos {
  ticker: string
  nombre: string
  tipo: 'acciones' | 'cripto'
}

interface CandidatoEvaluado {
  ticker: string
  tipo: 'acciones' | 'cripto'
  ind: Indicadores
  evaluacion: Evaluacion
  vol: number
  drawdown: number
  ultimaFecha: string
  backtest?: LineaBacktest
  pred1m?: Banda
}

interface RespuestaWatchlist {
  curada: EntradaWatchlist[]
  agregados: EntradaWatchlist[]
  ocultos: string[]
  efectivos: EntradaWatchlist[]
}

interface EvaluacionesDoc {
  fecha: string
  veredictos: Record<string, Veredicto>
}

// Orden de los grupos de la watchlist (con peso 0 nunca sale "reducir").
const GRUPOS_OPORTUNIDADES: Veredicto[] = ['comprar', 'mantener', 'reducir', 'vender']

// reducir no puede darse con peso 0; está por exhaustividad del Record.
const ORDEN_VEREDICTO: Record<Veredicto, number> = { comprar: 0, mantener: 1, reducir: 1, vender: 2 }

function precioTicker(ticker: string, precios: Precios, historicos: Historicos): number | undefined {
  if (precios[ticker] !== undefined) return precios[ticker]
  const serie = historicos.series[ticker]
  if (serie && serie.precios.length > 0) return serie.precios[serie.precios.length - 1]
  return undefined
}

// La ventana del backtest difiere entre tipos: `dias` son días hábiles en
// acciones (≈21/mes) y corridos en cripto (≈30/mes).
function lineaBacktest(serie: { precios: number[]; fechas: string[] }, tipo: 'acciones' | 'cripto'): LineaBacktest | undefined {
  const r = backtest(serie.precios, serie.fechas, tipo)
  if (!r) return undefined
  return {
    meses: Math.max(1, Math.round(r.dias / (tipo === 'acciones' ? 21 : 30))),
    retornoEstrategia: r.retornoEstrategia,
    retornoBuyHold: r.retornoBuyHold,
    operaciones: r.operaciones,
  }
}

export default function Evaluacion() {
  const [pf, setPf] = useState<Portfolio | null>(null)
  const [precios, setPrecios] = useState<Precios>({})
  const [historicos, setHistoricos] = useState<Historicos | null>(null)
  const [watchlist, setWatchlist] = useState<RespuestaWatchlist | null>(null)
  const [insiders, setInsiders] = useState<Insiders | null>(null)
  const [previas, setPrevias] = useState<EvaluacionesDoc | null>(null)
  const [previasListas, setPreviasListas] = useState(false)
  const [fallo, setFallo] = useState(false)
  const posteado = useRef(false)

  useEffect(() => {
    ;(async () => {
      try {
        const data = await (await fetch('/api/data')).json()
        setPf(data.portfolio)
        const p = await (await fetch('/api/prices')).json()
        setPrecios(p.precios ?? {})
        const h = await (await fetch('/api/historicos')).json()
        setHistoricos(h)
      } catch {
        setFallo(true)
        return
      }
      try {
        setWatchlist(await (await fetch('/api/watchlist')).json())
      } catch {
        console.warn('watchlist: no se pudo cargar')
      }
      // Insiders (Form 4): best-effort, la evaluación funciona sin ellos.
      try {
        const r = await fetch('/api/insiders')
        if (r.ok) setInsiders((await r.json()) as Insiders)
      } catch {
        console.warn('insiders: no se pudo cargar')
      }
      // Leer las evaluaciones previas ANTES de habilitar el POST: si el POST
      // ganara la carrera, el GET devolvería lo recién guardado y no habría
      // badges nunca. Un GET no-ok (p. ej. 503 por error real de lectura) NO
      // debe habilitar el POST: se arriesgaría a pisar el historial de
      // veredictos con uno recién calculado que no tiene memoria del previo.
      let previasOk = true
      try {
        const rEval = await fetch('/api/evaluaciones')
        if (!rEval.ok) {
          previasOk = false
          console.warn('evaluaciones: no se pudo leer el registro previo')
        } else {
          const e = (await rEval.json()) as EvaluacionesDoc | null
          if (e && typeof e.fecha === 'string' && e.veredictos && typeof e.veredictos === 'object') {
            setPrevias(e)
          } else if (e !== null) {
            // null es el caso legítimo "nunca se guardó"; otra forma es doc corrupto.
            console.warn('evaluaciones: doc con forma inválida')
          }
        }
      } catch {
        // /api/evaluaciones caído o doc corrupto: la página funciona sin badges.
        previasOk = false
        console.warn('evaluaciones: no se pudieron leer las previas')
      }
      if (previasOk) setPreviasListas(true)
    })()
  }, [])

  const hoy = useMemo(() => new Date(), [])

  const calculo = useMemo(() => {
    if (!pf || !historicos) return null
    // Cripto no presenta Form 4: siempre null.
    const insidersDe = (ticker: string, tipo: 'acciones' | 'cripto') =>
      tipo === 'acciones' ? insiders?.porTicker[ticker] ?? null : null

    // 1) Valores por posición, agrupados por ticker (o clave sintética para
    // bono/efectivo, que no tienen ticker).
    const valoresPorTicker: Record<string, number> = {}
    const infoPorClave: Record<string, PosicionInfo> = {}
    const valorPorPlataforma: Record<string, number> = {}

    function acumular(clave: string, nombre: string, tipo: TipoActivo, plataforma: string, valor: number) {
      valoresPorTicker[clave] = (valoresPorTicker[clave] ?? 0) + valor
      if (!infoPorClave[clave]) {
        infoPorClave[clave] = { clave, nombre, tipo, valorUSD: 0, plataformas: [] }
      }
      infoPorClave[clave].valorUSD += valor
      if (!infoPorClave[clave].plataformas.includes(plataforma)) {
        infoPorClave[clave].plataformas.push(plataforma)
      }
      valorPorPlataforma[plataforma] = (valorPorPlataforma[plataforma] ?? 0) + valor
    }

    for (const pl of pf.plataformas) {
      for (const p of pl.posiciones) {
        if (p.tipo === 'acciones' || p.tipo === 'cripto') {
          const precio = precioTicker(p.ticker, precios, historicos)
          const valor = precio !== undefined ? p.cantidad * precio : p.costoUSD
          acumular(p.ticker, p.nombre, p.tipo, pl.nombre, valor)
        } else if (p.tipo === 'bono') {
          acumular('BONO', p.nombre, p.tipo, pl.nombre, valorPosicion(p, precios, hoy))
        }
      }
      if (pl.efectivoUSD !== 0) {
        acumular('EFECTIVO', 'Efectivo', 'efectivo', pl.nombre, pl.efectivoUSD)
      }
      // Asegura que toda plataforma aparezca en el desglose aunque valga 0
      // (sin efectivo ni posiciones con valor).
      valorPorPlataforma[pl.nombre] = valorPorPlataforma[pl.nombre] ?? 0
    }

    const valorTotal = Object.values(valoresPorTicker).reduce((a, b) => a + b, 0)
    const pesosPorTicker = pesos(valoresPorTicker)

    // 2) Señales, riesgo y proyección por posición con serie histórica.
    const tickersAcciones = Object.values(infoPorClave).filter(
      (i): i is PosicionInfo & { tipo: 'acciones' | 'cripto' } => i.tipo === 'acciones' || i.tipo === 'cripto'
    )
    const tickersConSerie = tickersAcciones.filter((t) => historicos.series[t.clave])

    const posicionesEvaluadas: PosicionEvaluada[] = tickersConSerie.map((t) => {
      const serie = historicos.series[t.clave]
      const tipo = t.tipo
      const ind = calcularIndicadores(serie.precios, tipo)
      const peso = pesosPorTicker[t.clave] ?? 0
      const evaluacion = evaluarPosicion(t.clave, ind, tipo, peso, insidersDe(t.clave, tipo))
      const retornos = retornosLog(serie.precios)
      const factor = FACTOR_ANUAL[tipo]
      const vol = volatilidadAnualizada(retornos, factor)
      const sharpeVal = sharpe(retornos, factor)
      const drawdown = maxDrawdown(serie.precios)
      const otros = tickersConSerie.filter((o) => o.clave !== t.clave)
      const correlacionMedia =
        otros.length === 0
          ? null
          : otros.reduce((s, o) => {
              const [ra, rb] = retornosComunes(serie, historicos.series[o.clave])
              return s + correlacion(ra, rb)
            }, 0) / otros.length
      const bandas = proyectarBandas(retornos, valoresPorTicker[t.clave], 63)
      const proyeccion = bandas[bandas.length - 1]
      return {
        ticker: t.clave,
        nombre: t.nombre,
        tipo,
        valorUSD: valoresPorTicker[t.clave],
        peso,
        ind,
        evaluacion,
        vol,
        sharpeVal,
        drawdown,
        correlacionMedia,
        proyeccion,
        ultimaFecha: serie.fechas[serie.fechas.length - 1],
        backtest: lineaBacktest(serie, tipo),
        pred1m: predecir(serie.precios, tipo)?.m1,
      }
    })
    posicionesEvaluadas.sort((a, b) => b.peso - a.peso)

    const sinDatos: PosicionSinDatos[] = tickersAcciones
      .filter((t) => !historicos.series[t.clave])
      .map((t) => ({ ticker: t.clave, nombre: t.nombre, tipo: t.tipo }))

    // 3) Cartera: proyección, volatilidad, drawdown y Sharpe.
    const rc = retornosCartera(historicos.series, pesosPorTicker)
    const proyeccionCartera = proyectarBandas(rc, valorTotal, 126)
    const indiceCartera = [valorTotal]
    for (const r of rc) indiceCartera.push(indiceCartera[indiceCartera.length - 1] * Math.exp(r))
    const volCartera = volatilidadAnualizada(rc, 252)
    const sharpeCartera = sharpe(rc, 252)
    const drawdownCartera = maxDrawdown(indiceCartera)

    const alertas = posicionesEvaluadas.flatMap((p) => p.evaluacion.alertas)

    // 4) Oportunidades: candidatos de la watchlist evaluados con peso 0
    // (la regla de concentración nunca aplica: comprar/mantener/vender).
    const candidatos: CandidatoEvaluado[] = []
    const candidatosSinDatos: EntradaWatchlist[] = []
    for (const e of watchlist?.efectivos ?? []) {
      const serie = historicos.series[e.ticker]
      if (!serie) {
        candidatosSinDatos.push(e)
        continue
      }
      const ind = calcularIndicadores(serie.precios, e.tipo)
      const retornos = retornosLog(serie.precios)
      candidatos.push({
        ticker: e.ticker,
        tipo: e.tipo,
        ind,
        evaluacion: evaluarPosicion(e.ticker, ind, e.tipo, 0, insidersDe(e.ticker, e.tipo)),
        vol: volatilidadAnualizada(retornos, FACTOR_ANUAL[e.tipo]),
        drawdown: maxDrawdown(serie.precios),
        ultimaFecha: serie.fechas[serie.fechas.length - 1],
        backtest: lineaBacktest(serie, e.tipo),
        pred1m: predecir(serie.precios, e.tipo)?.m1,
      })
    }
    // Primero los "comprar", después "mantener", después "vender";
    // alfabético dentro de cada grupo.
    candidatos.sort(
      (a, b) => ORDEN_VEREDICTO[a.evaluacion.veredicto] - ORDEN_VEREDICTO[b.evaluacion.veredicto] || a.ticker.localeCompare(b.ticker)
    )
    candidatosSinDatos.sort((a, b) => a.ticker.localeCompare(b.ticker))

    // 5) Veredictos frescos (posiciones Y candidatos) para cambios de señal.
    const veredictosFrescos: Record<string, Veredicto> = {}
    for (const p of posicionesEvaluadas) veredictosFrescos[p.ticker] = p.evaluacion.veredicto
    for (const c of candidatos) veredictosFrescos[c.ticker] = c.evaluacion.veredicto

    const posiciones = Object.values(infoPorClave).sort((a, b) => b.valorUSD - a.valorUSD)
    const plataformas = Object.entries(valorPorPlataforma).sort((a, b) => b[1] - a[1])

    return {
      valorTotal,
      posicionesEvaluadas,
      sinDatos,
      proyeccionCartera,
      volCartera,
      sharpeCartera,
      drawdownCartera,
      alertas,
      posiciones,
      plataformas,
      candidatos,
      candidatosSinDatos,
      veredictosFrescos,
      valoresPorTicker,
      // `as const` en la tupla para que Object.fromEntries infiera Record<string, TipoActivo>
      tiposPorClave: Object.fromEntries(Object.values(infoPorClave).map((i) => [i.clave, i.tipo] as const)),
    }
  }, [pf, precios, historicos, watchlist, insiders, hoy])

  // Cambios de señal: ticker presente en ambos lados con veredicto distinto.
  // Un ticker nuevo (sin veredicto previo) no es "cambio". Cada cambio se ve
  // una vez: la visita siguiente parte del estado nuevo.
  const cambios = useMemo(() => {
    if (!calculo || !previas) return {} as Record<string, Veredicto>
    const out: Record<string, Veredicto> = {} // ticker → veredicto ANTERIOR
    for (const [t, v] of Object.entries(calculo.veredictosFrescos)) {
      const antes = previas.veredictos[t]
      if (antes && antes !== v) out[t] = antes
    }
    return out
  }, [calculo, previas])

  // Guardar los veredictos frescos, una sola vez por carga. NO se postea con
  // datos desactualizados: los veredictos se calcularon con precios viejos y
  // sobrescribir generaría badges espurios al día siguiente.
  useEffect(() => {
    if (!calculo || !historicos || historicos.desactualizado || !previasListas || posteado.current) return
    if (Object.keys(calculo.veredictosFrescos).length === 0) return
    posteado.current = true
    fetch('/api/evaluaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), veredictos: calculo.veredictosFrescos }),
    }).catch(() => console.warn('evaluaciones: no se pudo guardar'))
  }, [calculo, historicos, previasListas])

  async function agregarAWatchlist(ticker: string, tipo: 'acciones' | 'cripto'): Promise<string | null> {
    try {
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, tipo }),
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null
        return body?.error ?? 'no se pudo agregar'
      }
      // Traer watchlist e históricos en paralelo y recién ahí actualizar ambos
      // estados: si `setWatchlist` se aplica antes de que resuelva el segundo
      // fetch, hay un render intermedio donde el ticker ya está en
      // `watchlist.efectivos` pero todavía no en `historicos.series`, y la
      // tarjeta parpadea como "sin datos de Yahoo" aunque acaba de validarse.
      const [nuevaWatchlist, nuevosHistoricos] = await Promise.all([
        r.json(),
        fetch('/api/historicos').then((res) => res.json()),
      ])
      setWatchlist(nuevaWatchlist)
      setHistoricos(nuevosHistoricos)
      return null
    } catch {
      return 'no se pudo agregar'
    }
  }

  async function quitarDeWatchlist(ticker: string) {
    try {
      const r = await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      })
      if (r.ok) setWatchlist(await r.json())
    } catch {
      console.warn('watchlist: no se pudo quitar')
    }
  }

  if (fallo) {
    return (
      <AppShell titulo="Evaluación" ancha>
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

  if (!pf || !historicos) {
    return (
      <AppShell titulo="Evaluación" ancha>
        <SkeletonPagina paneles={4} />
      </AppShell>
    )
  }

  const sinHistoricos = Object.keys(historicos.series).length === 0
  const nAlertas = calculo ? Object.keys(cambios).length + calculo.alertas.length : 0

  return (
    <AppShell
      titulo="Evaluación"
      ancha
      dato={
        calculo && !sinHistoricos ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-display text-[34px] font-medium leading-none tracking-[-0.02em] text-[var(--fg-1)] sm:text-[40px]">
              {usdEntero.format(calculo.valorTotal)}
            </p>
            <p className="text-[14px] font-medium" style={{ color: nAlertas > 0 ? 'var(--bad)' : 'var(--fg-3)' }}>
              {nAlertas === 0
                ? 'Sin alertas activas'
                : nAlertas === 1
                  ? '1 alerta activa'
                  : `${nAlertas} alertas activas`}
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 md:gap-6">
        {historicos.desactualizado && (
          <p aria-live="polite" className="flex items-center gap-1.5 text-[13px] text-[var(--fg-3)]">
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] rounded-[var(--radius-pill)]"
              style={{ background: 'var(--bad)' }}
            />
            Históricos desactualizados
            {historicos.fecha && ` · último dato ${fechaLarga.format(parseISO(historicos.fecha))}`}
          </p>
        )}

        {sinHistoricos ? (
          <EstadoVacio
            titulo="No hay datos históricos"
            detalle="Sin conexión y sin caché: no se pueden calcular señales ni riesgo. Reintentá cuando vuelva la conexión."
          />
        ) : (
          calculo && (
            <>
              <ResumenCartera
                volCartera={calculo.volCartera}
                sharpeCartera={calculo.sharpeCartera}
                drawdownCartera={calculo.drawdownCartera}
                proyeccionCartera={calculo.proyeccionCartera}
              />

              <Alertas
                cambios={Object.entries(cambios).map(
                  ([t, antes]): CambioSenal => ({
                    ticker: t,
                    antes,
                    ahora: calculo.veredictosFrescos[t],
                    enCartera: calculo.posicionesEvaluadas.some((p) => p.ticker === t),
                  })
                )}
                alertas={calculo.alertas}
              />

              <Panel titulo="Posiciones">
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                  {calculo.posicionesEvaluadas.map((p) => (
                    <TarjetaActivo
                      key={p.ticker}
                      ticker={p.ticker}
                      nombre={p.nombre}
                      ancla={p.ticker}
                      evaluacion={p.evaluacion}
                      ind={p.ind}
                      vol={p.vol}
                      drawdown={p.drawdown}
                      sharpeVal={p.sharpeVal}
                      correlacionMedia={p.correlacionMedia}
                      proyeccion={p.proyeccion}
                      notaDatos={
                        historicos.fecha && diasDeRezago(p.ultimaFecha, historicos.fecha) > 7
                          ? `Datos al ${fechaLarga.format(parseISO(p.ultimaFecha))}`
                          : undefined
                      }
                      cambio={cambios[p.ticker]}
                      backtest={p.backtest}
                      prediccion1m={p.pred1m}
                    >
                      <Simulador
                        ticker={p.ticker}
                        serie={historicos.series[p.ticker]}
                        tipo={p.tipo}
                        valores={calculo.valoresPorTicker}
                        series={historicos.series}
                        tipos={calculo.tiposPorClave}
                      />
                    </TarjetaActivo>
                  ))}
                  {calculo.sinDatos.map((s) => (
                    <TarjetaSinDatos key={s.ticker} ticker={s.ticker} nombre={s.nombre} />
                  ))}
                </div>
              </Panel>

              <Oportunidades
                hayCandidatos={calculo.candidatos.length + calculo.candidatosSinDatos.length > 0}
                onAgregar={agregarAWatchlist}
              >
                {GRUPOS_OPORTUNIDADES.map((v) => {
                  const grupo = calculo.candidatos.filter((c) => c.evaluacion.veredicto === v)
                  if (grupo.length === 0) return null
                  return (
                    <GrupoOportunidades
                      key={v}
                      titulo={VEREDICTO_LABEL[v]}
                      color={VEREDICTO_COLOR[v]}
                      cantidad={grupo.length}
                    >
                      {grupo.map((c) => (
                        <TarjetaActivo
                          key={c.ticker}
                          ticker=""
                          nombre={c.ticker}
                          ancla={c.ticker}
                          compacta
                          evaluacion={c.evaluacion}
                          ind={c.ind}
                          vol={c.vol}
                          drawdown={c.drawdown}
                          mostrarMomentum12
                          onQuitar={() => quitarDeWatchlist(c.ticker)}
                          notaDatos={
                            historicos.fecha && diasDeRezago(c.ultimaFecha, historicos.fecha) > 7
                              ? `Datos al ${fechaLarga.format(parseISO(c.ultimaFecha))}`
                              : undefined
                          }
                          cambio={cambios[c.ticker]}
                          backtest={c.backtest}
                          prediccion1m={c.pred1m}
                        >
                          <Simulador
                            ticker={c.ticker}
                            serie={historicos.series[c.ticker]}
                            tipo={c.tipo}
                            valores={calculo.valoresPorTicker}
                            series={historicos.series}
                            tipos={calculo.tiposPorClave}
                          />
                        </TarjetaActivo>
                      ))}
                    </GrupoOportunidades>
                  )
                })}
                {calculo.candidatosSinDatos.length > 0 && (
                  <GrupoOportunidades titulo="Sin datos de Yahoo" cantidad={calculo.candidatosSinDatos.length}>
                    {calculo.candidatosSinDatos.map((c) => (
                      <TarjetaSinDatos
                        key={c.ticker}
                        ticker=""
                        nombre={c.ticker}
                        nota="Yahoo no devolvió histórico: no se puede evaluar."
                        onQuitar={() => quitarDeWatchlist(c.ticker)}
                      />
                    ))}
                  </GrupoOportunidades>
                )}
              </Oportunidades>

              <Concentracion
                posiciones={calculo.posiciones}
                plataformas={calculo.plataformas}
                valorTotal={calculo.valorTotal}
              />
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

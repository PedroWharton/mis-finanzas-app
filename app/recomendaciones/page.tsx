'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { Badge } from '@/app/componentes/ui/Badge'
import { Colapsable } from '@/app/componentes/ui/Colapsable'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { Panel } from '@/app/componentes/ui/Panel'
import { Skeleton } from '@/app/componentes/ui/Skeleton'
import { claseBotonSecundario, claseBotonTexto, claseTh } from '@/app/componentes/ui/campos'
import { usd, usdEntero } from '@/app/componentes/ui/formatters'
import type { Accion, Recomendacion, RecomendacionesDoc, Resultado, TipoCorrida } from '@/lib/recomendaciones'
import type { Seguimiento } from '@/lib/seguimientoRecomendaciones'
import { ActivarNotificaciones } from './ActivarNotificaciones'

type RecomendacionUI = Recomendacion & { seguimiento?: Seguimiento }

const DISCLAIMER =
  'Las recomendaciones las escribe un modelo de lenguaje a partir de los datos de la cartera y de las señales estadísticas de la app. Puede equivocarse, inventar contexto o ignorar información que no le llegó. Nada de esto es asesoramiento de inversión: es un punto de partida para pensar, y la decisión (y la plata) son tuyas.'

const MS_POR_DIA = 24 * 60 * 60 * 1000
const DIAS_STALENESS = 4

// Fecha con hora para corridas del agente (es-AR, como todos los formatters).
const fechaHora = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const TIPO_LABEL: Record<TipoCorrida, string> = {
  diario: 'Diario',
  semanal: 'Semanal',
  error: 'Error',
}

// El badge de tipo usa borde+texto (no relleno) y tinta neutra para no competir
// con el color de las acciones, que es la señal que importa leer primero.
const TIPO_COLOR: Record<TipoCorrida, string> = {
  diario: 'var(--fg-2)',
  semanal: 'var(--fg-1)',
  error: 'var(--bad)',
}

const ACCION_LABEL: Record<Accion, string> = {
  comprar: 'Comprar',
  vender: 'Vender',
  mantener: 'Mantener',
  alerta: 'Alerta',
}

// "Mantener" usa fg-2 (no fg-3) para no quedar por debajo del texto normal.
const ACCION_COLOR: Record<Accion, string> = {
  comprar: 'var(--good)',
  vender: 'var(--bad)',
  mantener: 'var(--fg-2)',
  alerta: 'var(--bad)', // bordó: solo pérdidas y alertas
}

interface Estado {
  doc: RecomendacionesDoc | null
  // false si el GET falló o el doc no tiene forma válida: es distinto de
  // "el agente todavía no corrió" y la página lo dice explícitamente.
  ok: boolean
}

function esDoc(x: unknown): x is RecomendacionesDoc {
  return typeof x === 'object' && x !== null && Array.isArray((x as RecomendacionesDoc).corridas)
}

function MetaCorrida({ c }: { c: Resultado }) {
  return (
    <>
      <Badge color={TIPO_COLOR[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
      <time dateTime={c.fecha} className="font-mono text-[12px] text-[var(--fg-2)]">
        {fechaHora.format(new Date(c.fecha))}
      </time>
    </>
  )
}

// Pasado este largo, la razón se muestra recortada con opción de expandir:
// la lista se escanea por acción + ticker + monto; el porqué se lee a pedido.
const LARGO_RAZON = 240

// Qué pasó desde la corrida: retorno del precio, niveles tocados y si la
// recomendación se siguió con una operación real. Solo compras/ventas con
// precio estampado traen seguimiento.
function LineaSeguimiento({ r }: { r: RecomendacionUI }) {
  const s = r.seguimiento
  if (!s || s.retornoPct === null) return null
  const invertida = r.accion === 'vender'
  // En una venta, que el precio haya caído después es un acierto.
  const acierto = invertida ? s.retornoPct < 0 : s.retornoPct > 0
  const partes: string[] = []
  if (s.tocoTarget) partes.push('tocó el target')
  if (s.tocoStop) partes.push('tocó el stop')
  if (s.seguida) partes.push('la seguiste')
  return (
    <p className="mt-2 text-[13px] text-[var(--fg-3)]">
      Desde la corrida:{' '}
      <span className="font-mono" style={{ color: acierto ? 'var(--good)' : 'var(--bad)' }}>
        {s.retornoPct >= 0 ? '+' : '−'}
        {Math.abs(s.retornoPct).toFixed(1)}%
      </span>
      {partes.length > 0 && <>, {partes.join(', ')}</>}
    </p>
  )
}

function Razon({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false)
  const larga = texto.length > LARGO_RAZON
  return (
    <div className="mt-2.5">
      <p
        className={`max-w-[70ch] text-[14px] leading-relaxed text-[var(--fg-2)] ${
          larga && !abierta ? 'line-clamp-3' : ''
        }`}
      >
        {texto}
      </p>
      {larga && (
        <button
          type="button"
          aria-expanded={abierta}
          onClick={() => setAbierta(!abierta)}
          className={`${claseBotonTexto} text-[13px]`}
        >
          {abierta ? 'Mostrar menos' : 'Leer el porqué completo'}
        </button>
      )}
    </div>
  )
}

// Card de recomendación: acción + ticker a la izquierda, monto alineado a la
// derecha, niveles en grilla etiquetada y razón recortada.
function Card({ r }: { r: RecomendacionUI }) {
  const niveles: Array<{ etiqueta: string; valor?: number }> = [
    { etiqueta: 'Límite', valor: r.precioLimite },
    { etiqueta: 'Stop', valor: r.stopLoss },
    { etiqueta: 'Target', valor: r.precioObjetivo },
  ]
  const conValor = niveles.filter((n) => n.valor !== undefined)
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-x-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span translate="no" className="font-mono text-[15px] font-medium text-[var(--fg-1)]">
            {r.ticker}
          </span>
          <Badge color={ACCION_COLOR[r.accion]} className="translate-y-[-1px]">
            {ACCION_LABEL[r.accion]}
          </Badge>
          {r.esNuevo && <span className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-2)]">Nuevo</span>}
        </div>
        {r.montoUSD !== undefined && (
          <span className="shrink-0 font-display text-[21px] font-medium text-[var(--fg-1)]">
            {usdEntero.format(r.montoUSD)}
          </span>
        )}
      </div>
      {conValor.length > 0 && (
        <dl className="mt-3 grid max-w-md grid-cols-3 gap-x-4 gap-y-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3.5 py-2.5">
          {conValor.map((n) => (
            <div key={n.etiqueta} className="min-w-0">
              <dt className={claseTh + ' pb-0'}>{n.etiqueta}</dt>
              <dd className="mt-0.5 font-mono text-[13px] text-[var(--fg-1)]">{usd.format(n.valor as number)}</dd>
            </div>
          ))}
        </dl>
      )}
      <Razon texto={r.razon} />
      <LineaSeguimiento r={r} />
    </li>
  )
}

// "2 para comprar, 5 para mantener y 1 alerta": se lee antes que la lista.
function Recuento({ recomendaciones }: { recomendaciones: Recomendacion[] }) {
  const orden: Accion[] = ['comprar', 'vender', 'alerta', 'mantener']
  const partes = orden
    .map((a) => ({ a, n: recomendaciones.filter((r) => r.accion === a).length }))
    .filter((x) => x.n > 0)
    .map(({ a, n }) =>
      a === 'alerta' ? `${n} ${n === 1 ? 'alerta' : 'alertas'}` : `${n} para ${ACCION_LABEL[a].toLowerCase()}`
    )
  if (partes.length === 0) return null
  const texto = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
  return <>{texto}</>
}

// Primero lo que pide hacer algo (comprar, vender, alertas); "mantener" al
// final. Orden estable: dentro de cada acción se respeta el orden del agente.
const PRIORIDAD: Record<Accion, number> = { comprar: 0, vender: 1, alerta: 2, mantener: 3 }
function ordenarPorAccion<T extends Recomendacion>(rs: T[]): T[] {
  return rs
    .map((r, i) => ({ r, i }))
    .sort((a, b) => PRIORIDAD[a.r.accion] - PRIORIDAD[b.r.accion] || a.i - b.i)
    .map((x) => x.r)
}

function ListaRecomendaciones({ recomendaciones }: { recomendaciones: Recomendacion[] }) {
  if (recomendaciones.length === 0) {
    return <p className="text-sm text-[var(--fg-2)]">Sin acciones sugeridas en esta corrida.</p>
  }
  return (
    <ul className="flex max-w-3xl list-none flex-col divide-y divide-[var(--border-1)]">
      {ordenarPorAccion(recomendaciones).map((r, i) => (
        <Card key={`${r.ticker}-${r.accion}-${i}`} r={r} />
      ))}
    </ul>
  )
}

// El análisis llega como texto libre del modelo: se parte por líneas en blanco
// y cada bloque es un párrafo. Sin dependencia de markdown a propósito.
function Analisis({ texto }: { texto: string }) {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parrafos.length === 0) return null
  return (
    <Colapsable nivel={2} resumen="Análisis completo" className="mt-3">
      <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--fg-2)]">
        {parrafos.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </Colapsable>
  )
}

// Contenido plano de una corrida: resumen, acciones y análisis (nivel 2). En
// la última corrida el resumen es el texto principal de la pantalla; en las
// anteriores baja a tamaño de cuerpo.
function CuerpoCorrida({ c, destacada = false }: { c: Resultado; destacada?: boolean }) {
  const n = c.recomendaciones.length
  return (
    <>
      <p
        className={`max-w-[62ch] text-[var(--fg-1)] ${
          destacada
            ? 'font-display text-[19px] leading-[1.5] tracking-[-0.005em] sm:text-[21px]'
            : 'text-[14px] leading-relaxed'
        }`}
      >
        {c.resumen}
      </p>
      {n > 0 && (
        <h3 className="mb-4 mt-7 max-w-3xl border-b border-[var(--border-1)] pb-2 text-[14px] font-semibold text-[var(--fg-1)]">
          {n === 1 ? '1 acción sugerida' : `${n} acciones sugeridas`}
          <span className="font-normal text-[var(--fg-2)]">
            {': '}
            <Recuento recomendaciones={c.recomendaciones} />
          </span>
        </h3>
      )}
      <div className={n > 0 ? '' : 'mt-4'}>
        <ListaRecomendaciones recomendaciones={c.recomendaciones} />
      </div>
      <Analisis texto={c.analisis} />
    </>
  )
}

function hace(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

function SkeletonRecomendaciones() {
  return (
    <div role="status" aria-label="Cargando recomendaciones" className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-1)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-5 h-4 w-full" />
        <Skeleton className="mt-2.5 h-4 w-11/12" />
        <Skeleton className="mt-2.5 h-4 w-2/3" />
        <Skeleton className="mt-8 h-3.5 w-48" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="mt-5 border-t border-[var(--border-1)] pt-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
          </div>
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[var(--radius-lg)]" />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

export default function Recomendaciones() {
  const [estado, setEstado] = useState<Estado | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/recomendaciones')
    if (!r.ok) return { doc: null, ok: false }
    const d = (await r.json()) as unknown
    // null es el caso legítimo "el agente nunca corrió".
    if (d === null) return { doc: null, ok: true }
    return esDoc(d) ? { doc: d, ok: true } : { doc: null, ok: false }
  }, [])

  useEffect(() => {
    cargar()
      .then(setEstado)
      .catch(() => setEstado({ doc: null, ok: false }))
  }, [cargar])

  const hoy = useMemo(() => new Date(), [])

  const corridas = estado?.doc?.corridas ?? []
  const ultima = corridas[0]
  const anteriores = corridas.slice(1)

  const diasSinCorrer =
    ultima && !Number.isNaN(Date.parse(ultima.fecha))
      ? Math.floor((hoy.getTime() - Date.parse(ultima.fecha)) / MS_POR_DIA)
      : null
  const desactualizado = diasSinCorrer !== null && diasSinCorrer > DIAS_STALENESS

  return (
    <AppShell
      titulo="Recomendaciones"
      dato={
        ultima ? (
          <div className="text-[15px] text-[var(--fg-2)]">
            <p className="font-display text-[19px] italic text-[var(--fg-1)]">
              Última corrida {TIPO_LABEL[ultima.tipo].toLowerCase()}
            </p>
            <p className="mt-1 text-[13px] text-[var(--fg-3)]">
              <time dateTime={ultima.fecha}>{fechaHora.format(new Date(ultima.fecha))}</time>
              {diasSinCorrer !== null && <>, {hace(diasSinCorrer)}</>}
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {estado === null ? (
          <SkeletonRecomendaciones />
        ) : (
          <>
            {!estado.ok ? (
              <EstadoVacio
                titulo="No se pudieron leer las recomendaciones"
                detalle="El historial sigue guardado: falló la lectura, no los datos. Probá de nuevo en un rato."
                accion={
                  <button
                    type="button"
                    className={claseBotonSecundario}
                    onClick={() => {
                      setEstado(null)
                      cargar()
                        .then(setEstado)
                        .catch(() => setEstado({ doc: null, ok: false }))
                    }}
                  >
                    Reintentar
                  </button>
                }
              />
            ) : !ultima ? (
              <EstadoVacio
                titulo="El agente todavía no corrió"
                detalle="Cuando lo haga (una corrida diaria y un análisis semanal más profundo), acá vas a ver el resumen, las acciones sugeridas y el análisis completo. Activá las notificaciones de abajo para que te avise."
              />
            ) : (
              <Panel
                titulo="Lo que dice el agente"
                accion={<Badge color={TIPO_COLOR[ultima.tipo]}>{TIPO_LABEL[ultima.tipo]}</Badge>}
              >
                {desactualizado && (
                  <p
                    role="status"
                    className="mb-5 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--bad)_35%,transparent)] bg-[var(--bg-sunken)] px-4 py-3 text-[14px] leading-snug text-[var(--fg-1)]"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="mt-[1px] h-4 w-4 shrink-0 text-[var(--bad)]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <circle cx="8" cy="8" r="6.25" />
                      <path d="M8 4.75V8l2.25 1.5" />
                    </svg>
                    <span>
                      El agente no corre desde hace <span className="font-mono">{diasSinCorrer}</span> días: estas
                      recomendaciones pueden haber quedado viejas.
                    </span>
                  </p>
                )}
                <CuerpoCorrida c={ultima} destacada />
              </Panel>
            )}

            {anteriores.length > 0 && (
              <section aria-labelledby="titulo-anteriores" className="flex flex-col gap-2.5">
                <h2 id="titulo-anteriores" className="titulo-seccion mb-1 px-1">
                  Corridas anteriores{' '}
                  <span className="font-sans text-[14px] font-normal tracking-normal text-[var(--fg-3)]">{anteriores.length}</span>
                </h2>
                {anteriores.map((c, i) => (
                  <Colapsable
                    key={`${c.fecha}-${i}`}
                    nivel={1}
                    resumen={<MetaCorrida c={c} />}
                    meta={
                      <span className="hidden text-[13px] font-normal text-[var(--fg-3)] sm:inline">
                        {c.recomendaciones.length === 1 ? '1 acción' : `${c.recomendaciones.length} acciones`}
                      </span>
                    }
                  >
                    <CuerpoCorrida c={c} />
                  </Colapsable>
                ))}
              </section>
            )}

            <Panel titulo="Notificaciones">
              <p className="mb-4 max-w-[60ch] text-[14px] text-[var(--fg-2)]">
                Recibí un aviso en el teléfono cada vez que el agente termina una corrida.
              </p>
              <ActivarNotificaciones />
              <p className="mt-4 max-w-[68ch] text-[13px] leading-relaxed text-[var(--fg-3)]">
                En iPhone las notificaciones web solo funcionan con la app instalada: abrí esta página en Safari, tocá
                Compartir, elegí “Agregar a pantalla de inicio” y activalas desde la app instalada.
              </p>
            </Panel>
          </>
        )}

        <footer className="max-w-[78ch] border-t border-[var(--border-1)] px-1 pt-5 text-[12px] leading-relaxed text-[var(--fg-3)]">{DISCLAIMER}</footer>
      </div>
    </AppShell>
  )
}

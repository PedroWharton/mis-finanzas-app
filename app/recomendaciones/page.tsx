'use client'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { Badge } from '@/app/componentes/ui/Badge'
import { Colapsable } from '@/app/componentes/ui/Colapsable'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { Panel } from '@/app/componentes/ui/Panel'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
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

// El badge de tipo usa borde+texto (no relleno) para no competir con el color
// de las acciones, que es la señal que importa leer primero.
const TIPO_COLOR: Record<TipoCorrida, string> = {
  diario: 'var(--navy-500)',
  semanal: 'var(--gold-700)',
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
  alerta: 'var(--gold-700)',
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
      <time dateTime={c.fecha} className="text-[12px] text-[var(--fg-3)]">
        {fechaHora.format(new Date(c.fecha))}
      </time>
    </>
  )
}

// Card de recomendación: acción como badge, ticker + monto protagonistas,
// niveles en grilla etiquetada y razón como texto corrido.
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
    <p className="mt-2 text-[12px] text-[var(--fg-3)]">
      Desde la corrida:{' '}
      <span className="tabular-nums font-semibold" style={{ color: acierto ? 'var(--good)' : 'var(--bad)' }}>
        {s.retornoPct >= 0 ? '+' : '−'}
        {Math.abs(s.retornoPct).toFixed(1)}%
      </span>
      {partes.length > 0 && <> · {partes.join(' · ')}</>}
    </p>
  )
}

function Card({ r }: { r: RecomendacionUI }) {
  const niveles: Array<{ etiqueta: string; valor?: number }> = [
    { etiqueta: 'Límite', valor: r.precioLimite },
    { etiqueta: 'Stop', valor: r.stopLoss },
    { etiqueta: 'Target', valor: r.precioObjetivo },
  ]
  const conValor = niveles.filter((n) => n.valor !== undefined)
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge color={ACCION_COLOR[r.accion]}>{ACCION_LABEL[r.accion]}</Badge>
        {r.esNuevo && (
          <span className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
            Nuevo
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span translate="no" className="font-mono text-[15px] font-semibold text-[var(--fg-1)]">
          {r.ticker}
        </span>
        {r.montoUSD !== undefined && (
          <span className="font-display tabular-nums text-[19px] font-medium text-[var(--fg-1)]">
            {usdEntero.format(r.montoUSD)}
          </span>
        )}
      </div>
      {conValor.length > 0 && (
        <dl className="mt-3 grid max-w-md grid-cols-3 gap-x-4 gap-y-1 rounded-[var(--radius-sm)] border border-[var(--border-1)] bg-[var(--bg-sunken)] px-3.5 py-2.5">
          {conValor.map((n) => (
            <div key={n.etiqueta} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                {n.etiqueta}
              </dt>
              <dd className="mt-0.5 tabular-nums text-[13px] text-[var(--fg-1)]">
                {usd.format(n.valor as number)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--fg-2)]">{r.razon}</p>
      <LineaSeguimiento r={r} />
    </li>
  )
}

function ListaRecomendaciones({ recomendaciones }: { recomendaciones: Recomendacion[] }) {
  if (recomendaciones.length === 0) {
    return <p className="text-sm text-[var(--fg-2)]">Sin acciones sugeridas en esta corrida.</p>
  }
  return (
    <ul className="flex list-none flex-col divide-y divide-[var(--border-1)]">
      {recomendaciones.map((r, i) => (
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

// Contenido plano de una corrida: resumen, cards y análisis (nivel 2). El
// tercer nivel viejo ("Detalle" dentro de corrida) se aplanó a propósito.
function CuerpoCorrida({ c }: { c: Resultado }) {
  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--fg-1)]">{c.resumen}</p>
      <div className="mt-4">
        <ListaRecomendaciones recomendaciones={c.recomendaciones} />
      </div>
      <Analisis texto={c.analisis} />
    </>
  )
}

export default function Recomendaciones() {
  const [estado, setEstado] = useState<Estado | null>(null)

  useEffect(() => {
    ;(async () => {
      const r = await fetch('/api/recomendaciones')
      if (!r.ok) {
        setEstado({ doc: null, ok: false })
        return
      }
      const d = (await r.json()) as unknown
      // null es el caso legítimo "el agente nunca corrió".
      if (d === null) {
        setEstado({ doc: null, ok: true })
        return
      }
      setEstado(esDoc(d) ? { doc: d, ok: true } : { doc: null, ok: false })
    })().catch(() => setEstado({ doc: null, ok: false }))
  }, [])

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
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px] text-[var(--fg-hero-muted)]">
            <span className="font-display text-[17px] font-medium text-[var(--fg-on-hero)]">
              Última corrida · {TIPO_LABEL[ultima.tipo].toLowerCase()}
            </span>
            <time dateTime={ultima.fecha}>{fechaHora.format(new Date(ultima.fecha))}</time>
          </p>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {estado === null ? (
          <SkeletonPagina paneles={3} />
        ) : (
          <>
            {desactualizado && (
              <p role="status" className="flex items-center gap-1.5 text-[13px] text-[var(--fg-3)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-[7px] w-[7px] rounded-full"
                  style={{ background: 'var(--bordeaux-500)' }}
                />
                El agente no corre desde hace <span className="tabular-nums">{diasSinCorrer}</span> días · última
                corrida {fechaHora.format(new Date(ultima.fecha))}
              </p>
            )}

            {!estado.ok ? (
              <EstadoVacio
                titulo="No se pudieron leer las recomendaciones"
                detalle="Probá recargar en un rato: el historial sigue guardado, es la lectura la que falló."
              />
            ) : !ultima ? (
              <EstadoVacio
                titulo="El agente todavía no corrió"
                detalle="Cuando lo haga (una corrida diaria y un análisis semanal más profundo), acá vas a ver el resumen, las acciones sugeridas y el análisis completo. Activá las notificaciones para que te avise."
              />
            ) : (
              <Panel titulo="Última corrida" className="revela">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <MetaCorrida c={ultima} />
                </div>
                <div className="mt-4">
                  <CuerpoCorrida c={ultima} />
                </div>
              </Panel>
            )}

            {anteriores.length > 0 && (
              <section aria-label="Corridas anteriores" className="revela flex flex-col gap-3">
                <h2 className="etiqueta">
                  Corridas anteriores{' '}
                  <span className="tabular-nums text-[var(--fg-3)]">({anteriores.length})</span>
                </h2>
                {anteriores.map((c, i) => (
                  <Colapsable
                    key={`${c.fecha}-${i}`}
                    nivel={1}
                    resumen={<MetaCorrida c={c} />}
                  >
                    <CuerpoCorrida c={c} />
                  </Colapsable>
                ))}
              </section>
            )}

            <Panel titulo="Notificaciones" className="revela">
              <p className="mb-4 text-sm text-[var(--fg-2)]">
                Recibí un aviso en el teléfono cada vez que el agente termina una corrida.
              </p>
              <ActivarNotificaciones />
              <p className="mt-4 text-[12px] leading-relaxed text-[var(--fg-3)]">
                En iPhone las notificaciones web solo funcionan con la app instalada: abrí esta página en Safari,
                tocá compartir → “Agregar a pantalla de inicio”, y después abrila desde el ícono y activá acá.
              </p>
            </Panel>
          </>
        )}

        <footer className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)] px-6 py-5 text-[12px] leading-relaxed text-[var(--fg-3)]">
          {DISCLAIMER}
        </footer>
      </div>
    </AppShell>
  )
}

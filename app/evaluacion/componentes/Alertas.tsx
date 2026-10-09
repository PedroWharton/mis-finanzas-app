'use client'
import { Panel } from '@/app/componentes/ui/Panel'
import { Badge } from '@/app/componentes/ui/Badge'
import { VEREDICTO_COLOR, VEREDICTO_LABEL } from '@/app/componentes/ui/colores'
import { pct } from '@/app/componentes/ui/formatters'
import type { Veredicto } from '@/lib/senales'
import { idActivo } from './compartido'

export interface CambioSenal {
  ticker: string
  antes: Veredicto
  ahora: Veredicto
  enCartera: boolean // false → candidato de la watchlist
}

// Las alertas llegan como texto desde lib/senales. Se agrupan por tipo leyendo
// las frases fijas que arma esa función; lo que no reconoce cae en "Otras" con
// el texto original completo, así que nunca se pierde una alerta.
type Alerta =
  | { tipo: 'caida'; ticker: string; valor: number }
  | { tipo: 'media200'; ticker: string }
  | { tipo: 'rsi'; ticker: string; estado: 'sobreventa' | 'sobrecompra'; rsi: string }
  | { tipo: 'concentracion'; ticker: string; valor: number }
  | { tipo: 'otra'; texto: string }

function clasificar(texto: string): Alerta {
  let m = texto.match(/^(\S+) cayó ([\d.]+)% desde su máximo/)
  if (m) return { tipo: 'caida', ticker: m[1], valor: Number(m[2]) / 100 }
  m = texto.match(/^(\S+) está bajo su media de 200 días/)
  if (m) return { tipo: 'media200', ticker: m[1] }
  m = texto.match(/^(\S+) en (sobreventa|sobrecompra) \(RSI (\d+)\)/)
  if (m) return { tipo: 'rsi', ticker: m[1], estado: m[2] as 'sobreventa' | 'sobrecompra', rsi: m[3] }
  m = texto.match(/^(\S+) concentra ([\d.]+)% de la cartera/)
  if (m) return { tipo: 'concentracion', ticker: m[1], valor: Number(m[2]) / 100 }
  return { tipo: 'otra', texto }
}

// Orden de lectura: primero lo que pide actuar.
const ORDEN_DESTINO: Veredicto[] = ['comprar', 'vender', 'reducir', 'mantener']

// Las tarjetas de la watchlist son <details>: si el chip apunta a una
// cerrada, se abre antes de que el navegador salte al ancla.
function abrirDestino(ticker: string) {
  const el = document.getElementById(idActivo(ticker))
  if (el instanceof HTMLDetailsElement) el.open = true
}

function Chip({
  ticker,
  detalle,
  tono = 'fuerte',
}: {
  ticker: string
  detalle?: React.ReactNode
  tono?: 'fuerte' | 'suave'
}) {
  return (
    <li>
      <a
        href={`#${idActivo(ticker)}`}
        onClick={() => abrirDestino(ticker)}
        className={`inline-flex min-h-11 items-baseline gap-1.5 rounded-[var(--radius-pill)] border px-3 py-2.5 text-[12px] leading-none no-underline transition-colors duration-[var(--dur-base)] hover:border-[var(--border-focus)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:min-h-0 sm:py-1.5 ${
          tono === 'fuerte'
            ? 'border-[var(--border-2)] bg-[var(--bg-surface)]'
            : 'border-[var(--border-1)] bg-[var(--bg-sunken)]'
        }`}
      >
        <span translate="no" className="font-mono font-medium text-[var(--fg-1)]">
          {ticker}
        </span>
        {detalle && <span className="font-mono text-[var(--fg-3)]">{detalle}</span>}
      </a>
    </li>
  )
}

function Fila({ etiqueta, children }: { etiqueta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-t border-[var(--border-1)] py-3 first:border-t-0 first:pt-0 sm:grid-cols-[13rem_1fr] sm:items-baseline">
      <h3 className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">{etiqueta}</h3>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function Chips({ children }: { children: React.ReactNode }) {
  return <ul className="contents">{children}</ul>
}

export function Alertas({ cambios, alertas }: { cambios: CambioSenal[]; alertas: string[] }) {
  const clasificadas = alertas.map(clasificar)
  const caidas = clasificadas
    .filter((a): a is Extract<Alerta, { tipo: 'caida' }> => a.tipo === 'caida')
    .sort((a, b) => b.valor - a.valor)
  const media200 = clasificadas.filter((a): a is Extract<Alerta, { tipo: 'media200' }> => a.tipo === 'media200')
  const rsi = clasificadas.filter((a): a is Extract<Alerta, { tipo: 'rsi' }> => a.tipo === 'rsi')
  const concentracion = clasificadas.filter(
    (a): a is Extract<Alerta, { tipo: 'concentracion' }> => a.tipo === 'concentracion'
  )
  const otras = clasificadas.filter((a): a is Extract<Alerta, { tipo: 'otra' }> => a.tipo === 'otra')

  const destinos = ORDEN_DESTINO.map((v) => ({
    veredicto: v,
    cartera: cambios.filter((c) => c.ahora === v && c.enCartera),
    watchlist: cambios.filter((c) => c.ahora === v && !c.enCartera),
  })).filter((d) => d.cartera.length + d.watchlist.length > 0)

  const total = cambios.length + alertas.length

  return (
    <Panel titulo="Alertas">
      {total === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">
          Sin alertas: ningún veredicto cambió desde tu última visita y ninguna posición cruzó un umbral.
        </p>
      ) : (
        <div className="flex flex-col">
          {destinos.map((d) => (
            <Fila
              key={d.veredicto}
              etiqueta={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  Pasaron a
                  <Badge color={VEREDICTO_COLOR[d.veredicto]}>{VEREDICTO_LABEL[d.veredicto]}</Badge>
                </span>
              }
            >
              <Chips>
                {d.cartera.map((c) => (
                  <Chip key={c.ticker} ticker={c.ticker} detalle={`antes ${c.antes}`} />
                ))}
              </Chips>
              {d.watchlist.length > 0 && (
                <>
                  <span className="px-1 text-[12px] text-[var(--fg-3)]">
                    {d.cartera.length > 0 ? 'y en watchlist' : 'En watchlist'}
                  </span>
                  <Chips>
                    {d.watchlist.map((c) => (
                      <Chip key={c.ticker} ticker={c.ticker} detalle={`antes ${c.antes}`} tono="suave" />
                    ))}
                  </Chips>
                </>
              )}
            </Fila>
          ))}

          {concentracion.length > 0 && (
            <Fila etiqueta="Concentración alta">
              <Chips>
                {concentracion.map((a) => (
                  <Chip key={a.ticker} ticker={a.ticker} detalle={`${pct.format(a.valor)} de la cartera`} />
                ))}
              </Chips>
            </Fila>
          )}

          {caidas.length > 0 && (
            <Fila etiqueta="Caída desde el máximo de 2 años">
              <Chips>
                {caidas.map((a) => (
                  <Chip key={a.ticker} ticker={a.ticker} detalle={`−${pct.format(a.valor)}`} />
                ))}
              </Chips>
            </Fila>
          )}

          {media200.length > 0 && (
            <Fila etiqueta="Bajo su media de 200 días">
              <Chips>
                {media200.map((a) => (
                  <Chip key={a.ticker} ticker={a.ticker} />
                ))}
              </Chips>
            </Fila>
          )}

          {rsi.length > 0 && (
            <Fila etiqueta="RSI extremo">
              <Chips>
                {rsi.map((a) => (
                  <Chip key={a.ticker} ticker={a.ticker} detalle={`${a.estado} (${a.rsi})`} />
                ))}
              </Chips>
            </Fila>
          )}

          {otras.length > 0 && (
            <Fila etiqueta="Otras">
              <ul className="flex w-full flex-col gap-1.5 text-[13px] text-[var(--fg-1)]">
                {otras.map((a, i) => (
                  <li key={i}>{a.texto}</li>
                ))}
              </ul>
            </Fila>
          )}
        </div>
      )}
    </Panel>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { claseBotonSecundario } from '@/app/componentes/ui/campos'
import { COLOR_TIPO, COLORES_PLATAFORMA } from '@/app/componentes/ui/colores'
import {
  usd,
  usdEntero,
  pct,
  fechaLarga,
  fechaTabla,
  parseISO,
  signo,
} from '@/app/componentes/ui/formatters'
import { totalUSD, porPlataforma, porTipo, filasTabla } from '@/lib/calculos'
import { rentaDelAnio, modifiedDietz, exposicion } from '@/lib/analitica'
import type { Portfolio, Precios, Snapshot, TipoActivo } from '@/lib/tipos'

const NOMBRE_TIPO: Record<TipoActivo, string> = {
  acciones: 'Acciones y ETFs',
  cripto: 'Criptoactivos',
  bono: 'Renta fija',
  efectivo: 'Efectivo',
}

function BarraInline({ proporcion, color }: { proporcion: number; color: string }) {
  return (
    <div className="color-exacto h-[6px] w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]">
      <div
        className="color-exacto h-full rounded-[var(--radius-pill)]"
        style={{ width: `${Math.min(100, proporcion * 100)}%`, background: color }}
      />
    </div>
  )
}

function FilaAsignacion({
  nombre,
  valor,
  total,
  color,
}: {
  nombre: string
  valor: number
  total: number
  color: string
}) {
  const proporcion = total > 0 ? valor / total : 0
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 break-words font-semibold text-[var(--fg-1)]">
          <span
            aria-hidden="true"
            className="color-exacto mr-2 inline-block h-2 w-2 rounded-[var(--radius-xs)] align-middle"
            style={{ background: color }}
          />
          {nombre}
        </span>
        <span className="shrink-0 tabular-nums text-[var(--fg-2)]">
          {usd.format(valor)} ·{' '}
          <span className="font-semibold text-[var(--fg-1)]">{pct.format(proporcion)}</span>
        </span>
      </div>
      <div className="mt-1">
        <BarraInline proporcion={proporcion} color={color} />
      </div>
    </li>
  )
}

function Ganancia({ montoUSD, porcentaje }: { montoUSD: number; porcentaje: number }) {
  return (
    <span
      className="tabular-nums font-semibold whitespace-nowrap"
      style={{ color: montoUSD >= 0 ? 'var(--good)' : 'var(--bad)' }}
    >
      {signo(montoUSD)}
      {usd.format(Math.abs(montoUSD))}
      <span className="ml-1 text-[11px] font-normal">
        ({signo(montoUSD)}
        {pct.format(Math.abs(porcentaje))})
      </span>
    </span>
  )
}

export default function Reporte() {
  const [pf, setPf] = useState<Portfolio | null>(null)
  const [precios, setPrecios] = useState<Precios>({})
  const [fechaPrecios, setFechaPrecios] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [data, p] = await Promise.all([
          fetch('/api/data').then((r) => r.json()),
          fetch('/api/prices').then((r) => r.json()),
        ])
        setSnapshots(data.snapshots ?? [])
        setPrecios(p.precios ?? {})
        setFechaPrecios(p.fecha ?? '')
        setPf(data.portfolio)
      } catch {
        setFallo(true)
      }
    })()
  }, [])

  const hoy = useMemo(() => new Date(), [])

  const fechaDatos = fechaPrecios
    ? fechaLarga.format(parseISO(fechaPrecios))
    : fechaLarga.format(hoy)

  if (fallo) {
    return (
      <AppShell titulo="Reporte">
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

  if (!pf) {
    return (
      <AppShell titulo="Reporte">
        <SkeletonPagina />
      </AppShell>
    )
  }

  const ops = pf.operaciones ?? []
  const total = totalUSD(pf, precios, hoy)
  const filas = filasTabla(pf, precios, hoy)
  const porTipoVal = (Object.entries(porTipo(pf, precios, hoy)) as [TipoActivo, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const porPlataformaVal = Object.entries(porPlataforma(pf, precios, hoy)).sort(
    (a, b) => b[1] - a[1],
  )

  const anioActual = hoy.getFullYear()
  const renta = rentaDelAnio(ops, pf, anioActual, hoy)
  const dietz = modifiedDietz(snapshots, ops)
  const expo = exposicion(pf, precios, hoy)

  const totInvertido = filas.reduce((s, f) => s + f.costoUSD, 0)
  const totValor = filas.reduce((s, f) => s + f.valorUSD, 0)
  const totGanancia = filas.reduce((s, f) => s + f.gananciaUSD, 0)

  return (
    <AppShell
      titulo="Reporte"
      dato={<p className="text-[13px] text-[var(--fg-hero-soft)]">Datos al {fechaDatos}</p>}
    >
      <div className="mx-auto flex max-w-[860px] flex-col gap-7 print:max-w-none print:gap-5">
        {/* Barra de acciones (solo pantalla) */}
        <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
          <button type="button" onClick={() => window.print()} className={claseBotonSecundario}>
            Imprimir / guardar PDF
          </button>
          <a href="/api/csv" download className={claseBotonSecundario}>
            Descargar CSV
          </a>
        </div>

        {/* Masthead navy — también se imprime */}
        <header className="color-exacto overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-hero)] shadow-[var(--shadow-sm)] print:rounded-none print:shadow-none">
          <div className="px-6 pb-6 pt-7 sm:px-9">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-hero-muted)]">
                Mis Finanzas · Reporte de cartera
              </p>
              <p className="shrink-0 text-[11px] uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-hero-muted)]">
                {fechaLarga.format(hoy)}
              </p>
            </div>
            <h1 className="font-display mt-3 text-[28px] font-medium leading-tight tracking-[-0.01em] text-[var(--fg-on-hero)] sm:text-[32px]">
              Estado de la cartera
            </h1>
            <p className="mt-1 text-[13px] text-[var(--fg-hero-soft)]">
              Preparado para revisión con el asesor financiero · precios al {fechaDatos}
            </p>
          </div>
          {/* filete dorado */}
          <div
            aria-hidden="true"
            className="color-exacto h-[3px] w-full"
            style={{ background: 'var(--gold-500)' }}
          />
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-6 sm:grid-cols-3 sm:px-9">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-hero-muted)]">
                Patrimonio total
              </dt>
              <dd className="font-display mt-1.5 text-4xl font-medium leading-none tabular-nums text-[var(--fg-on-hero)]">
                {usdEntero.format(total)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-hero-muted)]">
                Rendimiento (M. Dietz{dietz ? ` desde ${fechaTabla.format(parseISO(dietz.desde))}` : ''})
              </dt>
              <dd
                className="font-display mt-1.5 text-4xl font-medium leading-none tabular-nums"
                style={{
                  color:
                    dietz && dietz.retorno < 0 ? 'var(--bad-on-hero)' : 'var(--good-on-hero)',
                }}
              >
                {dietz ? `${signo(dietz.retorno)}${pct.format(Math.abs(dietz.retorno))}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-hero-muted)]">
                Renta generada {anioActual}
              </dt>
              <dd className="font-display mt-1.5 text-4xl font-medium leading-none tabular-nums text-[var(--fg-on-hero)]">
                {usd.format(renta.total)}
              </dd>
            </div>
          </dl>
        </header>

        {/* Asignación en dos columnas */}
        <section aria-labelledby="asignacion" className="evitar-corte">
          <h2 id="asignacion" className="etiqueta mb-4">
            Asignación
          </h2>
          <div className="grid gap-7 sm:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-2)]">
                Por tipo de activo
              </h3>
              <ul className="flex flex-col gap-3">
                {porTipoVal.map(([tipo, valor]) => (
                  <FilaAsignacion
                    key={tipo}
                    nombre={NOMBRE_TIPO[tipo]}
                    valor={valor}
                    total={total}
                    color={COLOR_TIPO[tipo]}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-2)]">
                Por plataforma
              </h3>
              <ul className="flex flex-col gap-3">
                {porPlataformaVal.map(([nombre, valor], i) => (
                  <FilaAsignacion
                    key={nombre}
                    nombre={nombre}
                    valor={valor}
                    total={total}
                    color={COLORES_PLATAFORMA[i % COLORES_PLATAFORMA.length]}
                  />
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--fg-3)] tabular-nums">
            Exposición: {pct.format(total > 0 ? expo.variable / total : 0)} renta variable ·{' '}
            {pct.format(total > 0 ? expo.fija / total : 0)} renta fija ·{' '}
            {pct.format(total > 0 ? expo.liquido / total : 0)} líquido · 100% USD
          </p>
        </section>

        <hr className="border-0 border-t border-[var(--border-2)]" />

        {/* Posiciones */}
        <section aria-labelledby="posiciones">
          <h2 id="posiciones" className="etiqueta mb-4">
            Detalle de posiciones
          </h2>

          {filas.length === 0 ? (
            <EstadoVacio
              titulo="Sin posiciones para mostrar"
              detalle="Cuando cargues operaciones, el detalle va a aparecer acá."
            />
          ) : (
            <>
              {/* Variante cards (< md, solo pantalla) */}
              <ul className="flex flex-col gap-3 md:hidden print:hidden">
                {filas.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3 shadow-[var(--shadow-xs)]"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 break-words font-semibold text-[var(--fg-1)]">
                        {f.nombre}
                        {f.ticker && (
                          <span
                            translate="no"
                            className="font-mono ml-1.5 text-[11px] font-normal text-[var(--fg-3)]"
                          >
                            {f.ticker}
                          </span>
                        )}
                      </p>
                      <p className="shrink-0 text-[13px] text-[var(--fg-3)]">{f.plataforma}</p>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">Fecha</dt>
                        <dd className="tabular-nums text-[var(--fg-2)]">
                          {fechaTabla.format(parseISO(f.fecha))}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">Cantidad</dt>
                        <dd className="tabular-nums text-[var(--fg-2)]">
                          {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">Invertido</dt>
                        <dd className="tabular-nums text-[var(--fg-2)]">{usd.format(f.costoUSD)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">P. compra</dt>
                        <dd className="tabular-nums text-[var(--fg-2)]">
                          {usd.format(f.precioCompra)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">P. actual</dt>
                        <dd className="tabular-nums text-[var(--fg-2)]">
                          {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--fg-3)]">Valor</dt>
                        <dd className="tabular-nums font-semibold text-[var(--fg-1)]">
                          {usd.format(f.valorUSD)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 border-t border-[var(--border-1)] pt-2 text-right text-[13px]">
                      <Ganancia montoUSD={f.gananciaUSD} porcentaje={f.gananciaPct / 100} />
                    </p>
                  </li>
                ))}
              </ul>

              {/* Tabla (≥ md en pantalla; siempre en print) */}
              <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
                <table className="tabla-posiciones w-full min-w-[680px] border-collapse text-[12px] print:min-w-0">
                  <thead>
                    <tr className="border-b-2 border-[var(--navy-700)] text-left text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                      <th scope="col" className="py-2 pr-3">Activo</th>
                      <th scope="col" className="py-2 pr-3">Plataforma</th>
                      <th scope="col" className="py-2 pr-3 text-right">Fecha</th>
                      <th scope="col" className="py-2 pr-3 text-right">Cantidad</th>
                      <th scope="col" className="py-2 pr-3 text-right">Invertido</th>
                      <th scope="col" className="py-2 pr-3 text-right">P. compra</th>
                      <th scope="col" className="py-2 pr-3 text-right">P. actual</th>
                      <th scope="col" className="py-2 pr-3 text-right">Valor</th>
                      <th scope="col" className="py-2 text-right">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr
                        key={i}
                        className="color-exacto border-b border-[var(--border-1)] odd:bg-transparent even:bg-[var(--bg-sunken)]"
                      >
                        <td className="py-[7px] pl-1 pr-3 font-semibold text-[var(--fg-1)] whitespace-nowrap">
                          {f.nombre}
                          {f.ticker && (
                            <span
                              translate="no"
                              className="font-mono ml-1 text-[11px] font-normal text-[var(--fg-3)]"
                            >
                              {f.ticker}
                            </span>
                          )}
                        </td>
                        <td className="py-[7px] pr-3 text-[var(--fg-2)] whitespace-nowrap">
                          {f.plataforma}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums text-[var(--fg-2)] whitespace-nowrap">
                          {fechaTabla.format(parseISO(f.fecha))}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                          {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                          {usd.format(f.costoUSD)}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                          {usd.format(f.precioCompra)}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                          {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                        </td>
                        <td className="py-[7px] pr-3 text-right tabular-nums font-semibold text-[var(--fg-1)]">
                          {usd.format(f.valorUSD)}
                        </td>
                        <td className="py-[7px] pr-1 text-right text-[12px]">
                          <Ganancia montoUSD={f.gananciaUSD} porcentaje={f.gananciaPct / 100} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totValor > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-[var(--navy-700)] text-[13px] font-semibold text-[var(--fg-1)]">
                        <td className="py-2.5 pl-1 pr-3" colSpan={4}>
                          Total posiciones
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {usd.format(totInvertido)}
                        </td>
                        <td className="py-2.5 pr-3" colSpan={2} />
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {usd.format(totValor)}
                        </td>
                        <td className="py-2.5 pr-1 text-right text-[13px]">
                          <Ganancia
                            montoUSD={totGanancia}
                            porcentaje={totInvertido > 0 ? totGanancia / totInvertido : 0}
                          />
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-[var(--fg-3)]">
            El efectivo por plataforma no figura en el detalle; está incluido en la asignación y el
            patrimonio total.
          </p>
        </section>

        <hr className="border-0 border-t border-[var(--border-2)]" />

        {/* Renta generada */}
        <section aria-labelledby="renta" className="evitar-corte">
          <h2 id="renta" className="etiqueta mb-4">
            Renta generada en {anioActual}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-5 lg:grid-cols-5">
            {[
              { nombre: 'Interés del bono devengado', valor: renta.bonoDevengado },
              { nombre: 'Intereses cobrados', valor: renta.intereses },
              { nombre: 'Dividendos', valor: renta.dividendos },
              { nombre: 'Rendimientos cripto', valor: renta.rendimientos },
              { nombre: 'Resultado por ventas', valor: renta.ventas },
            ].map((r) => (
              <div
                key={r.nombre}
                className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3 print:bg-white"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
                  {r.nombre}
                </p>
                <p className="font-display mt-1.5 text-xl font-medium tabular-nums text-[var(--fg-1)]">
                  {usd.format(r.valor)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-[var(--fg-2)]">
            Total del año:{' '}
            <span className="font-display text-lg font-semibold tabular-nums text-[var(--fg-1)]">
              {usd.format(renta.total)}
            </span>
          </p>
        </section>

        <footer className="evitar-corte border-t border-[var(--border-2)] pt-4 text-[11px] leading-relaxed text-[var(--fg-3)]">
          <div className="flex items-baseline justify-between gap-4">
            <p>
              Generado por <span className="font-semibold text-[var(--fg-2)]">Mis Finanzas</span> ·
              datos al {fechaDatos}. Rendimiento calculado con Modified Dietz (aproximación de TWR)
              sobre el histórico de registros diarios.
            </p>
            <p aria-hidden="true" className="shrink-0 font-display italic text-[var(--fg-3)]">
              — PW
            </p>
          </div>
        </footer>
      </div>
    </AppShell>
  )
}

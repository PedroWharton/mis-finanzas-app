'use client'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { claseBotonSecundario } from '@/app/componentes/ui/campos'
import { Logo } from '@/app/componentes/ui/Logo'
import { Subrayado } from '@/app/componentes/ui/Marcador'
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
        <span className="min-w-0 break-words font-medium text-[var(--fg-1)]">
          <span
            aria-hidden="true"
            className="color-exacto mr-2 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: color }}
          />
          {nombre}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-[var(--fg-2)]">
          {usd.format(valor)} ·{' '}
          <span className="text-[var(--fg-1)]">{pct.format(proporcion)}</span>
        </span>
      </div>
      <div className="mt-1">
        <BarraInline proporcion={proporcion} color={color} />
      </div>
    </li>
  )
}

function Ganancia({
  montoUSD,
  porcentaje,
  apilado = false,
}: {
  montoUSD: number
  porcentaje: number
  apilado?: boolean
}) {
  return (
    <span
      className={`font-mono ${apilado ? 'inline-flex flex-col items-end leading-tight' : 'whitespace-nowrap'}`}
      style={{ color: montoUSD >= 0 ? 'var(--good)' : 'var(--bad)' }}
    >
      <span className="whitespace-nowrap">
        {signo(montoUSD)}
        {usd.format(Math.abs(montoUSD))}
      </span>
      <span className={`whitespace-nowrap text-[0.9em] font-normal ${apilado ? '' : 'ml-1'}`}>
        {apilado ? '' : '('}
        {signo(montoUSD)}
        {pct.format(Math.abs(porcentaje))}
        {apilado ? '' : ')'}
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

  const kpiNota = 'mt-2 text-[12px] leading-snug text-[var(--fg-3)]'
  const kpiValor = 'font-display mt-2 text-[32px] font-medium leading-none tracking-[-0.02em] sm:text-[36px] print:text-[26px]'
  const tituloSeccion = 'titulo-seccion print:text-[17px]'
  const subtitulo = 'mb-3 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]'
  const th = 'py-2 pr-3 text-[10px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]'

  return (
    <AppShell
      titulo="Reporte"
      dato={<p className="text-[15px] text-[var(--fg-2)]">Datos al {fechaDatos}</p>}
    >
      <div className="mx-auto flex max-w-[940px] flex-col gap-5 print:max-w-none">
        {/* Barra de acciones (solo pantalla) */}
        <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
          <button type="button" onClick={() => window.print()} className={claseBotonSecundario}>
            Imprimir o guardar PDF
          </button>
          <a href="/api/csv" download className={claseBotonSecundario}>
            Descargar CSV
          </a>
        </div>

        {/* La hoja: en escritorio se ve como un documento sobre la mesa; en
            el celular y en papel, sin marco. */}
        <article className="flex flex-col gap-10 md:rounded-[var(--radius-lg)] md:border md:border-[var(--border-1)] md:bg-[var(--bg-surface)] md:px-14 md:py-12 md:shadow-[var(--shadow-sm)] print:gap-7 print:border-0 print:p-0 print:shadow-none">
          {/* Membrete */}
          <header className="evitar-corte">
            <div className="flex items-baseline justify-between gap-4">
              <p className="flex min-w-0 items-center gap-2.5 text-[13px] text-[var(--fg-2)]">
                <Logo size={28} className="color-exacto" />
                <span className="font-display text-[16px] font-medium text-[var(--fg-1)]">Mis Finanzas</span>
                <span className="hidden sm:inline print:inline">
                  <span className="mx-2 text-[var(--border-2)]" aria-hidden="true">|</span>
                  Reporte de cartera
                </span>
              </p>
              <p className="shrink-0 font-mono text-[12px] text-[var(--fg-2)]">{fechaLarga.format(hoy)}</p>
            </div>
            <div aria-hidden="true" className="filete-dorado color-exacto mt-3" />
            <h2 className="font-display mt-8 text-[30px] font-medium leading-tight tracking-[-0.015em] text-[var(--fg-1)] sm:text-[38px] print:mt-6 print:text-[30px]">
              Estado de la cartera
            </h2>
            <p className="mt-2 max-w-[60ch] text-[14px] text-[var(--fg-2)]">
              Preparado para revisión con el asesor financiero. Precios al {fechaDatos}.
            </p>

            <dl className="mt-8 grid grid-cols-1 border-y border-[var(--border-2)] sm:grid-cols-3 print:mt-6 print:grid-cols-3">
              <div className="py-5 sm:pr-6 print:py-4 print:pr-5">
                <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">Patrimonio total</dt>
                <dd className={`${kpiValor} text-[var(--fg-1)]`}>
                  <Subrayado>{usdEntero.format(total)}</Subrayado>
                </dd>
              </div>
              <div className="border-t border-[var(--border-1)] py-5 sm:border-l sm:border-t-0 sm:px-6 print:border-l print:border-t-0 print:px-5 print:py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">Rendimiento</dt>
                <dd
                  className={kpiValor}
                  style={{ color: !dietz ? 'var(--fg-3)' : dietz.retorno < 0 ? 'var(--bad)' : 'var(--good)' }}
                >
                  {dietz ? `${signo(dietz.retorno)}${pct.format(Math.abs(dietz.retorno))}` : '—'}
                </dd>
                <dd className={kpiNota}>
                  {dietz
                    ? `Modified Dietz desde el ${fechaTabla.format(parseISO(dietz.desde))}`
                    : 'Sin registros diarios suficientes para calcularlo'}
                </dd>
              </div>
              <div className="border-t border-[var(--border-1)] py-5 sm:border-l sm:border-t-0 sm:pl-6 print:border-l print:border-t-0 print:py-4 print:pl-5">
                <dt className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)]">Renta generada en {anioActual}</dt>
                <dd className={`${kpiValor} text-[var(--fg-1)]`}>{usd.format(renta.total)}</dd>
              </div>
            </dl>
          </header>

          {/* Asignación en dos columnas */}
          <section aria-labelledby="asignacion" className="evitar-corte">
            <h2 id="asignacion" className={`${tituloSeccion} mb-5`}>
              Asignación
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 print:grid-cols-2 print:gap-8">
              <div>
                <h3 className={subtitulo}>Por tipo de activo</h3>
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
                <h3 className={subtitulo}>Por plataforma</h3>
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
            <p className="mt-5 text-[13px] text-[var(--fg-2)]">
              Exposición: {pct.format(total > 0 ? expo.variable / total : 0)} renta variable,{' '}
              {pct.format(total > 0 ? expo.fija / total : 0)} renta fija y{' '}
              {pct.format(total > 0 ? expo.liquido / total : 0)} líquido. Todo en USD.
            </p>
          </section>

          {/* Posiciones */}
          <section aria-labelledby="posiciones">
            <h2 id="posiciones" className={`${tituloSeccion} mb-4`}>
              Detalle de posiciones
            </h2>

            {filas.length === 0 ? (
              <EstadoVacio
                titulo="Sin posiciones para mostrar"
                detalle="Cuando cargues operaciones en Movimientos, el detalle va a aparecer acá."
              />
            ) : (
              <>
                {/* Variante lista (< md, solo pantalla) */}
                <ul className="flex flex-col border-y border-[var(--border-2)] md:hidden print:hidden">
                  {filas.map((f, i) => (
                    <li key={i} className="border-b border-[var(--border-1)] py-3.5 last:border-b-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 break-words font-medium text-[var(--fg-1)]">
                          {f.nombre}
                          {f.ticker && (
                            <span translate="no" className="font-mono ml-1.5 text-[11px] font-normal text-[var(--fg-3)]">
                              {f.ticker}
                            </span>
                          )}
                        </p>
                        <p className="shrink-0 font-mono text-[14px] text-[var(--fg-1)]">{usd.format(f.valorUSD)}</p>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px]">
                        <p className="text-[var(--fg-3)]">
                          {f.plataforma} · desde {fechaTabla.format(parseISO(f.fecha))}
                        </p>
                        <Ganancia montoUSD={f.gananciaUSD} porcentaje={f.gananciaPct / 100} />
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-[13px]">
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--fg-3)]">Invertido</dt>
                          <dd className="font-mono text-[12px] text-[var(--fg-2)]">{usd.format(f.costoUSD)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--fg-3)]">Cantidad</dt>
                          <dd className="font-mono text-[12px] text-[var(--fg-2)]">
                            {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--fg-3)]">P. compra</dt>
                          <dd className="font-mono text-[12px] text-[var(--fg-2)]">{usd.format(f.precioCompra)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--fg-3)]">P. actual</dt>
                          <dd className="font-mono text-[12px] text-[var(--fg-2)]">
                            {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                  {totValor > 0 && (
                    <li className="flex items-baseline justify-between gap-3 border-t-2 border-[var(--rule-strong)] py-3 font-semibold text-[var(--fg-1)]">
                      <span>Total posiciones</span>
                      <span className="text-right">
                        <span className="block font-mono">{usd.format(totValor)}</span>
                        <span className="text-[13px]">
                          <Ganancia
                            montoUSD={totGanancia}
                            porcentaje={totInvertido > 0 ? totGanancia / totInvertido : 0}
                          />
                        </span>
                      </span>
                    </li>
                  )}
                </ul>

                {/* Tabla (≥ md en pantalla; siempre en print) */}
                <div className="hidden md:block print:block">
                  <table className="tabla-posiciones w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b-2 border-[var(--rule-strong)] text-left">
                        <th scope="col" className={th}>Activo</th>
                        <th scope="col" className={th}>Plataforma</th>
                        <th scope="col" className={`${th} text-right`}>Fecha</th>
                        <th scope="col" className={`${th} text-right`}>Cantidad</th>
                        <th scope="col" className={`${th} text-right`}>Invertido</th>
                        <th scope="col" className={`${th} text-right`}>P. compra</th>
                        <th scope="col" className={`${th} text-right`}>P. actual</th>
                        <th scope="col" className={`${th} text-right`}>Valor</th>
                        <th scope="col" className={`${th} pr-0 text-right`}>Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => (
                        <tr key={i} className="border-b border-[var(--border-1)] align-top">
                          <th scope="row" className="py-2 pr-3 text-left font-medium text-[var(--fg-1)]">
                            {f.nombre}
                            {f.ticker && (
                              <span translate="no" className="font-mono block text-[11px] font-normal text-[var(--fg-3)]">
                                {f.ticker}
                              </span>
                            )}
                          </th>
                          <td className="py-2 pr-3 text-[var(--fg-2)] whitespace-nowrap">{f.plataforma}</td>
                          <td className="py-2 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)] whitespace-nowrap">
                            {fechaTabla.format(parseISO(f.fecha))}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)]">
                            {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)] whitespace-nowrap">
                            {usd.format(f.costoUSD)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)] whitespace-nowrap">
                            {usd.format(f.precioCompra)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)] whitespace-nowrap">
                            {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[13px] text-[var(--fg-1)] whitespace-nowrap">
                            {usd.format(f.valorUSD)}
                          </td>
                          <td className="py-2 pr-0 text-right">
                            <Ganancia apilado montoUSD={f.gananciaUSD} porcentaje={f.gananciaPct / 100} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {totValor > 0 && (
                      // En papel, el total va una sola vez al final (no se repite por hoja).
                      <tfoot className="print:[display:table-row-group]">
                        <tr className="border-t-2 border-[var(--rule-strong)] align-top font-semibold text-[var(--fg-1)]">
                          <th scope="row" className="py-2.5 pr-3 text-left" colSpan={4}>
                            Total posiciones
                          </th>
                          <td className="py-2.5 pr-3 text-right font-mono whitespace-nowrap">
                            {usd.format(totInvertido)}
                          </td>
                          <td className="py-2.5 pr-3" colSpan={2} />
                          <td className="py-2.5 pr-3 text-right font-mono whitespace-nowrap">
                            {usd.format(totValor)}
                          </td>
                          <td className="py-2.5 pr-0 text-right">
                            <Ganancia
                              apilado
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
            <p className="mt-3 text-[12px] text-[var(--fg-3)]">
              El efectivo por plataforma no figura en el detalle; está incluido en la asignación y el
              patrimonio total.
            </p>
          </section>

          {/* Renta generada: estado de cuenta, no tarjetas */}
          <section aria-labelledby="renta" className="evitar-corte">
            <h2 id="renta" className={`${tituloSeccion} mb-4`}>
              Renta generada en {anioActual}
            </h2>
            <table className="w-full max-w-[460px] border-collapse text-[14px] print:text-[12px]">
              <tbody>
                {[
                  { nombre: 'Interés del bono devengado', valor: renta.bonoDevengado },
                  { nombre: 'Intereses cobrados', valor: renta.intereses },
                  { nombre: 'Dividendos', valor: renta.dividendos },
                  { nombre: 'Rendimientos cripto', valor: renta.rendimientos },
                  { nombre: 'Resultado por ventas', valor: renta.ventas },
                ].map((r) => (
                  <tr key={r.nombre} className="border-b border-[var(--border-1)]">
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-[var(--fg-2)]">
                      {r.nombre}
                    </th>
                    <td
                      className={`py-2 text-right font-mono text-[13px] ${r.valor === 0 ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}
                    >
                      {usd.format(r.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-strong)]">
                  <th scope="row" className="py-2.5 pr-4 text-left font-semibold text-[var(--fg-1)]">
                    Total del año
                  </th>
                  <td className="font-display py-2.5 text-right text-[20px] font-medium text-[var(--fg-1)] print:text-[15px]">
                    {usd.format(renta.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <footer className="evitar-corte border-t border-[var(--border-2)] pt-4 text-[12px] leading-relaxed text-[var(--fg-3)] print:text-[10px]">
            <div className="flex items-baseline justify-between gap-4">
              <p className="max-w-[80ch]">
                Generado por <span className="font-semibold text-[var(--fg-2)]">Mis Finanzas</span> con
                datos al {fechaDatos}. Rendimiento calculado con Modified Dietz (aproximación de TWR)
                sobre el histórico de registros diarios.
              </p>
              <p aria-hidden="true" className="shrink-0 font-display italic text-[var(--fg-3)]">
                — PW
              </p>
            </div>
          </footer>
        </article>
      </div>
    </AppShell>
  )
}

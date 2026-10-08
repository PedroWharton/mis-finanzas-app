'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { AppShell } from '@/app/componentes/AppShell'
import { Panel, Swatch } from '@/app/componentes/ui/Panel'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { claseBotonSecundario } from '@/app/componentes/ui/campos'
import {
  usd,
  usdEntero,
  pct,
  fechaLarga,
  fechaCorta,
  fechaTabla,
  parseISO,
  signo,
} from '@/app/componentes/ui/formatters'
import { PROPOSITO, COLORES_PLATAFORMA } from '@/app/componentes/ui/colores'
import { totalUSD, porPlataforma, porTipo, filasTabla } from '@/lib/calculos'
import { ordenarFilas, type ColumnaOrden } from '@/lib/orden'
import {
  serieAportes,
  aportesNetosEntre,
  rentaDelAnio,
  modifiedDietz,
  exposicion,
  gananciaRealizadaPorPlataforma,
} from '@/lib/analitica'
import type { Dolar } from '@/lib/dolar'
import type { Portfolio, Precios, Snapshot, TipoActivo } from '@/lib/tipos'

const arsEntero = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

interface Columna {
  label: string
  col: ColumnaOrden | null
  align: 'left' | 'right'
}

const COLUMNAS: Columna[] = [
  { label: 'Activo', col: 'nombre', align: 'left' },
  { label: 'Plataforma', col: 'plataforma', align: 'left' },
  { label: 'Fecha', col: 'fecha', align: 'right' },
  { label: 'Cantidad', col: 'cantidad', align: 'right' },
  { label: 'Invertido', col: 'costoUSD', align: 'right' },
  { label: 'P. compra', col: 'precioCompra', align: 'right' },
  { label: 'P. actual', col: 'precioActual', align: 'right' },
  { label: 'Hoy', col: null, align: 'right' },
  { label: 'Valor', col: 'valorUSD', align: 'right' },
  { label: 'Ganancia', col: 'gananciaUSD', align: 'right' },
]

function colorVariacion(v: number | undefined): string {
  if (v === undefined) return 'var(--fg-3)'
  return v >= 0 ? 'var(--good)' : 'var(--bad)'
}

function VariacionDia({ v, className = '' }: { v: number | undefined; className?: string }) {
  if (v === undefined) {
    return <span className={`tabular-nums text-[var(--fg-3)] ${className}`}>—</span>
  }
  return (
    <span className={`tabular-nums font-semibold ${className}`} style={{ color: colorVariacion(v) }}>
      {signo(v)}
      {pct.format(Math.abs(v) / 100)}
    </span>
  )
}

export default function Home() {
  const [pf, setPf] = useState<Portfolio | null>(null)
  const [precios, setPrecios] = useState<Precios>({})
  const [variaciones, setVariaciones] = useState<Record<string, number>>({})
  const [desactualizado, setDesactualizado] = useState(false)
  const [fechaPrecios, setFechaPrecios] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [dolar, setDolar] = useState<Dolar | null>(null)
  const [enPesos, setEnPesos] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [orden, setOrden] = useState<{ col: ColumnaOrden; dir: 'asc' | 'desc' }>({
    col: 'plataforma',
    dir: 'asc',
  })

  useEffect(() => {
    (async () => {
      try {
        // data y prices no dependen entre sí: se piden en paralelo.
        const [data, p] = await Promise.all([
          fetch('/api/data').then((r) => r.json()),
          fetch('/api/prices').then((r) => r.json()),
        ])
        setPf(data.portfolio)
        setSnapshots(data.snapshots)
        setPrecios(p.precios)
        setVariaciones(p.variaciones ?? {})
        setDesactualizado(p.desactualizado)
        setFechaPrecios(p.fecha)
        // El snapshot del día se registra después de tener data + precios.
        const s = await (await fetch('/api/snapshot', { method: 'POST' })).json()
        setSnapshots(s.snapshots)
      } catch {
        setFallo(true)
      }
      // La cotización del peso es un extra: si falla, el toggle no aparece.
      try {
        const d = (await (await fetch('/api/dolar')).json()) as { dolar: Dolar | null }
        setDolar(d.dolar)
      } catch {
        console.warn('dolar: no se pudo obtener la cotización')
      }
    })()
  }, [])

  const hoy = useMemo(() => new Date(), [])

  const total = pf ? totalUSD(pf, precios, hoy) : 0
  const ops = pf?.operaciones ?? []
  const snapAnterior = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  // La variación descuenta depósitos/retiros posteriores al registro anterior:
  // plata que entró no es ganancia.
  const variacionUSD =
    snapAnterior !== null
      ? total - snapAnterior.totalUSD - aportesNetosEntre(ops, snapAnterior.fecha, hoyISO)
      : null
  const variacionPct =
    variacionUSD !== null && snapAnterior !== null && snapAnterior.totalUSD !== 0
      ? variacionUSD / snapAnterior.totalUSD
      : null
  const esGanancia = variacionUSD !== null && variacionUSD >= 0

  const filas = pf ? filasTabla(pf, precios, hoy) : []
  const filasOrdenadas = ordenarFilas(filas, orden.col, orden.dir)

  const tickersConDato = filas
    .map((f) => (f.ticker ? variaciones[f.ticker] : undefined))
    .filter((v): v is number => typeof v === 'number')
  const maxAbsVariacion = tickersConDato.length > 0 ? Math.max(...tickersConDato.map((v) => Math.abs(v))) : 0
  const tickerTopMover =
    tickersConDato.length > 0
      ? filas.find((f) => f.ticker && typeof variaciones[f.ticker] === 'number' && Math.abs(variaciones[f.ticker]) === maxAbsVariacion)?.ticker
      : undefined

  function alternarOrden(col: ColumnaOrden) {
    setOrden((actual) =>
      actual.col === col
        ? { col, dir: actual.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )
  }

  const realizadas = gananciaRealizadaPorPlataforma(ops)
  const plataformas = pf
    ? Object.entries(porPlataforma(pf, precios, hoy)).map(([nombre, valor], i) => {
        const propias = filas.filter((f) => f.plataforma === nombre)
        const invertido = propias.reduce((s, f) => s + f.costoUSD, 0)
        const ganancia = propias.reduce((s, f) => s + f.gananciaUSD, 0)
        const realizada = realizadas[nombre] ?? 0
        const efectivo = pf.plataformas.find((p) => p.nombre === nombre)?.efectivoUSD ?? 0
        return { nombre, valor, invertido, ganancia, realizada, efectivo, color: COLORES_PLATAFORMA[i % COLORES_PLATAFORMA.length] }
      })
    : []

  const propositos = pf
    ? (Object.entries(porTipo(pf, precios, hoy)) as [TipoActivo, number][])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
    : []

  // Agregado por activo (BTC en Nexo + Binance = una sola fila), % sobre el patrimonio total
  const porActivo = Object.values(
    filas.reduce<Record<string, { nombre: string; ticker: string; tipo: TipoActivo; valorUSD: number; plataformas: string[] }>>(
      (acc, f) => {
        const clave = f.ticker || f.nombre
        if (!acc[clave]) {
          acc[clave] = { nombre: f.nombre, ticker: f.ticker, tipo: f.tipo, valorUSD: 0, plataformas: [] }
        }
        acc[clave].valorUSD += f.valorUSD
        if (!acc[clave].plataformas.includes(f.plataforma)) acc[clave].plataformas.push(f.plataforma)
        return acc
      },
      {}
    )
  ).sort((a, b) => b.valorUSD - a.valorUSD)
  const maxActivo = porActivo.length > 0 ? porActivo[0].valorUSD : 0

  const aportesSerie = serieAportes(ops, snapshots.map((s) => s.fecha))
  const datosArea = snapshots.map((s, i) => ({
    fecha: fechaCorta.format(parseISO(s.fecha)),
    total: s.totalUSD,
    aportado: aportesSerie[i],
  }))

  const anioActual = hoy.getFullYear()
  const renta = pf ? rentaDelAnio(ops, pf, anioActual, hoy) : null
  const dietz = modifiedDietz(snapshots, ops)
  const expo = pf ? exposicion(pf, precios, hoy) : null

  const hero = pf ? (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span className="font-display text-5xl sm:text-[64px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[var(--fg-on-hero)]">
          {enPesos && dolar ? arsEntero.format(total * dolar.valor) : usdEntero.format(total)}
        </span>
        {variacionUSD !== null && (
          <span className="text-[15px] font-semibold tabular-nums">
            <span style={{ color: esGanancia ? 'var(--good-on-hero)' : 'var(--bad-on-hero)' }}>
              {signo(variacionUSD)}
              {usd.format(Math.abs(variacionUSD))}
              {variacionPct !== null && ` (${pct.format(Math.abs(variacionPct))})`}
            </span>{' '}
            <span className="font-normal text-[var(--fg-hero-muted)]">vs. último registro, sin contar aportes</span>
          </span>
        )}
      </div>
      <p aria-live="polite" className="mt-[14px] flex items-center gap-1.5 text-[13px] text-[var(--fg-hero-soft)]">
        <span
          aria-hidden="true"
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{ background: desactualizado ? 'var(--bordeaux-500)' : 'var(--gold-500)' }}
        />
        {desactualizado
          ? `Precios desactualizados · ${fechaPrecios ? fechaLarga.format(parseISO(fechaPrecios)) : 'sin fecha'}`
          : `Precios al día · ${fechaPrecios ? fechaLarga.format(parseISO(fechaPrecios)) : fechaLarga.format(hoy)}`}
      </p>
      {dolar && (
        <p className="mt-2 text-[13px] text-[var(--fg-hero-soft)]">
          <button
            type="button"
            onClick={() => setEnPesos((v) => !v)}
            aria-pressed={enPesos}
            className="font-semibold text-[var(--fg-hero-muted)] underline decoration-[var(--navy-400)] underline-offset-2 transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-on-hero)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            {enPesos ? 'Ver en dólares' : 'Ver en pesos'}
          </button>{' '}
          <span className="tabular-nums">
            · dólar {dolar.nombre} {arsEntero.format(dolar.valor)}
          </span>
        </p>
      )}
    </div>
  ) : undefined

  return (
    <AppShell titulo="Inicio" ancha dato={hero}>
      {fallo ? (
        <EstadoVacio
          titulo="No pudimos cargar tus datos"
          detalle="Falló la conexión con el servidor. Recargá la página para volver a intentar."
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
      ) : !pf ? (
        <SkeletonPagina paneles={4} />
      ) : (
        <div className="flex flex-col gap-7">
          <div className="revela">
            <Panel titulo="Evolución del patrimonio">
              <div
                className="h-60"
                role="img"
                aria-label="Evolución del patrimonio: serie de registros diarios del valor total y del capital aportado, en USD"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={datosArea} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-1)" vertical={false} />
                    <XAxis
                      dataKey="fecha"
                      stroke="var(--border-2)"
                      tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono-wb)' }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--border-2)"
                      tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono-wb)' }}
                      tickLine={false}
                      tickFormatter={(v: number) => usdEntero.format(v)}
                      width={68}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(value, name) => [usd.format(Number(value)), name === 'total' ? 'Valor' : 'Aportado']}
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-1)',
                        borderRadius: 6,
                        color: 'var(--fg-1)',
                        fontSize: 12,
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={24}
                      wrapperStyle={{ fontSize: 12, color: 'var(--fg-3)' }}
                      formatter={(value) => (value === 'total' ? 'Valor' : 'Aportado')}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="total"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#navy)"
                      dot={{ r: 4.5, fill: 'var(--chart-1)', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="aportado"
                      name="aportado"
                      stroke="var(--gold-500)"
                      strokeWidth={1.25}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-[14px] text-xs text-[var(--fg-3)]">
                La curva se dibuja sola: un registro automático por día (y otro cada vez que abrís el panel).
              </p>
            </Panel>
          </div>

          <section
            className="panel-wb revela"
            style={{ animationDelay: '60ms' }}
            aria-labelledby="donde"
          >
            <div className="panel-cabecera">
              <h2 id="donde" className="etiqueta mb-4">¿Dónde está la plata?</h2>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {plataformas.map((p) => (
                <article
                  key={p.nombre}
                  className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] px-6 py-5 shadow-[var(--shadow-xs)] min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <Swatch color={p.color} />
                    <h3 className="text-[13px] font-semibold text-[var(--fg-2)] break-words">{p.nombre}</h3>
                  </div>
                  <p className="font-display mt-2.5 text-[28px] font-semibold leading-[1.1] tabular-nums text-[var(--fg-1)]">
                    {usd.format(p.valor)}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--fg-3)] tabular-nums">
                    {pct.format(total > 0 ? p.valor / total : 0)} del total
                    {p.efectivo > 0 && p.invertido > 0 && ` · ${usd.format(p.efectivo)} líquido`}
                  </p>
                  <p
                    className="mt-2.5 text-[13px] font-semibold tabular-nums"
                    style={{
                      color:
                        p.invertido === 0 && p.realizada === 0
                          ? 'var(--fg-3)'
                          : p.ganancia + p.realizada >= 0
                            ? 'var(--good)'
                            : 'var(--bad)',
                    }}
                  >
                    {p.invertido === 0 && p.realizada === 0
                      ? 'Ahorro sin inversión'
                      : `${signo(p.ganancia)}${usd.format(Math.abs(p.ganancia))} desde la compra` +
                        (p.realizada !== 0
                          ? ` · ${signo(p.realizada)}${usd.format(Math.abs(p.realizada))} realizadas`
                          : '')}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <div className="revela" style={{ animationDelay: '120ms' }}>
            <Panel titulo="¿Para qué la trabajo?">
              <div
                className="flex h-3 w-full overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border-1)]"
                role="img"
                aria-label={`Asignación: ${propositos
                  .map(([t, v]) => `${PROPOSITO[t].nombre} ${pct.format(v / total)}`)
                  .join(', ')}`}
              >
                {propositos.map(([tipo, valor]) => (
                  <div
                    key={tipo}
                    className="h-full"
                    style={{ width: `${(valor / total) * 100}%`, background: PROPOSITO[tipo].color }}
                  />
                ))}
              </div>
              <ul className="mt-[18px] grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                {propositos.map(([tipo, valor]) => (
                  <li key={tipo} className="flex items-start gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="mt-[5px] h-[9px] w-[9px] shrink-0 rounded-[var(--radius-xs)]"
                      style={{ background: PROPOSITO[tipo].color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--fg-1)] break-words">
                        {PROPOSITO[tipo].nombre}{' '}
                        <span className="font-normal tabular-nums text-[var(--fg-2)]">
                          {usd.format(valor)} · {pct.format(valor / total)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--fg-3)] break-words">{PROPOSITO[tipo].detalle}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-[14px] text-xs text-[var(--fg-3)]">
                Rendimiento (Modified Dietz) desde{' '}
                {dietz ? fechaLarga.format(parseISO(dietz.desde)) : '—'}:{' '}
                {dietz ? (
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: dietz.retorno >= 0 ? 'var(--good)' : 'var(--bad)' }}
                  >
                    {signo(dietz.retorno)}
                    {pct.format(Math.abs(dietz.retorno))}
                  </span>
                ) : (
                  '—'
                )}
              </p>
              {expo && total > 0 && (
                <p className="mt-1 text-xs text-[var(--fg-3)] tabular-nums">
                  Exposición: {pct.format(expo.variable / total)} variable · {pct.format(expo.fija / total)} fija ·{' '}
                  {pct.format(expo.liquido / total)} líquido · 100% USD
                </p>
              )}

              <h3 className="etiqueta mt-7 mb-4">% por activo</h3>
              <ul className="flex flex-col gap-3.5">
                {porActivo.map((a) => {
                  const proporcion = total > 0 ? a.valorUSD / total : 0
                  return (
                    <li key={a.ticker || a.nombre} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 break-words text-sm font-semibold text-[var(--fg-1)]">
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block h-2 w-2 rounded-[var(--radius-xs)] align-middle"
                            style={{ background: PROPOSITO[a.tipo].color }}
                          />
                          {a.nombre}
                          {a.ticker && (
                            <span translate="no" className="font-mono ml-1.5 text-xs font-normal text-[var(--fg-3)]">
                              {a.ticker}
                            </span>
                          )}
                          {a.plataformas.length > 1 && (
                            <span className="ml-1.5 text-xs font-normal text-[var(--fg-3)]">
                              ({a.plataformas.join(' + ')})
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-[var(--fg-2)]">
                          {usd.format(a.valorUSD)} ·{' '}
                          <span className="font-semibold text-[var(--fg-1)]">{pct.format(proporcion)}</span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]"
                        role="img"
                        aria-label={`${a.nombre}: ${pct.format(proporcion)} del patrimonio`}
                      >
                        <div
                          className="h-full rounded-[var(--radius-pill)]"
                          style={{
                            width: `${maxActivo > 0 ? (a.valorUSD / maxActivo) * 100 : 0}%`,
                            background: PROPOSITO[a.tipo].color,
                          }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-[14px] text-xs text-[var(--fg-3)]">
                Porcentaje sobre el patrimonio total; las barras son relativas a tu posición más grande.
              </p>
            </Panel>
          </div>

          {renta && (
            <div className="revela" style={{ animationDelay: '180ms' }}>
              <Panel titulo="Renta generada">
                <p className="font-display text-4xl font-semibold tabular-nums text-[var(--fg-1)]">
                  {usd.format(renta.total)}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-3)]">
                  Acumulado en {anioActual}, incluye el interés del bono devengado a la fecha y el
                  resultado de las ventas.
                </p>
                <ul className="mt-[18px] flex flex-col gap-2">
                  {(
                    [
                      ['Interés del bono devengado', renta.bonoDevengado],
                      ['Intereses cobrados', renta.intereses],
                      ['Dividendos', renta.dividendos],
                      ['Rendimientos cripto', renta.rendimientos],
                      ['Resultado por ventas', renta.ventas],
                    ] as const
                  ).map(([label, valor]) => (
                    <li key={label} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-[var(--fg-2)]">{label}</span>
                      <span className="tabular-nums font-semibold text-[var(--fg-1)]">{usd.format(valor)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}

          <div className="revela" style={{ animationDelay: '240ms' }}>
            <Panel titulo="Posiciones">
              {/* Cards en mobile — mismos datos y mismo orden que la tabla. */}
              <ul className="flex flex-col gap-2.5 md:hidden">
                {filasOrdenadas.map((f) => {
                  const gana = f.gananciaUSD >= 0
                  const color = plataformas.find((p) => p.nombre === f.plataforma)?.color
                  const variacion = f.ticker ? variaciones[f.ticker] : undefined
                  const esMovida = typeof variacion === 'number' && (Math.abs(variacion) >= 2 || f.ticker === tickerTopMover)
                  const esTop = f.ticker && f.ticker === tickerTopMover
                  return (
                    <li
                      key={`${f.plataforma}-${f.ticker || f.nombre}`}
                      className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3.5 shadow-[var(--shadow-xs)]"
                      style={esMovida ? { borderLeft: '3px solid var(--gold-500)' } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 break-words font-semibold text-[var(--fg-1)]">
                          {f.nombre}
                          {f.ticker && (
                            <span translate="no" className="font-mono ml-1 text-xs font-normal text-[var(--fg-3)]">
                              {f.ticker}
                            </span>
                          )}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--fg-3)]">
                          <Swatch color={color ?? 'var(--fg-3)'} />
                          {f.plataforma}
                        </span>
                      </div>
                      {esTop && (
                        <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--gold-700)' }}>
                          {(variacion as number) >= 0 ? '▲' : '▼'} más movida del día
                        </p>
                      )}
                      <p className="font-display mt-2 text-[26px] font-semibold leading-none tabular-nums text-[var(--fg-1)]">
                        {usd.format(f.valorUSD)}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">Fecha</dt>
                          <dd className="mt-0.5 text-[var(--fg-2)]">{fechaTabla.format(parseISO(f.fecha))}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">Cantidad</dt>
                          <dd className="mt-0.5 text-[var(--fg-2)]">
                            {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">Invertido</dt>
                          <dd className="mt-0.5 text-[var(--fg-2)]">{usd.format(f.costoUSD)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">P. compra</dt>
                          <dd className="mt-0.5 text-[var(--fg-2)]">{usd.format(f.precioCompra)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">P. actual</dt>
                          <dd className="mt-0.5 text-[var(--fg-2)]">
                            {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">Hoy</dt>
                          <dd className="mt-0.5">
                            <VariacionDia v={variacion} />
                          </dd>
                        </div>
                      </dl>
                      <p
                        className="mt-3 text-[13px] font-semibold tabular-nums"
                        style={{ color: gana ? 'var(--good)' : 'var(--bad)' }}
                      >
                        {signo(f.gananciaUSD)}
                        {usd.format(Math.abs(f.gananciaUSD))} ({signo(f.gananciaUSD)}
                        {pct.format(Math.abs(f.gananciaPct) / 100)}) desde la compra
                      </p>
                    </li>
                  )
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {COLUMNAS.map((c, i) => {
                        const activa = c.col !== null && orden.col === c.col
                        const ariaSort = activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                        return (
                          <th
                            key={c.label}
                            scope="col"
                            aria-sort={c.col !== null ? ariaSort : undefined}
                            className={`pb-2.5 border-b border-[var(--border-2)] ${
                              c.align === 'left' ? 'text-left' : 'text-right'
                            } ${i < COLUMNAS.length - 1 ? 'pr-3' : ''}`}
                          >
                            {c.col === null ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--fg-3)]">
                                {c.label}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => alternarOrden(c.col as ColumnaOrden)}
                                className={`inline-flex min-h-11 items-center gap-1 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--fg-3)] rounded-[var(--radius-xs)] transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                                  c.align === 'right' ? 'flex-row-reverse' : ''
                                }`}
                              >
                                {c.label}
                                {activa && <span aria-hidden="true">{orden.dir === 'asc' ? '▲' : '▼'}</span>}
                              </button>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filasOrdenadas.map((f) => {
                      const gana = f.gananciaUSD >= 0
                      const color = plataformas.find((p) => p.nombre === f.plataforma)?.color
                      const variacion = f.ticker ? variaciones[f.ticker] : undefined
                      return (
                        <tr
                          key={`${f.plataforma}-${f.ticker || f.nombre}`}
                          className="border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--bg-sunken)] transition-colors duration-[var(--dur-base)]"
                        >
                          <td className="py-[11px] pr-3 font-semibold text-[var(--fg-1)] whitespace-nowrap">
                            {f.nombre}
                            {f.ticker && (
                              <span translate="no" className="font-mono ml-1 text-xs font-normal text-[var(--fg-3)]">
                                {f.ticker}
                              </span>
                            )}
                          </td>
                          <td className="py-[11px] pr-3 text-[var(--fg-2)] whitespace-nowrap">
                            <span className="inline-flex items-center gap-[7px]">
                              <Swatch color={color ?? 'var(--fg-3)'} />
                              {f.plataforma}
                            </span>
                          </td>
                          <td className="py-[11px] pr-3 text-right tabular-nums text-[var(--fg-2)] whitespace-nowrap">
                            {fechaTabla.format(parseISO(f.fecha))}
                          </td>
                          <td className="py-[11px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                            {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                          </td>
                          <td className="py-[11px] pr-3 text-right tabular-nums text-[var(--fg-2)]">{usd.format(f.costoUSD)}</td>
                          <td className="py-[11px] pr-3 text-right tabular-nums text-[var(--fg-2)]">{usd.format(f.precioCompra)}</td>
                          <td className="py-[11px] pr-3 text-right tabular-nums text-[var(--fg-2)]">
                            {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                          </td>
                          <td className="py-[11px] pr-3 text-right">
                            <VariacionDia v={variacion} />
                          </td>
                          <td className="py-[11px] pr-3 text-right tabular-nums font-semibold text-[var(--fg-1)]">
                            {usd.format(f.valorUSD)}
                          </td>
                          <td
                            className="py-[11px] pr-0 text-right tabular-nums font-semibold whitespace-nowrap"
                            style={{ color: gana ? 'var(--good)' : 'var(--bad)' }}
                          >
                            {signo(f.gananciaUSD)}
                            {usd.format(Math.abs(f.gananciaUSD))}
                            <span className="ml-1 text-xs font-normal">
                              ({signo(f.gananciaUSD)}
                              {pct.format(Math.abs(f.gananciaPct) / 100)})
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <footer className="revela pb-2 text-xs text-[var(--fg-3)]" style={{ animationDelay: '300ms' }}>
            Registrá operaciones desde{' '}
            <Link href="/movimientos" className="underline decoration-[var(--border-2)] underline-offset-2">
              Movimientos
            </Link>{' '}
            o mandale un screenshot a Claude.
          </footer>
        </div>
      )}
    </AppShell>
  )
}

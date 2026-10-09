'use client'
import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Link from 'next/link'
import { AppShell } from '@/app/componentes/AppShell'
import { Panel, clasePanel } from '@/app/componentes/ui/Panel'
import { Skeleton } from '@/app/componentes/ui/Skeleton'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { Ayuda } from '@/app/componentes/ui/Ayuda'
import { Franja } from '@/app/componentes/ui/Franja'
import { Segmentado } from '@/app/componentes/ui/Segmentado'
import { Anotacion, Resaltado, Subrayado } from '@/app/componentes/ui/Marcador'
import { Colapsable } from '@/app/componentes/ui/Colapsable'
import { useConteo } from '@/app/componentes/ui/conteo'
import { claseBotonPrimario, claseBotonSecundario, claseBotonTexto, claseInput, claseTh } from '@/app/componentes/ui/campos'
import { grilla, miles, tickCifra, tickEje, tooltipCaja, tooltipCursor, tooltipRotulo } from '@/app/componentes/ui/graficos'
import { usd, usdEntero, pct, fechaCorta, fechaTabla, parseISO, signo } from '@/app/componentes/ui/formatters'
import { PROPOSITO } from '@/app/componentes/ui/colores'
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

const arsEntero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const diaLargo = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
const diaMesLargo = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' })
const diaMes = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const pct2 = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MS_DIA = 86_400_000
const POSICIONES_INICIALES = 6

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

// Orden de la lista de posiciones en el celular (la tabla ordena por columna).
const ORDENES_MOVIL: { valor: string; label: string; col: ColumnaOrden; dir: 'asc' | 'desc' }[] = [
  { valor: 'valor', label: 'Mayor valor', col: 'valorUSD', dir: 'desc' },
  { valor: 'ganancia', label: 'Mayor ganancia', col: 'gananciaUSD', dir: 'desc' },
  { valor: 'perdida', label: 'Mayor pérdida', col: 'gananciaUSD', dir: 'asc' },
  { valor: 'plataforma', label: 'Por plataforma', col: 'plataforma', dir: 'asc' },
  { valor: 'nombre', label: 'Por nombre', col: 'nombre', dir: 'asc' },
  { valor: 'fecha', label: 'Más recientes', col: 'fecha', dir: 'desc' },
]

const colorSigno = (v: number) => (v >= 0 ? 'var(--good)' : 'var(--bad)')
const conSigno = (v: number, f: Intl.NumberFormat = usd) => `${signo(v)}${f.format(Math.abs(v))}`
const pctSigno = (v: number, f: Intl.NumberFormat = pct) => `${signo(v)}${f.format(Math.abs(v))}`

function VariacionDia({ v, className = '' }: { v: number | undefined; className?: string }) {
  if (v === undefined) return <span className={`text-[var(--fg-3)] ${className}`}>—</span>
  return (
    <span className={`font-mono ${className}`} style={{ color: colorSigno(v) }}>
      {pctSigno(v / 100)}
    </span>
  )
}

// Un 4xx/5xx cuenta como error (si no, la página quedaría en skeleton para siempre).
async function jsonOk(r: Response) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-[var(--fg-3)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 6 8 10.5 12.5 6" />
    </svg>
  )
}

// Placeholders con la forma real del encabezado y de las secciones.
function HeroSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="mt-3 h-14 w-64" />
      <Skeleton className="mt-4 h-5 w-52" />
    </div>
  )
}

function SkeletonInicio() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <div className="-mx-[var(--gutter)] h-52 bg-[var(--bg-sunken)] motion-safe:animate-pulse sm:-mx-8 md:mx-0 md:rounded-[var(--radius-lg)]" />
      {[0, 1].map((i) => (
        <div key={i} className={`${clasePanel} p-5`}>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-5 h-40 w-full" />
        </div>
      ))}
      <span className="sr-only">Cargando tu patrimonio…</span>
    </div>
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
  const [todas, setTodas] = useState(false)
  const [orden, setOrden] = useState<{ col: ColumnaOrden; dir: 'asc' | 'desc' }>({
    col: 'valorUSD',
    dir: 'desc',
  })

  useEffect(() => {
    (async () => {
      try {
        // data y prices no dependen entre sí: se piden en paralelo.
        const [data, p] = await Promise.all([
          fetch('/api/data').then(jsonOk),
          fetch('/api/prices').then(jsonOk),
        ])
        setPf(data.portfolio)
        setSnapshots(data.snapshots)
        setPrecios(p.precios)
        setVariaciones(p.variaciones ?? {})
        setDesactualizado(p.desactualizado)
        setFechaPrecios(p.fecha)
      } catch {
        setFallo(true)
        return
      }
      // El snapshot del día se registra después de tener data + precios. Si
      // falla, la página sigue con la serie que ya vino en /api/data.
      try {
        const s = await (await fetch('/api/snapshot', { method: 'POST' })).json()
        if (Array.isArray(s.snapshots)) setSnapshots(s.snapshots)
      } catch {
        console.warn('snapshot: no se pudo registrar el del día')
      }
      // La cotización del peso es un extra: si falla, el selector no aparece.
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
  const conteo = useConteo(total)
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
  const diasDesde = snapAnterior
    ? Math.round((parseISO(hoyISO).getTime() - parseISO(snapAnterior.fecha).getTime()) / MS_DIA)
    : 0

  const filas = pf ? filasTabla(pf, precios, hoy) : []
  const filasOrdenadas = ordenarFilas(filas, orden.col, orden.dir)

  // Lo que se movió hoy, por activo (BTC en Nexo + Binance = uno), con su
  // impacto en dólares: valor actual × variación / (100 + variación).
  const movidas = Object.values(
    filas.reduce<Record<string, { ticker: string; nombre: string; valor: number; v: number }>>((acc, f) => {
      const v = f.ticker ? variaciones[f.ticker] : undefined
      if (typeof v !== 'number') return acc
      acc[f.ticker] ??= { ticker: f.ticker, nombre: f.nombre, valor: 0, v }
      acc[f.ticker].valor += f.valorUSD
      return acc
    }, {}),
  )
    .map((m) => ({ ...m, impacto: (m.valor * m.v) / (100 + m.v) }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  const topMover = movidas[0]
  const netoHoy = movidas.reduce((s, m) => s + m.impacto, 0)
  const netoHoyPct = total - netoHoy > 0 ? netoHoy / (total - netoHoy) : 0

  function alternarOrden(col: ColumnaOrden) {
    setOrden((actual) =>
      actual.col === col ? { col, dir: actual.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' },
    )
  }

  const realizadas = gananciaRealizadaPorPlataforma(ops)
  const plataformas = pf
    ? Object.entries(porPlataforma(pf, precios, hoy))
        .map(([nombre, valor]) => {
          const propias = filas.filter((f) => f.plataforma === nombre)
          const invertido = propias.reduce((s, f) => s + f.costoUSD, 0)
          const ganancia = propias.reduce((s, f) => s + f.gananciaUSD, 0)
          const realizada = realizadas[nombre] ?? 0
          const efectivo = pf.plataformas.find((p) => p.nombre === nombre)?.efectivoUSD ?? 0
          return { nombre, valor, invertido, ganancia, realizada, efectivo }
        })
        .sort((a, b) => b.valor - a.valor)
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
      {},
    ),
  ).sort((a, b) => b.valorUSD - a.valorUSD)

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

  const fuentesRenta = renta
    ? ([
        ['Rendimientos cripto', renta.rendimientos],
        ['Dividendos', renta.dividendos],
        ['Intereses cobrados', renta.intereses],
        ['Interés del bono devengado', renta.bonoDevengado],
        ['Resultado por ventas', renta.ventas],
      ] as const)
    : []
  const rentaConMovimiento = fuentesRenta.filter(([, v]) => v !== 0)
  const rentaSinMovimiento = fuentesRenta.filter(([, v]) => v === 0)

  const monto = (v: number) => (enPesos && dolar ? arsEntero.format(v * dolar.valor) : usdEntero.format(v))
  const ordenMovil = ORDENES_MOVIL.find((o) => o.col === orden.col && o.dir === orden.dir)?.valor ?? 'tabla'
  const filasMovil = todas ? filasOrdenadas : filasOrdenadas.slice(0, POSICIONES_INICIALES)

  const hero = pf ? (
    <div>
      <p className="entra font-display text-[19px] italic text-[var(--fg-2)] first-letter:uppercase">
        {diaLargo.format(hoy)}
      </p>
      <p
        className="entra mt-1 font-display text-[length:var(--text-display)] font-medium leading-none tracking-[var(--ls-display)] text-[var(--fg-1)] md:text-[72px]"
        style={{ ['--retraso' as string]: '60ms' }}
      >
        {monto(conteo)}
      </p>
      {variacionUSD !== null && snapAnterior && (
        <div className="entra mt-4" style={{ ['--retraso' as string]: '140ms' }}>
          <p className="text-[18px] font-semibold" style={{ color: colorSigno(variacionUSD) }}>
            <Subrayado>
              {conSigno(variacionUSD, usdEntero)}
              {variacionPct !== null && ` (${pctSigno(variacionPct)})`}
            </Subrayado>
          </p>
          <p className="mt-3 text-[15px] leading-snug text-[var(--fg-2)]">
            {diasDesde === 1
              ? 'desde ayer'
              : `en ${diasDesde} días, desde el ${diaMesLargo.format(parseISO(snapAnterior.fecha))}`}{' '}
            · sin contar aportes
          </p>
        </div>
      )}
      <p aria-live="polite" className="mt-3 flex flex-wrap items-center gap-x-1.5 text-[13px] text-[var(--fg-3)]">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: desactualizado ? 'var(--bad)' : 'var(--good)' }}
        />
        {desactualizado
          ? `Precios desactualizados${fechaPrecios ? ` · del ${diaMesLargo.format(parseISO(fechaPrecios))}` : ''}`
          : 'Precios al día'}
        {dolar && <span>· dólar {dolar.nombre} {arsEntero.format(dolar.valor)}</span>}
      </p>
    </div>
  ) : undefined

  const selectorMoneda = dolar ? (
    <Segmentado
      etiqueta="Moneda"
      opciones={[
        { valor: 'usd', label: 'USD' },
        { valor: 'ars', label: 'ARS' },
      ]}
      valor={enPesos ? 'ars' : 'usd'}
      onCambio={(v) => setEnPesos(v === 'ars')}
    />
  ) : undefined

  return (
    <AppShell
      titulo="Inicio"
      tituloVisible={false}
      ancha
      acciones={selectorMoneda}
      dato={pf ? hero : fallo ? undefined : <HeroSkeleton />}
    >
      {fallo ? (
        <EstadoVacio
          titulo="No pudimos cargar tus datos"
          detalle="El servidor no respondió o devolvió un error. Tus datos no se tocaron: reintentá en unos segundos y, si sigue, revisá la conexión."
          accion={
            <button type="button" onClick={() => window.location.reload()} className={claseBotonSecundario}>
              Reintentar
            </button>
          }
        />
      ) : !pf ? (
        <SkeletonInicio />
      ) : pf.operaciones.length === 0 ? (
        <EstadoVacio
          titulo="Tu cartera está vacía"
          detalle="Empezá registrando un depósito en Movimientos: la plataforma se crea sola y desde ahí cargás compras, ventas y rentas. También podés mandarle un screenshot a Claude."
          accion={
            <Link href="/movimientos" className={claseBotonPrimario}>
              Registrar la primera operación
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4 md:gap-6">
          {/* Hoy: la única anotación a mano y el único bloque oscuro de la pantalla. */}
          {movidas.length > 0 && (
            <div className="-mx-[var(--gutter)] sm:-mx-8 md:mx-0">
              {topMover && (
                <Anotacion className="pl-6 md:pl-2">
                  {topMover.ticker} {topMover.v >= 0 ? 'subió' : 'cayó'} {pct.format(Math.abs(topMover.v) / 100)} hoy
                </Anotacion>
              )}
              <Franja aria-labelledby="hoy" className="mt-1">
                <div className="md:flex md:items-end md:justify-between md:gap-10">
                  <div>
                    <h2 id="hoy" className="text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--band-ink-3)]">
                      Hoy · {diaMes.format(hoy).replace('.', '')}
                    </h2>
                    <p className="mt-2 flex items-baseline gap-3">
                      <span
                        className="entra font-mono text-[30px] leading-none tracking-[-0.03em]"
                        style={{ color: netoHoy >= 0 ? 'var(--band-good)' : 'var(--band-bad)' }}
                      >
                        {conSigno(netoHoy)}
                      </span>
                      <span className="font-mono text-[14px]" style={{ color: netoHoy >= 0 ? 'var(--band-good)' : 'var(--band-bad)' }}>
                        {pctSigno(netoHoyPct, pct2)}
                      </span>
                    </p>
                  </div>
                  <ul className="mt-4 grid grid-cols-2 border-t border-[var(--band-rule)] md:mt-0 md:flex md:border-0">
                    {movidas.slice(0, 4).map((m, i) => (
                      <li
                        key={m.ticker}
                        className={`py-3 md:min-w-[120px] md:border-l md:border-[var(--band-rule)] md:px-5 md:py-0 ${
                          i % 2 === 0 ? 'border-r border-[var(--band-rule)] pr-3 md:border-r-0' : 'pl-4'
                        } ${i >= 2 ? 'border-t border-[var(--band-rule)] md:border-t-0' : ''}`}
                      >
                        <span className="font-mono text-[12px] text-[var(--band-ink-3)]">
                          {i === 0 ? <Resaltado>{m.ticker}</Resaltado> : m.ticker}
                        </span>
                        <p
                          className="entra mt-1.5 font-mono text-[22px] leading-none tracking-[-0.02em]"
                          style={{
                            color: m.v >= 0 ? 'var(--band-good)' : 'var(--band-bad)',
                            ['--retraso' as string]: `${200 + i * 70}ms`,
                          }}
                        >
                          {pctSigno(m.v / 100)}
                        </p>
                        <p className="mt-1 font-mono text-[12px] text-[var(--band-ink-3)]">{conSigno(m.impacto, usdEntero)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <Ayuda enFranja>
                  Suma lo que se movió hoy cada activo que cotiza, en dólares. El efectivo y el bono no se mueven en el día.
                </Ayuda>
              </Franja>
            </div>
          )}

          <Panel
            id="evolucion"
            titulo="Cómo vino creciendo"
            ayuda="Se registra un punto por día (y otro cada vez que abrís el panel). La distancia entre la curva y la línea punteada es lo que ganaste por encima de lo que pusiste."
          >
              <p className="-mt-1 mb-3 flex items-center gap-4 px-1 text-[13px] text-[var(--fg-2)]">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-[2px] w-4 rounded bg-[var(--chart-1)]" />
                  Valor
                </span>
                <span className="inline-flex items-center gap-1.5 text-[var(--mark-text)]">
                  <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-[var(--mark)]" />
                  Aportado
                </span>
              </p>
            <div
              className="h-[200px] md:h-[240px]"
              role="img"
              aria-label="Evolución del patrimonio: serie de registros diarios del valor total y del capital aportado, en USD"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={datosArea} margin={{ top: 6, right: 0, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="area-patrimonio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...grilla} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} minTickGap={28} tick={tickEje} />
                  <YAxis
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    domain={['auto', 'auto']}
                    tickFormatter={miles}
                    tick={tickCifra}
                  />
                  <Tooltip
                    cursor={tooltipCursor}
                    formatter={(value, name) => [usd.format(Number(value)), name === 'total' ? 'Valor' : 'Aportado']}
                    contentStyle={tooltipCaja}
                    labelStyle={tooltipRotulo}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="aportado"
                    name="aportado"
                    stroke="var(--chart-aporte)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="linear"
                    dataKey="total"
                    name="total"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#area-patrimonio)"
                    // Con muchos registros los puntos ensucian la curva: solo se marcan mientras son pocos.
                    dot={datosArea.length <= 12 ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 } : false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--chart-1)' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            {/* Peso proporcional: cada plataforma ocupa el alto que le toca. */}
            <Panel id="donde" titulo="Dónde está la plata">
              <ul className="flex flex-col gap-1.5">
                {plataformas.map((p) => {
                  const peso = total > 0 ? p.valor / total : 0
                  const sinInversion = p.invertido === 0 && p.realizada === 0
                  return (
                    <li
                      key={p.nombre}
                      className="flex flex-col justify-between gap-2 rounded-[var(--radius-md)] px-3.5 py-2.5"
                      style={{
                        minHeight: Math.max(56, peso * 360),
                        background: `rgba(var(--tile-rgb), ${0.03 + peso * 0.14})`,
                      }}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] font-medium text-[var(--fg-1)]">{p.nombre}</span>
                        <span className="font-mono text-[13px] text-[var(--fg-2)]">{pct.format(peso)}</span>
                      </span>
                      <span className="flex items-end justify-between gap-3">
                        <span className="text-[12px] leading-snug text-[var(--fg-3)]">
                          {sinInversion ? (
                            'Ahorro sin inversión'
                          ) : (
                            <>
                              <span style={{ color: colorSigno(p.ganancia) }}>{conSigno(p.ganancia, usdEntero)}</span> desde la
                              compra
                              {p.realizada !== 0 && <span className="block">{conSigno(p.realizada, usdEntero)} realizadas</span>}
                              {p.efectivo > 0 && <span className="block">{usd.format(p.efectivo)} líquido</span>}
                            </>
                          )}
                        </span>
                        <span
                          className="font-display font-medium tracking-[-0.01em] text-[var(--fg-1)]"
                          style={{ fontSize: Math.round(17 + peso * 22) }}
                        >
                          {monto(p.valor)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Panel>

            <div className="flex flex-col gap-4 md:gap-6">
              <Panel
                id="para-que"
                titulo="Para qué la trabajo"
                ayuda={
                  <>
                    Rendimiento por Modified Dietz: descuenta el momento en que entró o salió cada peso. La exposición
                    separa lo que fluctúa (acciones, cripto) de lo fijo (bono) y lo líquido (efectivo).
                  </>
                }
              >
                <ul className="flex flex-col gap-3 px-1">
                  {propositos.map(([tipo, valor]) => (
                    <li key={tipo} className="grid grid-cols-[136px_minmax(0,1fr)_52px] items-center gap-3">
                      <span className="min-w-0 text-[15px] text-[var(--fg-1)]">{PROPOSITO[tipo].nombre}</span>
                      <span className="h-2.5 rounded-[var(--radius-pill)] bg-[var(--bg-sunken)]">
                        <span
                          className="block h-full rounded-[var(--radius-pill)] bg-[var(--chart-1)]"
                          style={{ width: `${(valor / total) * 100}%` }}
                        />
                      </span>
                      <span className="text-right font-mono text-[14px] text-[var(--fg-1)]">{pct.format(valor / total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-t border-[var(--border-1)] px-1 pt-3 text-[13px]">
                  <div>
                    <dt className="text-[var(--fg-3)]">
                      Rendimiento{dietz ? ` desde el ${diaMes.format(parseISO(dietz.desde)).replace('.', '')}` : ''}
                    </dt>
                    <dd className="mt-0.5 font-mono text-[16px]" style={{ color: dietz ? colorSigno(dietz.retorno) : undefined }}>
                      {dietz ? pctSigno(dietz.retorno) : '—'}
                    </dd>
                  </div>
                  {expo && total > 0 && (
                    <div>
                      <dt className="text-[var(--fg-3)]">Exposición</dt>
                      <dd className="mt-0.5 text-[14px] leading-snug text-[var(--fg-1)]">
                        {pct.format(expo.variable / total)} variable · {pct.format(expo.fija / total)} fija ·{' '}
                        {pct.format(expo.liquido / total)} líquido
                      </dd>
                    </div>
                  )}
                </dl>
                <Colapsable nivel={2} resumen="Por activo" className="mt-2 px-1">
                  <ul className="flex flex-col">
                    {porActivo.map((a) => (
                      <li
                        key={a.ticker || a.nombre}
                        className="flex items-baseline justify-between gap-3 border-t border-[var(--border-1)] py-2 first:border-0"
                      >
                        <span className="min-w-0 text-[14px] text-[var(--fg-1)]">
                          {a.nombre}
                          {a.plataformas.length > 1 && (
                            <span className="ml-1.5 text-[12px] text-[var(--fg-3)]">{a.plataformas.join(' + ')}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[13px] text-[var(--fg-1)]">
                          {pct.format(total > 0 ? a.valorUSD / total : 0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Colapsable>
              </Panel>

              {renta && rentaConMovimiento.length > 0 && (
                <Panel
                  id="renta"
                  titulo={`Renta ${anioActual}`}
                  accion={<span className="font-display text-[24px] font-medium text-[var(--fg-1)]">{usd.format(renta.total)}</span>}
                  ayuda="Acumulado del año: incluye el interés del bono devengado a la fecha y el resultado de las ventas."
                >
                  <table className="w-full text-[14px]">
                    <tbody>
                      {rentaConMovimiento.map(([label, valor]) => (
                        <tr key={label} className="border-t border-[var(--border-1)] first:border-0">
                          <td className="py-2.5 pl-1 text-[var(--fg-2)]">{label}</td>
                          <td className="py-2.5 pr-1 text-right font-mono text-[14px] text-[var(--fg-1)]">{usd.format(valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rentaSinMovimiento.length > 0 && (
                    <p className="px-1 pt-1 text-[13px] text-[var(--fg-3)]">
                      Sin movimiento este año: {rentaSinMovimiento.map(([l]) => l.toLowerCase()).join(', ')}.
                    </p>
                  )}
                </Panel>
              )}
            </div>
          </div>

          <Panel
            id="posiciones"
            titulo="Posiciones"
            accion={
              <label className="md:hidden">
                <span className="sr-only">Ordenar posiciones</span>
                <select
                  value={ordenMovil}
                  onChange={(e) => {
                    const o = ORDENES_MOVIL.find((x) => x.valor === e.target.value)
                    if (o) setOrden({ col: o.col, dir: o.dir })
                  }}
                  className={`${claseInput} min-h-11 rounded-[var(--radius-pill)] py-1.5 pl-3 pr-2 text-[13px] sm:text-[13px]`}
                >
                  {ordenMovil === 'tabla' && (
                    <option value="tabla" disabled>
                      Orden de la tabla
                    </option>
                  )}
                  {ORDENES_MOVIL.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            {/* Celular: tabla compacta; el detalle se despliega al tocar. */}
            <div className="md:hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-1">
                <span className={claseTh}>Activo</span>
                <span className={`${claseTh} text-right`}>Valor</span>
                <span className={`${claseTh} w-[86px] text-right`}>Ganancia</span>
              </div>
              <ul>
                {filasMovil.map((f) => {
                  const variacion = f.ticker ? variaciones[f.ticker] : undefined
                  return (
                    <li key={`${f.plataforma}-${f.ticker || f.nombre}`} className="border-t border-[var(--border-1)]">
                      <details className="group">
                        <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 rounded-[var(--radius-sm)] px-1 py-3 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] text-[var(--fg-1)]">{f.nombre}</span>
                              <Chevron className="group-open:rotate-180" />
                            </span>
                            <span className="text-[12px] text-[var(--fg-3)]">
                              {f.ticker && (
                                <span translate="no" className="font-mono">
                                  {f.ticker} ·{' '}
                                </span>
                              )}
                              {f.plataforma}
                            </span>
                          </span>
                          <span className="text-right font-mono text-[14px] text-[var(--fg-1)]">{usdEntero.format(f.valorUSD)}</span>
                          <span className="w-[86px] text-right font-mono text-[13px]" style={{ color: colorSigno(f.gananciaUSD) }}>
                            {conSigno(f.gananciaUSD, usdEntero)}
                            <span className="block text-[11px]">{pctSigno(f.gananciaPct / 100)}</span>
                          </span>
                        </summary>
                        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3.5 py-3 text-[13px]">
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Hoy</dt>
                            <dd>
                              <VariacionDia v={variacion} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Cantidad</dt>
                            <dd className="font-mono text-[var(--fg-1)]">
                              {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Invertido</dt>
                            <dd className="font-mono text-[var(--fg-1)]">{usd.format(f.costoUSD)}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Fecha de compra</dt>
                            <dd className="font-mono text-[var(--fg-1)]">{fechaTabla.format(parseISO(f.fecha))}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Precio de compra</dt>
                            <dd className="font-mono text-[var(--fg-1)]">{usd.format(f.precioCompra)}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-[var(--fg-3)]">Precio actual</dt>
                            <dd className="font-mono text-[var(--fg-1)]">
                              {f.precioActual !== null ? usd.format(f.precioActual) : '—'}
                            </dd>
                          </div>
                        </dl>
                      </details>
                    </li>
                  )
                })}
              </ul>
              {filasOrdenadas.length > POSICIONES_INICIALES && (
                <div className="border-t border-[var(--border-1)] px-1 pt-1">
                  <button type="button" onClick={() => setTodas((t) => !t)} className={claseBotonTexto}>
                    {todas ? 'Ver menos' : `Ver las ${filasOrdenadas.length} posiciones`}
                  </button>
                </div>
              )}
            </div>

            {/* Escritorio: tabla completa, ordenable por columna. */}
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
                          className={`border-b border-[var(--border-2)] ${c.align === 'left' ? 'text-left' : 'text-right'} ${
                            i < COLUMNAS.length - 1 ? 'pr-3' : ''
                          }`}
                        >
                          {c.col === null ? (
                            <span className={claseTh}>{c.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alternarOrden(c.col as ColumnaOrden)}
                              className={`inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-xs)] text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] transition-colors duration-[var(--dur-base)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                                activa ? 'text-[var(--fg-1)]' : 'text-[var(--fg-3)]'
                              } ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                            >
                              {c.label}
                              {activa && (
                                <Chevron className={orden.dir === 'asc' ? 'rotate-180 text-[var(--mark)]' : 'text-[var(--mark)]'} />
                              )}
                            </button>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((f) => {
                    const variacion = f.ticker ? variaciones[f.ticker] : undefined
                    const celda = 'py-3 pr-3 text-right font-mono text-[12px] text-[var(--fg-2)] whitespace-nowrap'
                    return (
                      <tr
                        key={`${f.plataforma}-${f.ticker || f.nombre}`}
                        className="border-b border-[var(--border-1)] transition-colors duration-[var(--dur-base)] last:border-0 hover:bg-[var(--bg-sunken)]"
                      >
                        <td className="whitespace-nowrap py-3 pr-3 text-[14px] text-[var(--fg-1)]">
                          {f.nombre}
                          {f.ticker && (
                            <span translate="no" className="ml-1.5 font-mono text-[12px] text-[var(--fg-3)]">
                              {f.ticker}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-[var(--fg-2)]">{f.plataforma}</td>
                        <td className={celda}>{fechaTabla.format(parseISO(f.fecha))}</td>
                        <td className={celda}>{f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}</td>
                        <td className={celda}>{usd.format(f.costoUSD)}</td>
                        <td className={celda}>{usd.format(f.precioCompra)}</td>
                        <td className={celda}>{f.precioActual !== null ? usd.format(f.precioActual) : '—'}</td>
                        <td className="py-3 pr-3 text-right text-[12px]">
                          <VariacionDia v={variacion} />
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-right font-mono text-[13px] text-[var(--fg-1)]">
                          {usd.format(f.valorUSD)}
                        </td>
                        <td className="whitespace-nowrap py-3 text-right font-mono text-[13px]" style={{ color: colorSigno(f.gananciaUSD) }}>
                          {conSigno(f.gananciaUSD)}
                          <span className="block text-[11px]">{pctSigno(f.gananciaPct / 100)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <p className="px-1 text-[13px] text-[var(--fg-3)]">
            ¿Hiciste una operación? Registrala en{' '}
            <Link
              href="/movimientos"
              className="font-medium text-[var(--link)] underline decoration-[var(--mark)] underline-offset-4 hover:text-[var(--link-hover)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              Movimientos
            </Link>
            .
          </p>
        </div>
      )}
    </AppShell>
  )
}

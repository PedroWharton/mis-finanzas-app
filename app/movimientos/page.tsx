'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { Panel } from '@/app/componentes/ui/Panel'
import { Skeleton } from '@/app/componentes/ui/Skeleton'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '@/app/componentes/ui/campos'
import { fechaLarga, parseISO, signo, usd } from '@/app/componentes/ui/formatters'
import type { Operacion, Portfolio, TipoOperacion } from '@/lib/tipos'

const TIPOS: TipoOperacion[] = ['deposito', 'retiro', 'compra', 'venta', 'dividendo', 'interes', 'rendimiento']

const TIPO_LABEL: Record<TipoOperacion, string> = {
  deposito: 'Depósito',
  retiro: 'Retiro',
  compra: 'Compra',
  venta: 'Venta',
  dividendo: 'Dividendo',
  interes: 'Interés',
  rendimiento: 'Rendimiento',
}

// Mismas reglas que validarMovimientos (lib/movimientos.ts): el server descarta
// el ticker en depósitos/retiros y la cantidad en depósitos/retiros/dividendos.
const USA_TICKER: Record<TipoOperacion, boolean> = {
  deposito: false,
  retiro: false,
  compra: true,
  venta: true,
  dividendo: true,
  interes: true,
  rendimiento: true,
}
const USA_CANTIDAD: Record<TipoOperacion, boolean> = {
  deposito: false,
  retiro: false,
  compra: true,
  venta: true,
  dividendo: false,
  interes: true,
  rendimiento: true,
}

const ES_RENTA: Record<TipoOperacion, boolean> = {
  deposito: false,
  retiro: false,
  compra: false,
  venta: false,
  dividendo: true,
  interes: true,
  rendimiento: true,
}

const POR_PAGINA = 30

// Campos de esta página: 16px en mobile (iOS no hace zoom al enfocar) y 44px de alto.
const claseCampo = `${claseInput} min-h-11 w-full max-sm:text-[16px]`

const cantidadFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 })
const mesFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
const diaFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' })

function dia(iso: string): string {
  const partes = diaFmt.formatToParts(parseISO(iso))
  const d = partes.find((p) => p.type === 'day')?.value ?? ''
  const m = (partes.find((p) => p.type === 'month')?.value ?? '').replace('.', '')
  return `${d} ${m}`
}

function mes(iso: string): string {
  const t = mesFmt.format(parseISO(iso))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Borrador {
  fecha: string
  tipo: TipoOperacion
  plataforma: string
  ticker: string
  cantidad: string
  montoUSD: string
  nota: string
  anioRenta: string
}

type Errores = Partial<Record<keyof Borrador, string>>

const BORRADOR_VACIO: Omit<Borrador, 'fecha'> = {
  tipo: 'deposito',
  plataforma: '',
  ticker: '',
  cantidad: '',
  montoUSD: '',
  nota: '',
  anioRenta: '',
}

function aBorrador(op: Operacion): Borrador {
  return {
    fecha: op.fecha,
    tipo: op.tipo,
    plataforma: op.plataforma,
    ticker: op.ticker ?? '',
    cantidad: op.cantidad !== undefined ? String(op.cantidad) : '',
    montoUSD: String(op.montoUSD),
    nota: op.nota ?? '',
    anioRenta: op.anioRenta !== undefined ? String(op.anioRenta) : '',
  }
}

// Acepta "1499.78" y también la coma decimal de es-AR ("1.499,78").
// null = campo vacío; NaN = no es un número.
function leerNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return null
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

function aOperacion(b: Borrador): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fecha: b.fecha,
    tipo: b.tipo,
    plataforma: b.plataforma.trim(),
    montoUSD: leerNumero(b.montoUSD),
  }
  if (USA_TICKER[b.tipo] && b.ticker.trim()) out.ticker = b.ticker.trim().toUpperCase()
  const cantidad = leerNumero(b.cantidad)
  if (USA_CANTIDAD[b.tipo] && cantidad !== null) out.cantidad = cantidad
  if (b.nota.trim()) out.nota = b.nota.trim()
  if (ES_RENTA[b.tipo] && b.anioRenta.trim()) out.anioRenta = Number(b.anioRenta.trim())
  return out
}

function validar(b: Borrador): Errores {
  const e: Errores = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) e.fecha = 'Elegí la fecha de la operación.'
  const plataforma = b.plataforma.trim()
  if (!plataforma) e.plataforma = 'Indicá dónde se hizo (ej. DolarApp).'
  else if (plataforma.length > 60) e.plataforma = 'Hasta 60 caracteres.'
  const monto = leerNumero(b.montoUSD)
  if (monto === null) e.montoUSD = 'Ingresá el monto en dólares.'
  else if (!(monto > 0)) e.montoUSD = 'Tiene que ser un número mayor a 0, por ejemplo 1499,78.'
  const ticker = USA_TICKER[b.tipo] ? b.ticker.trim() : ''
  const cantidad = USA_CANTIDAD[b.tipo] ? leerNumero(b.cantidad) : null
  if (ticker.length > 12) e.ticker = 'Hasta 12 caracteres.'
  if (cantidad !== null && !(cantidad > 0)) e.cantidad = 'Tiene que ser un número mayor a 0.'
  if (b.tipo === 'compra' || b.tipo === 'venta') {
    if (!ticker) e.ticker = 'Obligatorio en compras y ventas.'
    if (cantidad === null) e.cantidad = 'Obligatoria en compras y ventas.'
  }
  if ((b.tipo === 'interes' || b.tipo === 'rendimiento') && cantidad !== null && !ticker && !e.ticker)
    e.ticker = 'Si acreditó unidades, indicá de qué activo.'
  if (ES_RENTA[b.tipo] && b.anioRenta.trim() && !/^20\d{2}$/.test(b.anioRenta.trim()))
    e.anioRenta = 'Un año de 4 cifras, por ejemplo 2025.'
  return e
}

// La identidad de una operación es el mismo conjunto de campos que usa el
// chequeo de duplicados del backend: alcanza para encontrarla en el historial.
function identidad(op: Operacion): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fecha: op.fecha,
    tipo: op.tipo,
    plataforma: op.plataforma,
    montoUSD: op.montoUSD,
  }
  if (op.ticker) out.ticker = op.ticker
  if (op.cantidad !== undefined) out.cantidad = op.cantidad
  return out
}

// Botón de texto para acciones secundarias de fila: 44px de alto, sin color
// hasta que la acción lo amerita.
const claseBotonTexto =
  'inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-2 text-[13px] font-semibold underline decoration-[var(--mark)] underline-offset-4 transition-colors duration-[var(--dur-base)] hover:text-[var(--mark-text)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-60'

function Campo({
  id,
  label,
  ayuda,
  error,
  className = '',
  children,
}: {
  id: string
  label: string
  ayuda?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-[var(--fg-2)]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--bad)' }}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-[2px] h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.75v3.75M8 10.9v.1" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="text-[12.5px] leading-snug text-[var(--fg-3)]">
            {ayuda}
          </p>
        )
      )}
    </div>
  )
}

function Editor({
  inicial,
  plataformas,
  ocupado,
  errorServidor,
  onGuardar,
  onEliminar,
  onCancelar,
  textoGuardar = 'Guardar cambios',
}: {
  inicial: Borrador
  plataformas: string[]
  ocupado: boolean
  errorServidor: string | null
  onGuardar: (b: Borrador) => void
  // Sin onEliminar el editor sirve para registrar una operación nueva.
  onEliminar?: () => void
  onCancelar: () => void
  textoGuardar?: string
}) {
  const uid = useId()
  const id = (campo: string) => `${uid}-${campo}`
  const formRef = useRef<HTMLFormElement>(null)
  const [b, setB] = useState(inicial)
  const [tocados, setTocados] = useState<Partial<Record<keyof Borrador, boolean>>>({})
  const [enviado, setEnviado] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const errores = validar(b)
  const visible = (c: keyof Borrador) => (enviado || tocados[c] ? errores[c] : undefined)
  const set = (campo: keyof Borrador) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setB({ ...b, [campo]: e.target.value })
  const tocar = (campo: keyof Borrador) => () => setTocados((t) => ({ ...t, [campo]: true }))
  // Props de accesibilidad comunes: aria-invalid + descripción (error o ayuda).
  const a11y = (campo: keyof Borrador, conAyuda = false) => {
    const err = visible(campo)
    return {
      id: id(campo),
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id(campo)}-error` : conAyuda ? `${id(campo)}-ayuda` : undefined,
      onBlur: tocar(campo),
    }
  }

  const usaTicker = USA_TICKER[b.tipo]
  const usaCantidad = USA_CANTIDAD[b.tipo]
  const obligatorioActivo = b.tipo === 'compra' || b.tipo === 'venta'

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={onEliminar ? 'Editar operación' : 'Registrar operación'}
      className="mb-3 mt-1 flex flex-col gap-5 rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)] p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        setEnviado(true)
        const primerError = (Object.keys(errores) as (keyof Borrador)[])[0]
        if (primerError) {
          formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(primerError))}`)?.focus()
          return
        }
        onGuardar(b)
      }}
    >
      <fieldset className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        <legend className="sr-only">Operación</legend>
        <Campo id={id('tipo')} label="Tipo">
          <select value={b.tipo} onChange={set('tipo')} className={claseCampo} id={id('tipo')}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={id('fecha')} label="Fecha" error={visible('fecha')}>
          <input type="date" value={b.fecha} onChange={set('fecha')} className={claseCampo} {...a11y('fecha')} />
        </Campo>
        <Campo id={id('plataforma')} label="Plataforma" error={visible('plataforma')}>
          <input
            value={b.plataforma}
            onChange={set('plataforma')}
            list={id('plataformas')}
            autoComplete="off"
            maxLength={60}
            className={claseCampo}
            {...a11y('plataforma')}
          />
          <datalist id={id('plataformas')}>
            {plataformas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Campo>
        <Campo id={id('montoUSD')} label="Monto en USD" error={visible('montoUSD')}>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={b.montoUSD}
            onChange={set('montoUSD')}
            className={`${claseCampo} tabular-nums`}
            {...a11y('montoUSD')}
          />
        </Campo>
      </fieldset>

      {(usaTicker || usaCantidad) && (
        <fieldset className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          <legend className="mb-3 text-[13px] text-[var(--fg-3)]">
            {obligatorioActivo
              ? 'Activo: obligatorio en compras y ventas.'
              : usaCantidad
                ? 'Activo: solo si la renta se acreditó en unidades (ej. NEXO).'
                : 'Activo: opcional, de qué posición vino el dividendo.'}
          </legend>
          {usaTicker && (
            <Campo id={id('ticker')} label="Ticker" error={visible('ticker')}>
              <input
                value={b.ticker}
                onChange={set('ticker')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                maxLength={12}
                className={`${claseCampo} font-mono uppercase`}
                {...a11y('ticker')}
              />
            </Campo>
          )}
          {usaCantidad && (
            <Campo id={id('cantidad')} label="Cantidad" error={visible('cantidad')}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={b.cantidad}
                onChange={set('cantidad')}
                className={`${claseCampo} tabular-nums`}
                {...a11y('cantidad')}
              />
            </Campo>
          )}
        </fieldset>
      )}

      {ES_RENTA[b.tipo] && (
        <Campo
          id={id('anioRenta')}
          label="Año de la renta (opcional)"
          ayuda="Solo si corresponde a otro año que el de cobro."
          error={visible('anioRenta')}
          className="sm:max-w-[16rem]"
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={b.anioRenta}
            onChange={set('anioRenta')}
            className={`${claseCampo} tabular-nums`}
            {...a11y('anioRenta', true)}
          />
        </Campo>
      )}

      <Campo id={id('nota')} label="Nota (opcional)">
        <input value={b.nota} onChange={set('nota')} autoComplete="off" className={claseCampo} id={id('nota')} />
      </Campo>

      {errorServidor && (
        <p role="alert" className="text-[13px] leading-snug" style={{ color: 'var(--bad)' }}>
          {errorServidor}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 border-t border-[var(--border-1)] pt-4">
        <button type="submit" disabled={ocupado} className={claseBotonPrimario}>
          {ocupado && !confirmarBorrado ? 'Guardando…' : textoGuardar}
        </button>
        <button type="button" onClick={onCancelar} className={claseBotonSecundario}>
          Cancelar
        </button>
        {onEliminar && !confirmarBorrado && (
          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            className={`${claseBotonTexto} ml-auto -mr-2 text-[var(--fg-2)] hover:text-[var(--bad)]`}
          >
            Eliminar operación
          </button>
        )}
      </div>
      {onEliminar && confirmarBorrado && (
        <div
          role="group"
          aria-label="Confirmar eliminación"
          className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] bg-[var(--bg-surface)] p-3"
        >
          <p className="w-full text-[13.5px] text-[var(--fg-1)] sm:w-auto sm:flex-1">
            ¿Eliminar esta operación? Se deshace su efecto en la cartera.
          </p>
          <button
            type="button"
            disabled={ocupado}
            onClick={onEliminar}
            className={`${claseBotonSecundario} border-[color-mix(in_srgb,var(--bad)_55%,transparent)]`}
            style={{ color: 'var(--bad)' }}
          >
            {ocupado ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button type="button" onClick={() => setConfirmarBorrado(false)} className={claseBotonSecundario}>
            No, conservarla
          </button>
        </div>
      )}
    </form>
  )
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-[var(--fg-3)] transition-transform duration-[var(--dur-base)] ${abierto ? 'rotate-180' : ''}`}
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

function Realizado({ op }: { op: Operacion }) {
  if (op.tipo !== 'venta' || op.gananciaRealizadaUSD === undefined) return null
  const g = op.gananciaRealizadaUSD
  return (
    <span className="font-mono text-[12px]" style={{ color: g >= 0 ? 'var(--good)' : 'var(--bad)' }}>
      {signo(g)}
      {usd.format(Math.abs(g))} realizado
    </span>
  )
}

// Fila del historial: toda la fila es el botón que abre el editor (target
// grande en el celular). Mobile: dos líneas con el monto alineado a la
// derecha. Desktop: columnas fijas con encabezado.
function Fila({
  op,
  abierta,
  idEditor,
  onToggle,
}: {
  op: Operacion
  abierta: boolean
  idEditor: string
  onToggle: () => void
}) {
  const cantidad = op.cantidad !== undefined ? `× ${cantidadFmt.format(op.cantidad)}` : null
  return (
    <button
      type="button"
      aria-expanded={abierta}
      aria-controls={idEditor}
      onClick={onToggle}
      className={`-mx-2 block w-[calc(100%+1rem)] rounded-[var(--radius-sm)] px-2 py-3 text-left transition-colors duration-[var(--dur-base)] hover:bg-[var(--bg-sunken)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
        abierta ? 'bg-[var(--bg-sunken)]' : ''
      }`}
    >
      <span className="sr-only">Editar: </span>
      {/* Mobile: izquierda qué/cuándo/dónde, derecha cuánto (alineado). */}
      <span className="flex items-start gap-3 sm:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-[15px] font-medium text-[var(--fg-1)]">{TIPO_LABEL[op.tipo]}</span>
            {op.ticker && (
              <span translate="no" className="truncate font-mono text-[13px] text-[var(--fg-2)]">
                {op.ticker}
              </span>
            )}
          </span>
          <span className="truncate text-[12px] text-[var(--fg-3)]">
            <span className="font-mono">{dia(op.fecha)}</span> · {op.plataforma}
          </span>
          {op.nota && <span className="mt-0.5 text-[13px] leading-snug text-[var(--fg-2)]">{op.nota}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[14px] text-[var(--fg-1)]">{usd.format(op.montoUSD)}</span>
          {cantidad && <span className="font-mono text-[12px] text-[var(--fg-3)]">{cantidad}</span>}
          <Realizado op={op} />
        </span>
        <span className="mt-[5px]">
          <Chevron abierto={abierta} />
        </span>
      </span>
      {/* Desktop */}
      <span className="hidden grid-cols-[4.5rem_7rem_minmax(0,1fr)_8rem_9.5rem_1rem] items-baseline gap-x-4 sm:grid">
        <span className="font-mono text-[12px] text-[var(--fg-3)]">{dia(op.fecha)}</span>
        <span className="text-[14px] font-medium text-[var(--fg-1)]">{TIPO_LABEL[op.tipo]}</span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            {op.ticker ? (
              <span translate="no" className="font-mono text-[13px] text-[var(--fg-1)]">
                {op.ticker}
              </span>
            ) : (
              <span className="text-[13px] text-[var(--fg-3)]">Efectivo</span>
            )}
            {cantidad && <span className="truncate font-mono text-[12px] text-[var(--fg-3)]">{cantidad}</span>}
          </span>
          {op.nota && <span className="mt-0.5 block truncate text-[12.5px] text-[var(--fg-3)]">{op.nota}</span>}
        </span>
        <span className="truncate text-[13px] text-[var(--fg-2)]">{op.plataforma}</span>
        <span className="flex flex-col items-end">
          <span className="font-mono text-[14px] text-[var(--fg-1)]">{usd.format(op.montoUSD)}</span>
          <Realizado op={op} />
        </span>
        <span className="mt-[3px] self-start">
          <Chevron abierto={abierta} />
        </span>
      </span>
    </button>
  )
}

function SkeletonMovimientos() {
  return (
    <div role="status" aria-label="Cargando movimientos" className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-1)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <Skeleton className="h-6 w-28" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
          <Skeleton className="h-11 sm:w-52" />
          <Skeleton className="h-11 sm:w-44" />
        </div>
        <Skeleton className="mt-7 h-3.5 w-28" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="mt-4 flex items-start justify-between gap-6 border-t border-[var(--border-1)] pt-4">
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

export default function Movimientos() {
  const [pf, setPf] = useState<Portfolio | null>(null)
  const [fallo, setFallo] = useState(false)
  const [filtroPlataforma, setFiltroPlataforma] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [limite, setLimite] = useState(POR_PAGINA)
  // Índice (en la lista ordenada y filtrada) de la fila en edición.
  const [editando, setEditando] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)
  const [plataformaAConfirmar, setPlataformaAConfirmar] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // Error del server, mostrado junto a la acción que lo causó.
  const [errorAccion, setErrorAccion] = useState<{ donde: string; texto: string } | null>(null)
  // Confirmación de éxito: aviso flotante, porque la fila editada puede quedar lejos del tope.
  const [aviso, setAviso] = useState<{ texto: string; advertencias: string[] } | null>(null)
  const uid = useId()

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/data')
      if (!r.ok) throw new Error()
      const d = (await r.json()) as { portfolio: Portfolio | null }
      setPf(d.portfolio ?? { monedaBase: 'USD', plataformas: [], operaciones: [] })
      setFallo(false)
    } catch {
      setFallo(true)
    }
  }, [])
  useEffect(() => {
    ;(async () => {
      await cargar()
    })().catch(() => setFallo(true))
  }, [cargar])

  // El aviso de éxito se va solo; si trae advertencias, se queda hasta cerrarlo.
  useEffect(() => {
    if (!aviso || aviso.advertencias.length > 0) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const ordenadas = useMemo(() => {
    const lista = [...(pf?.operaciones ?? [])]
    lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
    return lista.filter(
      (op) => (!filtroPlataforma || op.plataforma === filtroPlataforma) && (!filtroTipo || op.tipo === filtroTipo)
    )
  }, [pf, filtroPlataforma, filtroTipo])

  // Agrupa la página visible por mes, conservando el índice en `ordenadas`.
  const meses = useMemo(() => {
    const grupos: { clave: string; titulo: string; items: { op: Operacion; i: number }[] }[] = []
    ordenadas.slice(0, limite).forEach((op, i) => {
      const clave = op.fecha.slice(0, 7)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.clave === clave) ultimo.items.push({ op, i })
      else grupos.push({ clave, titulo: mes(op.fecha), items: [{ op, i }] })
    })
    return grupos
  }, [ordenadas, limite])

  // Devuelve null si salió bien, o el texto del error.
  async function ejecutar(res: Promise<Response>, exito: string): Promise<string | null> {
    setOcupado(true)
    setErrorAccion(null)
    setAviso(null)
    try {
      const r = await res
      const body = (await r.json().catch(() => null)) as { error?: string; advertencias?: string[] } | null
      if (!r.ok) return `No se pudo completar: ${body?.error ?? `el servidor respondió ${r.status}`}.`
      setAviso({ texto: exito, advertencias: body?.advertencias ?? [] })
      await cargar()
      return null
    } catch {
      return 'No se pudo completar: no hay conexión con el servidor. Revisá la red y probá de nuevo.'
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar(op: Operacion) {
    const error = await ejecutar(
      fetch('/api/movimientos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: identidad(op) }),
      }),
      'Operación eliminada.'
    )
    if (error) setErrorAccion({ donde: 'editor', texto: error })
    else setEditando(null)
  }

  async function guardar(original: Operacion, borrador: Borrador) {
    const error = await ejecutar(
      fetch('/api/movimientos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: identidad(original), nueva: aOperacion(borrador) }),
      }),
      'Operación actualizada.'
    )
    if (error) setErrorAccion({ donde: 'editor', texto: error })
    else setEditando(null)
  }

  async function crear(borrador: Borrador) {
    const error = await ejecutar(
      fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operaciones: [aOperacion(borrador)] }),
      }),
      'Operación registrada.'
    )
    if (error) setErrorAccion({ donde: 'nueva', texto: error })
    else setCreando(false)
  }

  async function eliminarPlataforma(nombre: string) {
    const error = await ejecutar(
      fetch('/api/plataformas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      }),
      `${nombre} eliminada, con su historial y sus snapshots.`
    )
    if (error) setErrorAccion({ donde: `plataforma:${nombre}`, texto: error })
    else setPlataformaAConfirmar(null)
  }

  function cambiarFiltro(f: () => void) {
    f()
    setEditando(null)
    setErrorAccion(null)
    setLimite(POR_PAGINA)
  }

  if (fallo) {
    return (
      <AppShell titulo="Movimientos">
        <EstadoVacio
          titulo="No se pudieron cargar los movimientos"
          detalle="La app no pudo leer la cartera. Revisá la conexión y probá de nuevo; no se perdió nada."
          accion={
            <button
              type="button"
              className={claseBotonSecundario}
              onClick={() => {
                setFallo(false)
                void cargar()
              }}
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
      <AppShell titulo="Movimientos">
        <SkeletonMovimientos />
      </AppShell>
    )
  }

  const plataformas = pf.plataformas.map((p) => p.nombre)
  const total = pf.operaciones.length
  const masReciente = pf.operaciones.reduce<string | null>((m, op) => (m === null || op.fecha > m ? op.fecha : m), null)
  const hayFiltros = filtroPlataforma !== '' || filtroTipo !== ''
  const opsPorPlataforma = (nombre: string) => pf.operaciones.filter((o) => o.plataforma === nombre).length

  return (
    <AppShell
      titulo="Movimientos"
      dato={
        <p className="text-[15px] text-[var(--fg-2)]">
          <span className="font-display text-[20px] font-medium text-[var(--fg-1)]">{total}</span>{' '}
          {total === 1 ? 'operación registrada' : 'operaciones registradas'}
          {masReciente && <> · la última del {fechaLarga.format(parseISO(masReciente))}</>}
        </p>
      }
    >
      <div className="flex flex-col gap-6">
        <Panel titulo="Nueva operación">
          <p className="text-[13.5px] leading-relaxed text-[var(--fg-2)]">
            Montos en dólares. Una plataforma nueva se crea con su primer depósito; compras y ventas llevan ticker y
            cantidad. También podés mandarle un screenshot a Claude y que la cargue solo (ver README).
          </p>
          {creando ? (
            <Editor
              inicial={{ ...BORRADOR_VACIO, fecha: hoyISO() }}
              plataformas={plataformas}
              ocupado={ocupado}
              errorServidor={errorAccion?.donde === 'nueva' ? errorAccion.texto : null}
              textoGuardar="Registrar"
              onGuardar={(b) => void crear(b)}
              onCancelar={() => {
                setCreando(false)
                setErrorAccion(null)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreando(true)
                setEditando(null)
                setErrorAccion(null)
              }}
              className={`${claseBotonPrimario} mt-4`}
            >
              Registrar operación
            </button>
          )}
        </Panel>

        {total === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay operaciones registradas"
            detalle="Empezá con un depósito: la plataforma se crea sola. Después podés corregir o eliminar cada operación desde esta pantalla."
          />
        ) : (
          <Panel titulo="Historial">
            <div className="mb-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <div className="flex min-w-0 flex-col gap-1.5 sm:w-56">
                <label htmlFor={`${uid}-fp`} className="text-[13px] font-medium text-[var(--fg-2)]">
                  Plataforma
                </label>
                <select
                  id={`${uid}-fp`}
                  value={filtroPlataforma}
                  onChange={(e) => cambiarFiltro(() => setFiltroPlataforma(e.target.value))}
                  className={claseCampo}
                >
                  <option value="">Todas</option>
                  {plataformas.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
                <label htmlFor={`${uid}-ft`} className="text-[13px] font-medium text-[var(--fg-2)]">
                  Tipo
                </label>
                <select
                  id={`${uid}-ft`}
                  value={filtroTipo}
                  onChange={(e) => cambiarFiltro(() => setFiltroTipo(e.target.value))}
                  className={claseCampo}
                >
                  <option value="">Todos</option>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={() =>
                    cambiarFiltro(() => {
                      setFiltroPlataforma('')
                      setFiltroTipo('')
                    })
                  }
                  className={`${claseBotonTexto} col-span-2 -ml-2 self-end text-[var(--fg-2)] sm:ml-0`}
                >
                  Quitar filtros
                </button>
              )}
            </div>

            <p aria-live="polite" className="mb-1 text-[13px] text-[var(--fg-3)]">
              {hayFiltros
                ? `${ordenadas.length} de ${total} operaciones`
                : 'Elegí una operación para corregirla o eliminarla.'}
            </p>

            {ordenadas.length === 0 ? (
              <div className="mt-3 rounded-[var(--radius-lg)] border-[1.5px] border-dashed border-[var(--border-2)] px-5 py-8 text-center">
                <p className="font-display text-[18px] font-medium text-[var(--fg-1)]">Ninguna operación coincide</p>
                <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-[var(--fg-3)]">
                  {filtroPlataforma && filtroTipo
                    ? `No hay operaciones de tipo ${TIPO_LABEL[filtroTipo as TipoOperacion].toLowerCase()} en ${filtroPlataforma}.`
                    : 'Probá con otra combinación de filtros.'}
                </p>
              </div>
            ) : (
              <>
                {/* Encabezado de columnas (solo desktop) */}
                <div
                  aria-hidden="true"
                  className="hidden grid-cols-[4.5rem_7rem_minmax(0,1fr)_8rem_9.5rem_1rem] gap-x-4 border-b border-[var(--border-1)] pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[var(--ls-eyebrow)] text-[var(--fg-3)] sm:grid"
                >
                  <span>Fecha</span>
                  <span>Tipo</span>
                  <span>Activo</span>
                  <span>Plataforma</span>
                  <span className="text-right">Monto</span>
                  <span />
                </div>
                {meses.map((g) => (
                  <section key={g.clave} aria-labelledby={`${uid}-m-${g.clave}`} className="mt-7 first-of-type:mt-4">
                    <h3
                      id={`${uid}-m-${g.clave}`}
                      className="flex items-baseline justify-between border-b border-[var(--border-1)] pb-2 font-display text-[19px] font-medium tracking-[-0.01em] text-[var(--fg-1)]"
                    >
                      {g.titulo}
                      <span className="font-sans text-[12px] font-normal tracking-normal text-[var(--fg-3)]">
                        {g.items.length} {g.items.length === 1 ? 'operación' : 'operaciones'}
                      </span>
                    </h3>
                    <ul className="flex list-none flex-col divide-y divide-[var(--border-1)]">
                      {g.items.map(({ op, i }) => {
                        const idEditor = `${uid}-editor-${i}`
                        return (
                          <li key={`${op.fecha}-${op.tipo}-${op.ticker ?? ''}-${op.montoUSD}-${i}`}>
                            <Fila
                              op={op}
                              abierta={editando === i}
                              idEditor={idEditor}
                              onToggle={() => {
                                setEditando(editando === i ? null : i)
                                setCreando(false)
                                setErrorAccion(null)
                              }}
                            />
                            {editando === i && (
                              <div id={idEditor}>
                                <Editor
                                  inicial={aBorrador(op)}
                                  plataformas={plataformas}
                                  ocupado={ocupado}
                                  errorServidor={errorAccion?.donde === 'editor' ? errorAccion.texto : null}
                                  onGuardar={(b) => void guardar(op, b)}
                                  onEliminar={() => void eliminar(op)}
                                  onCancelar={() => {
                                    setEditando(null)
                                    setErrorAccion(null)
                                  }}
                                />
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
                {ordenadas.length > limite && (
                  <button
                    type="button"
                    onClick={() => setLimite((l) => l + POR_PAGINA)}
                    className={`${claseBotonSecundario} mt-5 w-full sm:w-auto`}
                  >
                    Mostrar {Math.min(POR_PAGINA, ordenadas.length - limite)} más
                    <span className="ml-1.5 font-normal text-[var(--fg-3)]">
                      (quedan {ordenadas.length - limite})
                    </span>
                  </button>
                )}
              </>
            )}
          </Panel>
        )}

        {pf.plataformas.length > 0 && (
          <Panel titulo="Plataformas">
            <ul className="flex list-none flex-col divide-y divide-[var(--border-1)]">
              {pf.plataformas.map((p) => {
                const nOps = opsPorPlataforma(p.nombre)
                const confirmando = plataformaAConfirmar === p.nombre
                const error = errorAccion?.donde === `plataforma:${p.nombre}` ? errorAccion.texto : null
                return (
                  <li key={p.nombre} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-[var(--fg-1)]">{p.nombre}</p>
                        <p className="text-[13px] text-[var(--fg-3)]">
                          <span className="font-mono text-[12px]">{usd.format(p.efectivoUSD)}</span> en efectivo ·{' '}
                          <span className="tabular-nums">{p.posiciones.length}</span>{' '}
                          {p.posiciones.length === 1 ? 'posición' : 'posiciones'}
                        </p>
                      </div>
                      {!confirmando && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlataformaAConfirmar(p.nombre)
                            setErrorAccion(null)
                          }}
                          className={`${claseBotonTexto} -mr-2 text-[var(--fg-2)] hover:text-[var(--bad)]`}
                          aria-label={`Eliminar ${p.nombre}`}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                    {confirmando && (
                      <div
                        role="group"
                        aria-label={`Confirmar eliminación de ${p.nombre}`}
                        className="mb-2 mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] bg-[var(--bg-sunken)] p-4"
                      >
                        <p className="text-[14px] font-semibold text-[var(--fg-1)]">
                          ¿Eliminar {p.nombre} por completo?
                        </p>
                        <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-[var(--fg-2)]">
                          Se borran sus posiciones, {nOps === 1 ? 'su única operación' : `sus ${nOps} operaciones`} del
                          historial y su rastro en la curva de evolución (los snapshots se reescriben como si nunca
                          hubiera existido). No hay deshacer.
                        </p>
                        {error && (
                          <p role="alert" className="mt-2 text-[13px]" style={{ color: 'var(--bad)' }}>
                            {error}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => void eliminarPlataforma(p.nombre)}
                            className={`${claseBotonSecundario} border-[color-mix(in_srgb,var(--bad)_55%,transparent)]`}
                            style={{ color: 'var(--bad)' }}
                          >
                            {ocupado ? 'Eliminando…' : `Sí, eliminar ${p.nombre}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlataformaAConfirmar(null)}
                            className={claseBotonSecundario}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}
      </div>

      {aviso && (
        <div
          role="status"
          className="entra fixed inset-x-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] z-30 mx-auto flex max-w-md items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-2)] bg-[var(--bg-surface)] px-4 py-3 shadow-[var(--shadow-float)] md:bottom-6"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="mt-[3px] h-4 w-4 shrink-0"
            fill="none"
            stroke="var(--good)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
          <div className="min-w-0 flex-1 text-[13.5px] text-[var(--fg-1)]">
            <p className="font-semibold">{aviso.texto}</p>
            {aviso.advertencias.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[13px] text-[var(--fg-2)]">
                {aviso.advertencias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-pill)] text-[var(--fg-3)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}
    </AppShell>
  )
}

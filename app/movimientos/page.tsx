'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/app/componentes/AppShell'
import { Badge } from '@/app/componentes/ui/Badge'
import { EstadoVacio } from '@/app/componentes/ui/EstadoVacio'
import { Panel } from '@/app/componentes/ui/Panel'
import { SkeletonPagina } from '@/app/componentes/ui/Skeleton'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '@/app/componentes/ui/campos'
import { fechaTabla, parseISO, signo, usd } from '@/app/componentes/ui/formatters'
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

// Verde entra plata / posición; rojo sale; neutro para renta.
const TIPO_COLOR: Record<TipoOperacion, string> = {
  deposito: 'var(--good)',
  retiro: 'var(--bad)',
  compra: 'var(--navy-500)',
  venta: 'var(--gold-700)',
  dividendo: 'var(--fg-2)',
  interes: 'var(--fg-2)',
  rendimiento: 'var(--fg-2)',
}

interface Borrador {
  fecha: string
  tipo: TipoOperacion
  plataforma: string
  ticker: string
  cantidad: string
  montoUSD: string
  nota: string
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
  }
}

function aOperacion(b: Borrador): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fecha: b.fecha,
    tipo: b.tipo,
    plataforma: b.plataforma.trim(),
    montoUSD: Number(b.montoUSD),
  }
  if (b.ticker.trim()) out.ticker = b.ticker.trim().toUpperCase()
  if (b.cantidad.trim()) out.cantidad = Number(b.cantidad)
  if (b.nota.trim()) out.nota = b.nota.trim()
  return out
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

function CampoEditor({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--fg-3)]">
      {label}
      {children}
    </label>
  )
}

function Editor({
  inicial,
  guardando,
  onGuardar,
  onCancelar,
  textoGuardar = 'Guardar cambios',
  plataformas = [],
}: {
  inicial: Borrador
  guardando: boolean
  onGuardar: (b: Borrador) => void
  onCancelar: () => void
  textoGuardar?: string
  plataformas?: string[]
}) {
  const [b, setB] = useState(inicial)
  const set = (campo: keyof Borrador) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setB({ ...b, [campo]: e.target.value })
  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-sunken)] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar(b)
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoEditor label="Fecha">
          <input type="date" required value={b.fecha} onChange={set('fecha')} className={claseInput} />
        </CampoEditor>
        <CampoEditor label="Tipo">
          <select value={b.tipo} onChange={set('tipo')} className={claseInput}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </CampoEditor>
        <CampoEditor label="Plataforma">
          <input required list="plataformas-existentes" value={b.plataforma} onChange={set('plataforma')} className={claseInput} />
          <datalist id="plataformas-existentes">
            {plataformas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </CampoEditor>
        <CampoEditor label="Ticker">
          <input value={b.ticker} onChange={set('ticker')} placeholder="—" className={claseInput} />
        </CampoEditor>
        <CampoEditor label="Cantidad">
          <input type="number" step="any" min="0" value={b.cantidad} onChange={set('cantidad')} placeholder="—" className={claseInput} />
        </CampoEditor>
        <CampoEditor label="Monto USD">
          <input type="number" step="any" min="0.01" required value={b.montoUSD} onChange={set('montoUSD')} className={claseInput} />
        </CampoEditor>
      </div>
      <CampoEditor label="Nota">
        <input value={b.nota} onChange={set('nota')} placeholder="—" className={claseInput} />
      </CampoEditor>
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className={claseBotonPrimario}>
          {guardando ? 'Guardando…' : textoGuardar}
        </button>
        <button type="button" onClick={onCancelar} className={claseBotonSecundario}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BORRADOR_VACIO: Omit<Borrador, 'fecha'> = {
  tipo: 'deposito',
  plataforma: '',
  ticker: '',
  cantidad: '',
  montoUSD: '',
  nota: '',
}

function ConfirmarInline({
  texto,
  ocupado,
  onConfirmar,
  onCancelar,
}: {
  texto: string
  ocupado: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <span className="font-semibold" style={{ color: 'var(--bad)' }}>
        {texto}
      </span>
      <button
        type="button"
        disabled={ocupado}
        onClick={onConfirmar}
        className="font-semibold underline decoration-[var(--border-2)] underline-offset-2 disabled:opacity-60"
        style={{ color: 'var(--bad)' }}
      >
        {ocupado ? 'Eliminando…' : 'Sí, eliminar'}
      </button>
      <button type="button" onClick={onCancelar} className="text-[var(--fg-2)] underline decoration-[var(--border-2)] underline-offset-2">
        Cancelar
      </button>
    </span>
  )
}

export default function Movimientos() {
  const [pf, setPf] = useState<Portfolio | null>(null)
  const [fallo, setFallo] = useState(false)
  const [filtroPlataforma, setFiltroPlataforma] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  // Índice (en la lista ordenada) de la fila en edición / con confirmación abierta.
  const [editando, setEditando] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [plataformaAConfirmar, setPlataformaAConfirmar] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/data')
      if (!r.ok) throw new Error()
      const d = (await r.json()) as { portfolio: Portfolio | null }
      setPf(d.portfolio ?? { monedaBase: 'USD', plataformas: [], operaciones: [] })
    } catch {
      setFallo(true)
    }
  }, [])
  useEffect(() => {
    ;(async () => {
      await cargar()
    })().catch(() => setFallo(true))
  }, [cargar])

  const ordenadas = useMemo(() => {
    const lista = [...(pf?.operaciones ?? [])]
    lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
    return lista.filter(
      (op) => (!filtroPlataforma || op.plataforma === filtroPlataforma) && (!filtroTipo || op.tipo === filtroTipo)
    )
  }, [pf, filtroPlataforma, filtroTipo])

  async function ejecutar(res: Promise<Response>, exito: string) {
    setOcupado(true)
    setMensaje(null)
    try {
      const r = await res
      const body = (await r.json().catch(() => null)) as { error?: string; advertencias?: string[] } | null
      if (!r.ok) {
        setMensaje({ texto: body?.error ?? 'la operación falló', error: true })
        return false
      }
      const adv = body?.advertencias?.length ? ` · ${body.advertencias.join(' · ')}` : ''
      setMensaje({ texto: exito + adv, error: false })
      await cargar()
      return true
    } catch {
      setMensaje({ texto: 'la operación falló (¿sin conexión?)', error: true })
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar(op: Operacion) {
    const ok = await ejecutar(
      fetch('/api/movimientos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: identidad(op) }),
      }),
      'Operación eliminada'
    )
    if (ok) setConfirmando(null)
  }

  async function crear(borrador: Borrador) {
    const ok = await ejecutar(
      fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operaciones: [aOperacion(borrador)] }),
      }),
      'Operación registrada'
    )
    if (ok) setCreando(false)
  }

  async function guardar(original: Operacion, borrador: Borrador) {
    const ok = await ejecutar(
      fetch('/api/movimientos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: identidad(original), nueva: aOperacion(borrador) }),
      }),
      'Operación actualizada'
    )
    if (ok) setEditando(null)
  }

  async function eliminarPlataforma(nombre: string) {
    const ok = await ejecutar(
      fetch('/api/plataformas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      }),
      `Plataforma "${nombre}" eliminada (historial y snapshots incluidos)`
    )
    if (ok) setPlataformaAConfirmar(null)
  }

  if (fallo) {
    return (
      <AppShell titulo="Movimientos">
        <EstadoVacio titulo="No se pudieron cargar los datos" detalle="Revisá la conexión y volvé a intentar." />
      </AppShell>
    )
  }
  if (!pf) {
    return (
      <AppShell titulo="Movimientos">
        <SkeletonPagina paneles={2} />
      </AppShell>
    )
  }

  const plataformas = pf.plataformas.map((p) => p.nombre)

  return (
    <AppShell
      titulo="Movimientos"
      dato={
        <p className="text-[13px] text-[var(--fg-hero-muted)]">
          <span className="font-display text-[17px] font-medium text-[var(--fg-on-hero)] tabular-nums">
            {pf.operaciones.length}
          </span>{' '}
          operaciones registradas
        </p>
      }
    >
      <div className="flex flex-col gap-6">
        {mensaje && (
          <p
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3 text-[13px]"
            style={{ color: mensaje.error ? 'var(--bad)' : 'var(--good)' }}
          >
            {mensaje.texto}
          </p>
        )}

        <Panel titulo="Nueva operación" className="revela">
          <p className="text-[13px] leading-relaxed text-[var(--fg-3)]">
            Montos en dólares. Una plataforma nueva se crea con su primer depósito; compras y ventas llevan ticker y
            cantidad. También podés mandarle un screenshot a Claude y que la cargue solo (ver README).
          </p>
          {creando ? (
            <Editor
              inicial={{ ...BORRADOR_VACIO, fecha: hoyISO() }}
              guardando={ocupado}
              textoGuardar="Registrar"
              plataformas={plataformas}
              onGuardar={(b) => void crear(b)}
              onCancelar={() => setCreando(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreando(true)
                setEditando(null)
                setMensaje(null)
              }}
              className={`${claseBotonPrimario} mt-3`}
            >
              Registrar operación
            </button>
          )}
        </Panel>

        <Panel titulo="Historial" className="revela">
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              aria-label="Filtrar por plataforma"
              value={filtroPlataforma}
              onChange={(e) => setFiltroPlataforma(e.target.value)}
              className={claseInput}
            >
              <option value="">Todas las plataformas</option>
              {plataformas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por tipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className={claseInput}
            >
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {ordenadas.length === 0 ? (
            <p className="text-sm text-[var(--fg-2)]">
              {pf.operaciones.length === 0 ? 'Todavía no hay operaciones: empezá con un depósito.' : 'Sin operaciones con esos filtros.'}
            </p>
          ) : (
            <ul className="flex list-none flex-col divide-y divide-[var(--border-1)]">
              {ordenadas.map((op, i) => (
                <li key={`${op.fecha}-${op.tipo}-${op.ticker ?? ''}-${op.montoUSD}-${i}`} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="tabular-nums text-[13px] text-[var(--fg-3)]">
                      {fechaTabla.format(parseISO(op.fecha))}
                    </span>
                    <Badge color={TIPO_COLOR[op.tipo]}>{TIPO_LABEL[op.tipo]}</Badge>
                    {op.ticker && (
                      <span translate="no" className="font-mono text-[13px] font-semibold text-[var(--fg-1)]">
                        {op.ticker}
                      </span>
                    )}
                    {op.cantidad !== undefined && (
                      <span className="tabular-nums text-[13px] text-[var(--fg-2)]">× {op.cantidad}</span>
                    )}
                    <span className="tabular-nums text-sm font-semibold text-[var(--fg-1)]">
                      {usd.format(op.montoUSD)}
                    </span>
                    <span className="text-[13px] text-[var(--fg-3)]">{op.plataforma}</span>
                    {op.tipo === 'venta' && op.gananciaRealizadaUSD !== undefined && (
                      <span
                        className="tabular-nums text-[13px] font-semibold"
                        style={{ color: op.gananciaRealizadaUSD >= 0 ? 'var(--good)' : 'var(--bad)' }}
                      >
                        {signo(op.gananciaRealizadaUSD)}
                        {usd.format(Math.abs(op.gananciaRealizadaUSD))} realizadas
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3 text-[13px]">
                      {confirmando === i ? (
                        <ConfirmarInline
                          texto="¿Eliminar?"
                          ocupado={ocupado}
                          onConfirmar={() => void eliminar(op)}
                          onCancelar={() => setConfirmando(null)}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(editando === i ? null : i)
                              setConfirmando(null)
                              setMensaje(null)
                            }}
                            className="font-semibold text-[var(--fg-2)] underline decoration-[var(--border-2)] underline-offset-2 hover:text-[var(--fg-1)]"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmando(i)
                              setEditando(null)
                              setMensaje(null)
                            }}
                            className="font-semibold underline decoration-[var(--border-2)] underline-offset-2"
                            style={{ color: 'var(--bad)' }}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {op.nota && <p className="mt-1 text-[12px] text-[var(--fg-3)]">{op.nota}</p>}
                  {editando === i && (
                    <Editor
                      inicial={aBorrador(op)}
                      plataformas={plataformas}
                      guardando={ocupado}
                      onGuardar={(b) => void guardar(op, b)}
                      onCancelar={() => setEditando(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel titulo="Plataformas" className="revela">
          <p className="mb-4 text-[13px] leading-relaxed text-[var(--fg-3)]">
            Eliminar una plataforma la borra por completo: sus posiciones, todas sus operaciones del historial y su
            rastro en la curva de evolución (los snapshots se reescriben como si nunca hubiera existido). No hay
            deshacer.
          </p>
          <ul className="flex list-none flex-col divide-y divide-[var(--border-1)]">
            {pf.plataformas.map((p) => (
              <li key={p.nombre} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-semibold text-[var(--fg-1)]">{p.nombre}</span>
                <span className="tabular-nums text-[13px] text-[var(--fg-3)]">
                  {usd.format(p.efectivoUSD)} líquido · {p.posiciones.length}{' '}
                  {p.posiciones.length === 1 ? 'posición' : 'posiciones'}
                </span>
                <span className="ml-auto text-[13px]">
                  {plataformaAConfirmar === p.nombre ? (
                    <ConfirmarInline
                      texto={`¿Eliminar ${p.nombre} y todo su historial?`}
                      ocupado={ocupado}
                      onConfirmar={() => void eliminarPlataforma(p.nombre)}
                      onCancelar={() => setPlataformaAConfirmar(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPlataformaAConfirmar(p.nombre)
                        setMensaje(null)
                      }}
                      className="font-semibold underline decoration-[var(--border-2)] underline-offset-2"
                      style={{ color: 'var(--bad)' }}
                    >
                      Eliminar plataforma
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  )
}

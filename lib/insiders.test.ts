import { describe, it, expect, beforeEach } from 'vitest'
import { parsearScreener, resumirInsiders, obtenerInsiders, _resetCache, type OperacionInsider } from './insiders'
import type { Storage, Doc } from './storage'

// Recorte real del screener de OpenInsider (2026-09-01), con la tabla de
// filtros que precede a la de resultados y los tooltips onmouseover que
// ensucian la celda del ticker.
const HTML = `
<html><body>
<table cellpadding="4" cellspacing="4" border="0"><tr><td>Filing Date</td><td>All dates</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" class="tinytable">
<thead><tr><th>X</th><th>Filing&nbsp;Date</th><th>Trade&nbsp;Date</th><th>Ticker</th><th>Insider&nbsp;Name</th><th>Title</th><th>Trade&nbsp;Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th><th>1d</th><th>1w</th><th>1m</th><th>6m</th></tr></thead>
<tbody>
<tr><td></td><td><div>2026-06-23 16:41:58</div></td><td><div>2026-06-18</div></td><td><b><a href="/screener?s=NVDA" onmouseover="Tip('x', DELAY, 1)" onmouseout="UnTip()">NVDA</a></b></td><td><a href="/insider/Stevens-Mark-A/1199039" title="31,768,422 indirect shares">Stevens Mark A</a></td><td>Dir</td><td>S - Sale</td><td>$210.17</td><td>-885,000</td><td>31,768,422</td><td>-3%</td><td>-$185,999,938</td><td></td><td></td><td></td><td></td></tr>
<tr><td>M</td><td><div>2026-08-20 17:00:00</div></td><td><div>2026-08-19</div></td><td><b><a href="/screener?s=BRK.B">BRK.B</a></b></td><td><a href="/insider/x/1">Buffett Warren</a></td><td>CEO, 10%</td><td>P - Purchase</td><td>$412.50</td><td>+1,000</td><td>5,000</td><td>+25%</td><td>+$412,500</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td><div>2026-08-10 17:00:00</div></td><td><div>2026-08-08</div></td><td><b><a href="/screener?s=AAPL">AAPL</a></b></td><td><a href="/insider/x/2">Cook Tim</a></td><td>CEO</td><td>P - Purchase</td><td>$190.00</td><td>+500</td><td>3,000</td><td>+20%</td><td>+$95,000</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td><div>2026-08-11 17:00:00</div></td><td><div>2026-08-08</div></td><td><b><a href="/screener?s=AAPL">AAPL</a></b></td><td><a href="/insider/x/3">Parekh Kevan</a></td><td>CFO</td><td>P - Purchase</td><td>$191.00</td><td>+200</td><td>1,000</td><td>+25%</td><td>+$38,200</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td><div>2026-08-12 17:00:00</div></td><td><div>2026-08-11</div></td><td><b><a href="/screener?s=AAPL">AAPL</a></b></td><td><a href="/insider/x/4">Levinson Arthur</a></td><td>Dir</td><td>P - Purchase</td><td>$192.00</td><td>+100</td><td>900</td><td>+12%</td><td>+$19,200</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td><div>2026-08-13 17:00:00</div></td><td><div>2026-08-12</div></td><td><b><a href="/screener?s=AAPL">AAPL</a></b></td><td><a href="/insider/x/2">Cook Tim</a></td><td>CEO</td><td>S - Sale+OE</td><td>$195.00</td><td>-100</td><td>2,900</td><td>-3%</td><td>-$19,500</td><td></td><td></td><td></td><td></td></tr>
<tr><td>D</td><td><div>2026-08-14 17:00:00</div></td><td><div>2026-08-13</div></td><td><b><a href="/screener?s=MSFT">MSFT</a></b></td><td><a href="/insider/x/5">Nadella Satya</a></td><td>CEO</td><td>M - OptEx</td><td>$100.00</td><td>+10</td><td>10</td><td>+1%</td><td>+$1,000</td><td></td><td></td><td></td><td></td></tr>
</tbody></table>
<table><tr><td>A</td><td>Amended filing</td></tr><tr><td>D</td><td>Derivative</td></tr><tr><td>E</td><td>Error</td></tr></table>
</body></html>`

describe('parsearScreener', () => {
  it('extrae compras y ventas de la tabla de resultados, ignorando las tablas de filtros y leyendas', () => {
    const ops = parsearScreener(HTML)
    expect(ops).toHaveLength(6)
    expect(ops[0]).toEqual({
      ticker: 'NVDA',
      fecha: '2026-06-18',
      fechaFiling: '2026-06-23',
      insider: 'Stevens Mark A',
      cargo: 'Dir',
      tipo: 'venta',
      precio: 210.17,
      cantidad: 885000,
      valorUSD: 185999938,
    })
  })

  it('normaliza el ticker a la notación del repo (BRK.B → BRK-B)', () => {
    expect(parsearScreener(HTML).find((o) => o.insider === 'Buffett Warren')?.ticker).toBe('BRK-B')
  })

  it('cuenta "S - Sale+OE" como venta y excluye ejercicios de opciones', () => {
    const ops = parsearScreener(HTML)
    expect(ops.find((o) => o.precio === 195)?.tipo).toBe('venta')
    expect(ops.some((o) => o.ticker === 'MSFT')).toBe(false)
  })

  it('ubica las columnas por el encabezado: con varios tickers el screener agrega "Company Name"', () => {
    const html = `<table class="tinytable"><thead><tr><th>X</th><th>Filing&nbsp;Date</th><th>Trade&nbsp;Date</th><th>Ticker</th><th>Company&nbsp;Name</th><th>Insider&nbsp;Name</th><th>Title</th><th>Trade&nbsp;Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th><th>1d</th><th>1w</th><th>1m</th><th>6m</th></tr></thead>
<tbody><tr style="background:#ffe9e9"><td align=right></td><td align=right><div><a href="http://www.sec.gov/x" title="SEC Form 4" target="_blank">2026-08-27 18:30:30</a></div></td><td align=right><div>2026-08-25</div></td><td><b> <a href="/AAPL" onmouseover="Tip('<img src=\\'https://x/c.ashx?chart=AAPL&v=1\\' alt=\\'\\' width=\\'360px\\'>', DELAY, 1)" onmouseout="UnTip()">AAPL</a></b></td><td><a href="/AAPL">Apple Inc.</a></td><td><a href="/insider/Newstead-Jennifer/1">Newstead Jennifer</a></td><td>GC, SVP</td><td>S - Sale+OE</td><td>$230.50</td><td>-4,000</td><td>10,000</td><td>-29%</td><td>-$922,000</td><td></td><td></td><td></td><td></td></tr></tbody></table>`
    expect(parsearScreener(html)).toEqual([{
      ticker: 'AAPL', fecha: '2026-08-25', fechaFiling: '2026-08-27', insider: 'Newstead Jennifer', cargo: 'GC, SVP',
      tipo: 'venta', precio: 230.5, cantidad: 4000, valorUSD: 922000,
    }])
  })

  it('devuelve lista vacía sin tabla de resultados', () => {
    expect(parsearScreener('<html><body>nada</body></html>')).toEqual([])
  })
})

const op = (o: Partial<OperacionInsider>): OperacionInsider => ({
  ticker: 'AAPL', fecha: '2026-08-10', fechaFiling: '2026-08-11', insider: 'X', cargo: 'Dir',
  tipo: 'compra', precio: 100, cantidad: 10, valorUSD: 20000, ...o,
})

describe('resumirInsiders', () => {
  it('agrega compras/ventas por ticker y marca cluster con ≥3 insiders distintos comprando', () => {
    const r = resumirInsiders(parsearScreener(HTML), ['AAPL', 'NVDA', 'BRK-B', 'VOO'])
    expect(r.AAPL).toMatchObject({
      compras: 3, ventas: 1, compradoUSD: 152400, vendidoUSD: 19500, insidersComprando: 3, insidersVendiendo: 1, senal: 'compra_cluster',
    })
    expect(r.AAPL.ultimas[0].fecha).toBe('2026-08-12') // más reciente primero
    expect(r.NVDA).toMatchObject({ compras: 0, ventas: 1, senal: 'ventas' })
    expect(r['BRK-B']).toMatchObject({ compras: 1, insidersComprando: 1, senal: 'compras' })
  })

  it('un ticker pedido sin operaciones queda neutral con contadores en cero', () => {
    const r = resumirInsiders([], ['VOO'])
    expect(r.VOO).toEqual({
      compras: 0, ventas: 0, compradoUSD: 0, vendidoUSD: 0, insidersComprando: 0, insidersVendiendo: 0,
      neto30dUSD: 0, tendencia30d: 'neutral', senal: 'neutral', ultimas: [],
    })
  })

  it('la señal sale del neto en USD, no de la cantidad de operaciones', () => {
    const ops = [
      op({ insider: 'A', tipo: 'compra', valorUSD: 10000 }),
      op({ insider: 'B', tipo: 'compra', valorUSD: 10000 }),
      op({ insider: 'C', tipo: 'venta', valorUSD: 500000 }),
    ]
    expect(resumirInsiders(ops, ['AAPL']).AAPL.senal).toBe('ventas')
  })

  it('el mismo insider comprando 3 veces no es cluster', () => {
    const ops = [1, 2, 3].map((i) => op({ insider: 'A', fecha: `2026-08-0${i}` }))
    expect(resumirInsiders(ops, ['AAPL']).AAPL).toMatchObject({ compras: 3, insidersComprando: 1, senal: 'compras' })
  })

  it('colapsa filas duplicadas (enmiendas o el mismo trade presentado por dos entidades vinculadas) para no inflar el cluster', () => {
    const misma = { fecha: '2026-08-10', tipo: 'compra' as const, cantidad: 1000, precio: 50, valorUSD: 50000 }
    const ops = [
      op({ ...misma, insider: 'Fondo ABC LP' }),
      op({ ...misma, insider: 'ABC GP LLC' }),
      op({ ...misma, insider: 'Fondo ABC LP', fechaFiling: '2026-08-15' }), // enmienda
      op({ insider: 'Otro', fecha: '2026-08-11', cantidad: 10, precio: 51, valorUSD: 51000 }),
    ]
    expect(resumirInsiders(ops, ['AAPL']).AAPL).toMatchObject({ compras: 2, insidersComprando: 2, compradoUSD: 101000, senal: 'compras' })
  })

  it('cuenta insiders distintos vendiendo y marca venta_cluster con ≥3 vendedores y neto negativo', () => {
    const ops = [
      op({ insider: 'A', tipo: 'venta', valorUSD: 50000, cantidad: 1 }),
      op({ insider: 'B', tipo: 'venta', valorUSD: 60000, cantidad: 2 }),
      op({ insider: 'C', tipo: 'venta', valorUSD: 70000, cantidad: 3 }),
      op({ insider: 'C', tipo: 'venta', valorUSD: 70000, cantidad: 4 }),
    ]
    expect(resumirInsiders(ops, ['AAPL']).AAPL).toMatchObject({ ventas: 4, insidersVendiendo: 3, senal: 'venta_cluster' })
    // Dos vendedores grandes no son cluster: sigue siendo 'ventas'.
    expect(resumirInsiders(ops.slice(0, 2), ['AAPL']).AAPL).toMatchObject({ insidersVendiendo: 2, senal: 'ventas' })
  })

  it('el cluster de compras manda sobre el de ventas cuando ambos se dan', () => {
    const ops = [
      ...['A', 'B', 'C'].map((i, k) => op({ insider: i, tipo: 'compra', valorUSD: 20000, cantidad: k + 1 })),
      ...['D', 'E', 'F'].map((i, k) => op({ insider: i, tipo: 'venta', valorUSD: 90000, cantidad: k + 10 })),
    ]
    expect(resumirInsiders(ops, ['AAPL']).AAPL.senal).toBe('compra_cluster')
  })

  it('expone el neto de los últimos 30 días para detectar divergencias con la ventana de 90 (caso PAM)', () => {
    const hoy = '2026-09-02'
    const ops = [
      op({ insider: 'Mindlin', tipo: 'venta', fecha: '2026-07-01', valorUSD: 10433312, cantidad: 3002000 }),
      op({ insider: 'Mindlin', tipo: 'compra', fecha: '2026-08-18', valorUSD: 4342831, cantidad: 1299925 }),
      op({ insider: 'Mindlin', tipo: 'compra', fecha: '2026-08-21', valorUSD: 2278800, cantidad: 675000 }),
      op({ insider: 'Mindlin', tipo: 'compra', fecha: '2026-08-27', valorUSD: 507300, cantidad: 150000 }),
    ]
    const r = resumirInsiders(ops, ['AAPL'], hoy).AAPL
    expect(r.senal).toBe('ventas')
    expect(r.neto30dUSD).toBe(4342831 + 2278800 + 507300)
    expect(r.tendencia30d).toBe('compras')
    // Exactamente 30 días atrás cuenta; 31 no.
    expect(resumirInsiders([op({ fecha: '2026-08-03', valorUSD: 20000 })], ['AAPL'], hoy).AAPL.tendencia30d).toBe('compras')
    expect(resumirInsiders([op({ fecha: '2026-08-02', valorUSD: 20000 })], ['AAPL'], hoy).AAPL.tendencia30d).toBe('neutral')
  })

  it('ignora operaciones menores a USD 10.000: no cuentan, no suman y no aparecen en ultimas', () => {
    const ops = [
      op({ insider: 'Allen', tipo: 'venta', valorUSD: 1000, cantidad: 879, precio: 1.14 }),
      op({ insider: 'Grande', tipo: 'venta', valorUSD: 500000, cantidad: 500 }),
    ]
    const r = resumirInsiders(ops, ['AAPL']).AAPL
    expect(r).toMatchObject({ ventas: 1, insidersVendiendo: 1, vendidoUSD: 500000 })
    expect(r.ultimas.map((u) => u.insider)).toEqual(['Grande'])
  })

  it('limita `ultimas` a 5 operaciones e ignora tickers no pedidos', () => {
    const ops = Array.from({ length: 8 }, (_, i) => op({ fecha: `2026-08-1${i}`, insider: `I${i}` }))
    const r = resumirInsiders([...ops, op({ ticker: 'ZZZ' })], ['AAPL'])
    expect(r.AAPL.ultimas).toHaveLength(5)
    expect(r.ZZZ).toBeUndefined()
  })
})

function storageMemoria(inicial: Partial<Record<Doc, unknown>> = {}) {
  const datos: Partial<Record<Doc, unknown>> = { ...inicial }
  const st: Storage & { datos: typeof datos } = {
    datos,
    async leer(doc) { return datos[doc] ?? null },
    async escribir(doc, valor) { datos[doc] = valor },
  }
  return st
}

function fetchHtml(urls: string[], html = HTML): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    urls.push(String(url))
    return { ok: true, text: async () => html } as unknown as Response
  }) as typeof fetch
}

const fetchRoto = (async () => { throw new Error('sin red') }) as unknown as typeof fetch

beforeEach(() => _resetCache())

describe('obtenerInsiders', () => {
  it('pide el screener en lotes de 20 tickers, ventana 90 días, solo compras y ventas', async () => {
    const urls: string[] = []
    const tickers = Array.from({ length: 23 }, (_, i) => `T${i}`)
    await obtenerInsiders(tickers, fetchHtml(urls), storageMemoria())
    expect(urls).toHaveLength(2)
    const u = new URL(urls[0])
    expect(u.hostname).toBe('openinsider.com')
    expect(u.searchParams.get('s')?.split(' ')).toHaveLength(20)
    expect(u.searchParams.get('fd')).toBe('90')
    expect(u.searchParams.get('xp')).toBe('1')
    expect(u.searchParams.get('xs')).toBe('1')
    expect(new URL(urls[1]).searchParams.get('s')?.split(' ')).toHaveLength(3)
  })

  it('devuelve el resumen por ticker fresco y lo persiste en el doc insiders', async () => {
    const st = storageMemoria()
    const r = await obtenerInsiders(['AAPL', 'VOO'], fetchHtml([]), st)
    expect(r?.desactualizado).toBe(false)
    expect(r?.porTicker.AAPL.senal).toBe('compra_cluster')
    expect(r?.porTicker.VOO.senal).toBe('neutral')
    expect(r?.porTicker.NVDA).toBeUndefined()
    expect((st.datos.insiders as { porTicker: Record<string, unknown> }).porTicker.AAPL).toBeDefined()
  })

  it('sin red devuelve el persistido marcado desactualizado; sin persistido devuelve null', async () => {
    const previo = { fecha: '2026-08-01', porTicker: { AAPL: { senal: 'compras' } } }
    const conPrevio = await obtenerInsiders(['AAPL'], fetchRoto, storageMemoria({ insiders: previo }))
    expect(conPrevio).toMatchObject({ fecha: '2026-08-01', desactualizado: true })
    expect(conPrevio?.porTicker.AAPL.senal).toBe('compras')
    _resetCache()
    expect(await obtenerInsiders(['AAPL'], fetchRoto, storageMemoria())).toBeNull()
  })

  it('si falla un lote, sus tickers quedan SIN resumen (no neutral) y conservan lo persistido', async () => {
    // Nombres de 2 dígitos: los tickers se ordenan alfabéticamente antes de lotear → T00..T19 y T20.
    const tickers = Array.from({ length: 21 }, (_, i) => `T${String(i).padStart(2, '0')}`)
    const previo = { fecha: '2026-08-01', porTicker: { T20: { senal: 'compras', compras: 1 } } }
    const st = storageMemoria({ insiders: previo })
    let n = 0
    const fetchMitad = (async () => {
      n++
      if (n === 2) throw new Error('timeout')
      return { ok: true, text: async () => HTML }
    }) as unknown as typeof fetch
    const r = await obtenerInsiders(tickers, fetchMitad, st)
    expect(r?.desactualizado).toBe(false)
    expect(r?.porTicker.T00.senal).toBe('neutral') // lote 1 respondió: sin operaciones
    expect(r?.porTicker.T20).toBeUndefined() // lote 2 falló: sin dato
    const persistido = st.datos.insiders as { porTicker: Record<string, { senal: string }> }
    expect(persistido.porTicker.T20.senal).toBe('compras') // lo previo se conserva
    expect(persistido.porTicker.T00.senal).toBe('neutral')
  })

  it('una respuesta no-ok o sin tabla de resultados (página de error) se trata como fallo, no como "cero operaciones"', async () => {
    const previo = { fecha: '2026-08-01', porTicker: { AAPL: { senal: 'compras' } } }
    const error500 = (async () => ({ ok: false, text: async () => HTML })) as unknown as typeof fetch
    expect(await obtenerInsiders(['AAPL'], error500, storageMemoria({ insiders: previo }))).toMatchObject({ desactualizado: true })
    _resetCache()
    const sinTabla = fetchHtml([], '<html><body>Service unavailable</body></html>')
    const st = storageMemoria({ insiders: previo })
    expect(await obtenerInsiders(['AAPL'], sinTabla, st)).toMatchObject({ desactualizado: true })
    expect(st.datos.insiders).toEqual(previo) // no pisó el persistido
  })

  it('una respuesta sin cuerpo de texto se trata como fallo de red', async () => {
    const soloJson = (async () => ({ json: async () => ({}) })) as unknown as typeof fetch
    expect(await obtenerInsiders(['AAPL'], soloJson, storageMemoria())).toBeNull()
  })

  it('cachea en memoria: la segunda llamada con los mismos tickers no vuelve a pedir', async () => {
    const urls: string[] = []
    const st = storageMemoria()
    await obtenerInsiders(['AAPL'], fetchHtml(urls), st)
    await obtenerInsiders(['AAPL'], fetchHtml(urls), st)
    expect(urls).toHaveLength(1)
  })

  it('sin tickers no pide nada y devuelve un resultado vacío', async () => {
    const urls: string[] = []
    const r = await obtenerInsiders([], fetchHtml(urls), storageMemoria())
    expect(urls).toHaveLength(0)
    expect(r?.porTicker).toEqual({})
  })
})

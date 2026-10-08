import { describe, it, expect } from 'vitest'
import { DIAS_MES } from './indicadores'
import { mulberry32 } from './proyeccion'
import {
  ENCOGIMIENTO,
  LAMBDA_EWMA,
  MIN_DIAS_PREDICCION,
  VENTANA_DRIFT,
  VENTANA_INIT_EWMA,
  Z80,
  baseline,
  predecir,
  varianzaEwma,
} from './predictor'

function geometrica(n: number, factor: number, base = 100): number[] {
  return Array.from({ length: n }, (_, i) => base * factor ** i)
}

// 250 puntos alternando ×1.02 (índice impar) y ×0.99 (índice par): drift y
// volatilidad no triviales, deterministas y fáciles de reproducir.
function alternada(): number[] {
  const out = [100]
  for (let i = 1; i < 250; i++) out.push(out[i - 1] * (i % 2 === 1 ? 1.02 : 0.99))
  return out
}

describe('constantes del spec', () => {
  it('valores exactos', () => {
    expect(MIN_DIAS_PREDICCION).toBe(250)
    expect(ENCOGIMIENTO).toBe(0.25)
    expect(LAMBDA_EWMA).toBe(0.94)
    expect(VENTANA_INIT_EWMA).toBe(30)
    expect(Z80).toBe(1.2816)
    expect(DIAS_MES).toEqual({ acciones: 21, cripto: 30 })
    expect(VENTANA_DRIFT).toEqual({ acciones: 126, cripto: 180 })
  })
})

describe('varianzaEwma', () => {
  it('con ≤ 30 retornos es la media de r² (solo init, sin recursión)', () => {
    const r = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01))
    expect(varianzaEwma(r)).toBeCloseTo(0.0001, 12)
  })

  it('recursión verificada a mano: init 30 × (±0.01), luego 0.02 y 0.01', () => {
    const r: number[] = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01))
    r.push(0.02, 0.01)
    // init  = media(r²) = 0.0001
    // paso 1: 0.94 · 0.0001   + 0.06 · 0.02² = 0.000094   + 0.000024 = 0.000118
    // paso 2: 0.94 · 0.000118 + 0.06 · 0.01² = 0.00011092 + 0.000006 = 0.00011692
    expect(varianzaEwma(r)).toBeCloseTo(0.00011692, 9)
  })
})

describe('predecir', () => {
  it('null con menos de 250 precios; predicción con exactamente 250', () => {
    expect(predecir(geometrica(249, 1.001), 'acciones')).toBeNull()
    expect(predecir(geometrica(250, 1.001), 'acciones')).not.toBeNull()
  })

  it('null si algún retorno no es finito (precio 0 en la serie): no se filtra en silencio', () => {
    const precios = geometrica(250, 1.001)
    precios[100] = 0
    expect(predecir(precios, 'acciones')).toBeNull()
    expect(baseline(precios, 'acciones')).toBeNull()
  })

  it('serie geométrica (retorno constante): bandas pinned', () => {
    // r = ln(1.001) constante ⇒ drift observado = r y EWMA = r² exactos.
    // P = 100 · 1.001²⁴⁹ = 128.25824480022195
    const pred = predecir(geometrica(250, 1.001), 'acciones')!
    expect(pred.m1.h).toBe(21)
    expect(pred.m3.h).toBe(63)
    expect(pred.m1.p50).toBeCloseTo(128.93303301745988, 6)
    expect(pred.m1.p10).toBeCloseTo(128.17840098320244, 6)
    expect(pred.m1.p90).toBeCloseTo(129.69210784007137, 6)
    expect(pred.m3.p50).toBeCloseTo(130.2932786532207, 6)
    expect(pred.m3.p10).toBeCloseTo(128.97525926638605, 6)
    expect(pred.m3.p90).toBeCloseTo(131.62476709694235, 6)
  })

  it('cripto usa 30 días por mes (h = 30 / 90)', () => {
    const pred = predecir(geometrica(250, 1.001), 'cripto')!
    expect(pred.m1.h).toBe(30)
    expect(pred.m3.h).toBe(90)
    expect(pred.m1.p50).toBeCloseTo(129.22331366893332, 6)
  })

  it('serie alternada: bandas pinned (EWMA con recursión larga + drift de 126 retornos)', () => {
    const pred = predecir(alternada(), 'acciones')!
    expect(pred.m1.p10).toBeCloseTo(319.51232390573574, 5)
    expect(pred.m1.p50).toBeCloseTo(350.6738948872371, 5)
    expect(pred.m1.p90).toBeCloseTo(384.8746084412849, 5)
    expect(pred.m3.p10).toBeCloseTo(314.14984622940256, 5)
    expect(pred.m3.p50).toBeCloseTo(369.0958060333622, 5)
    expect(pred.m3.p90).toBeCloseTo(433.6520156433133, 5)
  })

  it('el encogimiento se aplica: ln(p50/P) = 0.25 · r · h con drift fuerte', () => {
    const precios = geometrica(250, 1.01) // +1%/día: sin shrinkage extrapolaría 4× más
    const ultimo = precios[precios.length - 1]
    const pred = predecir(precios, 'acciones')!
    expect(Math.log(pred.m1.p50 / ultimo)).toBeCloseTo(0.25 * Math.log(1.01) * 21, 10)
    expect(Math.log(pred.m3.p50 / ultimo)).toBeCloseTo(0.25 * Math.log(1.01) * 63, 10)
  })

  it('p10 < p50 < p90 en una serie pseudoaleatoria determinista, ambos motores y tipos', () => {
    const rng = mulberry32(7)
    const precios = [100]
    for (let i = 1; i < 300; i++) {
      precios.push(precios[i - 1] * Math.exp(0.0005 + 0.02 * (rng() * 2 - 1)))
    }
    for (const tipo of ['acciones', 'cripto'] as const) {
      for (const fn of [predecir, baseline]) {
        const pred = fn(precios, tipo)!
        for (const b of [pred.m1, pred.m3]) {
          expect(b.p10).toBeLessThan(b.p50)
          expect(b.p50).toBeLessThan(b.p90)
        }
      }
    }
  })
})

describe('baseline', () => {
  it('p50 === último precio EXACTO y bandas pinned (desvío poblacional, no EWMA)', () => {
    const precios = alternada()
    const ultimo = precios[precios.length - 1] // 341.8106580011178
    const base = baseline(precios, 'acciones')!
    expect(base.m1.p50).toBe(ultimo)
    expect(base.m3.p50).toBe(ultimo)
    expect(base.m1.p10).toBeCloseTo(313.1223472092355, 5)
    expect(base.m1.p90).toBeCloseTo(373.1273956153811, 5)
    expect(base.m3.p10).toBeCloseTo(293.65930379558904, 5)
    expect(base.m3.p90).toBeCloseTo(397.85739601318244, 5)
  })

  it('null con menos de 250 precios', () => {
    expect(baseline(geometrica(249, 1.001), 'acciones')).toBeNull()
  })
})

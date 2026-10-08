import { describe, it, expect } from 'vitest'
import { MIN_ORIGENES, WARMUP_PREDICCION, evaluarPredictor, prediccionEnOrigen } from './evaluacionPredictor'

// 190 puntos deterministas con drift y oscilación: con warmup reducido a 40,
// paso 21 y h3m 63 da exactamente 5 orígenes (i = 40, 61, 82, 103, 124;
// 145 + 63 ≥ 190 corta el loop).
function serieSintetica(n = 190): number[] {
  return Array.from({ length: n }, (_, i) => 100 * 1.002 ** i * (1 + 0.05 * Math.sin(i)))
}

describe('prediccionEnOrigen (anti look-ahead — test obligatorio del spec)', () => {
  it('alterar precios POSTERIORES al origen no cambia la predicción en el origen', () => {
    const precios = serieSintetica()
    const alterada = precios.map((p, idx) => (idx > 124 ? p * 3 : p))
    for (const i of [40, 82, 124]) {
      expect(prediccionEnOrigen(alterada, i, 'acciones', 40)).toEqual(prediccionEnOrigen(precios, i, 'acciones', 40))
    }
    // Sanity: en un origen posterior a la alteración la predicción SÍ difiere
    expect(prediccionEnOrigen(alterada, 150, 'acciones', 40)).not.toEqual(prediccionEnOrigen(precios, 150, 'acciones', 40))
  })

  it('la alteración del futuro sí cambia contra qué se califica (métricas a 3 m)', () => {
    const precios = serieSintetica()
    // idx > 150 solo toca los "reales" a 3 m de los orígenes 103 y 124
    // (i + 63 = 166 / 187); las predicciones en los 5 orígenes quedan intactas.
    const alterada = precios.map((p, idx) => (idx > 150 ? p * 1.5 : p))
    const e1 = evaluarPredictor(precios, 'acciones', 40)
    const e2 = evaluarPredictor(alterada, 'acciones', 40)
    expect(e2.modelo!.m3.errorMediano).not.toBe(e1.modelo!.m3.errorMediano)
    // los reales a 1 m (máximo índice 145) no se tocaron: métrica idéntica
    expect(e2.modelo!.m1.errorMediano).toBe(e1.modelo!.m1.errorMediano)
  })
})

describe('evaluarPredictor', () => {
  it('métricas pinned sobre la serie sintética (warmup 40, 5 orígenes)', () => {
    const r = evaluarPredictor(serieSintetica(), 'acciones', 40)
    const m = r.modelo!
    expect(m.m1.n).toBe(5)
    expect(m.m3.n).toBe(5)
    expect(m.m1.cobertura).toBe(1)
    expect(m.m3.cobertura).toBe(1)
    expect(m.m1.errorMediano).toBeCloseTo(0.058580269456967, 9)
    expect(m.m3.errorMediano).toBeCloseTo(0.107712728006194, 9)
    expect(m.m1.aciertoDireccional).toBeCloseTo(0.6, 12) // 3 de 5
    expect(m.m3.aciertoDireccional).toBeCloseTo(1, 12) // 5 de 5
    const b = r.baseline!
    expect(b.m1.n).toBe(5)
    expect(b.m1.cobertura).toBe(1)
    expect(b.m1.errorMediano).toBeCloseTo(0.058753343041642, 9)
    expect(b.m3.errorMediano).toBeCloseTo(0.132377557534331, 9)
    expect(b.m1.aciertoDireccional).toBeNull() // el baseline no opina dirección
    expect(b.m3.aciertoDireccional).toBeNull()
    expect(r.gana).toBe(true) // menor error mediano en AMBOS horizontes
  })

  it('evaluación insuficiente con menos de 4 orígenes', () => {
    // 150 puntos: orígenes 40, 61, 82 (103 + 63 ≥ 150) → 3 < MIN_ORIGENES
    const r = evaluarPredictor(serieSintetica(150), 'acciones', 40)
    expect(r).toEqual({ modelo: null, baseline: null, gana: null })
  })

  it('warmup default 250: una serie de 200 puntos no genera ningún origen', () => {
    expect(WARMUP_PREDICCION).toBe(250)
    expect(MIN_ORIGENES).toBe(4)
    expect(evaluarPredictor(serieSintetica(200), 'acciones')).toEqual({ modelo: null, baseline: null, gana: null })
  })

  it('serie constante: los empates del modelo se excluyen del acierto direccional', () => {
    const precios = Array.from({ length: 190 }, () => 100)
    const r = evaluarPredictor(precios, 'acciones', 40)
    // p50 === origen en todos los orígenes (drift exactamente 0) Y
    // real === origen: denominador vacío ⇒ null, NO 0/0 = NaN.
    expect(r.modelo!.m1.aciertoDireccional).toBeNull()
    expect(r.modelo!.m3.aciertoDireccional).toBeNull()
    expect(r.modelo!.m1.cobertura).toBe(1)
    expect(r.modelo!.m1.errorMediano).toBe(0)
    expect(r.baseline!.m1.errorMediano).toBe(0)
    expect(r.gana).toBe(false) // 0 < 0 es falso: sin mejora no hay victoria
  })

  it('retornos no finitos en la ventana: ticker no evaluable', () => {
    const precios = serieSintetica()
    precios[50] = 0
    expect(evaluarPredictor(precios, 'acciones', 40)).toEqual({ modelo: null, baseline: null, gana: null })
  })
})

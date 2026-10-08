// PRNG sembrable (Math.random no lo es). mulberry32: rápido y suficiente para bootstrap.
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PuntoBanda {
  dia: number
  p10: number
  p50: number
  p90: number
}

// Bootstrap iid de log-retornos históricos. Asume independencia entre días
// (ignora clustering de volatilidad) — limitación documentada en la UI.
export function proyectarBandas(
  retornosLog: number[],
  valorInicial: number,
  dias: number,
  opciones: { cadaNDias?: number; sims?: number; semilla?: number } = {}
): PuntoBanda[] {
  const { cadaNDias = 5, sims = 2000, semilla = 42 } = opciones
  const paso = Math.max(1, Math.floor(cadaNDias))
  const n = Math.max(1, Math.floor(sims))
  const inicio: PuntoBanda = { dia: 0, p10: valorInicial, p50: valorInicial, p90: valorInicial }
  if (retornosLog.length === 0 || dias <= 0) return [inicio]

  const rng = mulberry32(semilla)
  const checkpoints: number[] = []
  for (let d = paso; d < dias; d += paso) checkpoints.push(d)
  checkpoints.push(dias)

  // acumulados[s] = suma de log-retornos de la simulación s hasta el día actual
  const acumulados = new Array<number>(n).fill(0)
  const porCheckpoint: number[][] = checkpoints.map(() => new Array<number>(n))
  let ci = 0
  for (let d = 1; d <= dias; d++) {
    for (let s = 0; s < n; s++) {
      acumulados[s] += retornosLog[Math.floor(rng() * retornosLog.length)]
    }
    if (d === checkpoints[ci]) {
      for (let s = 0; s < n; s++) porCheckpoint[ci][s] = acumulados[s]
      ci++
    }
  }

  const cuantil = (ordenado: number[], p: number) =>
    ordenado[Math.min(ordenado.length - 1, Math.floor(p * ordenado.length))]

  return [
    inicio,
    ...checkpoints.map((dia, i) => {
      const finales = porCheckpoint[i].map((acum) => valorInicial * Math.exp(acum)).sort((a, b) => a - b)
      return { dia, p10: cuantil(finales, 0.1), p50: cuantil(finales, 0.5), p90: cuantil(finales, 0.9) }
    }),
  ]
}

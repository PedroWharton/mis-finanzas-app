'use client'
import { useEffect, useState } from 'react'

// La cifra cuenta hasta su valor al aparecer (ease-out, 900 ms). Con
// prefers-reduced-motion aparece directamente en su valor final.
export function useConteo(objetivo: number, duracion = 900): number {
  const [v, setV] = useState(objetivo)
  useEffect(() => {
    const quieto = !objetivo || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let raf = 0
    const paso = (t: number) => {
      const k = quieto ? 1 : Math.min(1, (t - t0) / duracion)
      setV(objetivo * (1 - Math.pow(1 - k, 4)))
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [objetivo, duracion])
  return v
}

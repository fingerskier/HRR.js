import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const HEIGHT = 34

/** One column per component, colored by phase. */
export function drawStrip(canvas: HTMLCanvasElement, v: PhaseVector): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const step = width / v.length

  for (let i = 0; i < v.length; i++) {
    ctx.fillStyle = phaseToColor(v[i]!)
    // Overdraw by a fraction of a pixel so no seams show between columns.
    ctx.fillRect(i * step, 0, step + 0.5, HEIGHT)
  }
}

/** Which component sits under a pointer at `clientX`. */
export function indexAtX(
  canvas: HTMLCanvasElement,
  length: number,
  clientX: number,
): number {
  const rect = canvas.getBoundingClientRect()
  const t = (clientX - rect.left) / rect.width
  const index = Math.floor(t * length)
  return index < 0 ? 0 : index >= length ? length - 1 : index
}

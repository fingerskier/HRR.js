import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const HEIGHT = 160
const TWO_PI = 2 * Math.PI

/** Phase against index — precise where the strip is impressionistic. */
export function drawScatter(canvas: HTMLCanvasElement, v: PhaseVector): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const pad = 24
  const plotWidth = width - pad - 6
  const plotHeight = HEIGHT - pad - 6

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, 6)
  ctx.lineTo(pad, HEIGHT - pad)
  ctx.lineTo(width - 6, HEIGHT - pad)
  ctx.stroke()

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText('2π', 2, 14)
  ctx.fillText('0', 8, HEIGHT - pad)
  ctx.fillText(`index 0…${v.length - 1}`, pad + 4, HEIGHT - 6)

  for (let i = 0; i < v.length; i++) {
    const x = pad + (i / Math.max(1, v.length - 1)) * plotWidth
    const y = HEIGHT - pad - (v[i]! / TWO_PI) * plotHeight
    ctx.fillStyle = phaseToColor(v[i]!)
    ctx.fillRect(x, y, 1.5, 1.5)
  }
}

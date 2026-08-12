import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const SIZE = 220
const MAX_ARROWS = 256

/**
 * Components as unit phasors on a circle, with the resultant mean overlaid.
 * A uniform ring means an unstructured vector; a clump means agreement.
 * Given a magnitude array, an inner ring shows mean consensus strength.
 */
export function drawDial(
  canvas: HTMLCanvasElement,
  v: PhaseVector,
  options?: { magnitude?: Float64Array },
): void {
  const ctx = fitCanvas(canvas, SIZE)
  const width = cssWidth(canvas)
  const cx = width / 2
  const cy = SIZE / 2
  const radius = Math.min(cx, cy) - 12

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  const stride = Math.max(1, Math.ceil(v.length / MAX_ARROWS))
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5

  let sumCos = 0
  let sumSin = 0
  for (let i = 0; i < v.length; i++) {
    const phase = v[i]!
    sumCos += Math.cos(phase)
    sumSin += Math.sin(phase)
    if (i % stride !== 0) continue

    ctx.strokeStyle = phaseToColor(phase)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(phase) * radius, cy - Math.sin(phase) * radius)
    ctx.stroke()
  }

  ctx.globalAlpha = 1

  // The resultant: long when phases agree, near zero when they cancel.
  const meanCos = sumCos / v.length
  const meanSin = sumSin / v.length
  const resultant = Math.hypot(meanCos, meanSin)
  const angle = Math.atan2(meanSin, meanCos)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(
    cx + Math.cos(angle) * radius * resultant,
    cy - Math.sin(angle) * radius * resultant,
  )
  ctx.stroke()

  if (options?.magnitude !== undefined) {
    const mags = options.magnitude
    let total = 0
    let peak = 0
    for (let i = 0; i < mags.length; i++) {
      total += mags[i]!
      if (mags[i]! > peak) peak = mags[i]!
    }
    const mean = mags.length === 0 ? 0 : total / mags.length
    const ratio = peak === 0 ? 0 : mean / peak

    ctx.strokeStyle = '#9ece6a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`resultant ${resultant.toFixed(3)}`, 8, SIZE - 8)
}

import { cssWidth, fitCanvas } from './canvas.js'

const HEIGHT = 180

/** A plain line chart with labelled axes, for the memory capacity sweep. */
export function drawChart(
  canvas: HTMLCanvasElement,
  points: Array<{ x: number; y: number }>,
  options: { xLabel: string; yLabel: string; yMin: number; yMax: number },
): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const padLeft = 42
  const padBottom = 28
  const plotWidth = width - padLeft - 10
  const plotHeight = HEIGHT - padBottom - 12

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padLeft, 12)
  ctx.lineTo(padLeft, HEIGHT - padBottom)
  ctx.lineTo(width - 10, HEIGHT - padBottom)
  ctx.stroke()

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText(options.yMax.toFixed(2), 4, 16)
  ctx.fillText(options.yMin.toFixed(2), 4, HEIGHT - padBottom)
  ctx.fillText(options.xLabel, width / 2 - 30, HEIGHT - 8)
  ctx.save()
  ctx.translate(12, HEIGHT / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(options.yLabel, -22, 0)
  ctx.restore()

  if (points.length === 0) return

  const xs = points.map(p => p.x)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xSpan = xMax - xMin || 1
  const ySpan = options.yMax - options.yMin || 1

  const px = (x: number) => padLeft + ((x - xMin) / xSpan) * plotWidth
  const py = (y: number) =>
    HEIGHT - padBottom - ((y - options.yMin) / ySpan) * plotHeight

  ctx.strokeStyle = '#7aa2f7'
  ctx.lineWidth = 2
  ctx.beginPath()
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(px(p.x), py(p.y))
    else ctx.lineTo(px(p.x), py(p.y))
  })
  ctx.stroke()

  ctx.fillStyle = '#7aa2f7'
  for (const p of points) ctx.fillRect(px(p.x) - 1.5, py(p.y) - 1.5, 3, 3)
}

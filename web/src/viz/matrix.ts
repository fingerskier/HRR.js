import { similarity } from 'hrr-lib'
import type { Entry } from '../state.js'
import { cssWidth, fitCanvas } from './canvas.js'
import { similarityToColor } from './color.js'

const LABEL = 84
const MAX_CELL = 46

/** Every pair's cosine similarity as a heatmap, with names down both edges. */
export function drawMatrix(canvas: HTMLCanvasElement, entries: Entry[]): void {
  const n = entries.length
  const width = cssWidth(canvas)
  const cell =
    n === 0 ? MAX_CELL : Math.min(MAX_CELL, Math.max(12, (width - LABEL) / n))
  const height = LABEL + cell * n
  const ctx = fitCanvas(canvas, Math.max(60, height))

  if (n === 0) {
    ctx.fillStyle = '#9aa3b2'
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Add some atoms to compare them.', 4, 24)
    return
  }

  const compatible = entries.every(e => e.vector.length === entries[0]!.vector.length)
  if (!compatible) {
    ctx.fillStyle = '#f7768e'
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Entries have mismatched dimensions.', 4, 24)
    return
  }

  ctx.font = '11px ui-monospace, monospace'

  for (let i = 0; i < n; i++) {
    const label = entries[i]!.name.slice(0, 11)

    ctx.fillStyle = entries[i]!.color
    ctx.textAlign = 'right'
    ctx.fillText(label, LABEL - 6, LABEL + i * cell + cell / 2 + 4)

    ctx.save()
    ctx.translate(LABEL + i * cell + cell / 2, LABEL - 6)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'left'
    ctx.fillText(label, 0, 4)
    ctx.restore()
  }

  ctx.textAlign = 'left'

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const s = similarity(entries[row]!.vector, entries[col]!.vector)
      ctx.fillStyle = similarityToColor(s)
      ctx.fillRect(LABEL + col * cell, LABEL + row * cell, cell - 1, cell - 1)

      if (cell >= 34) {
        ctx.fillStyle = Math.abs(s) > 0.55 ? '#0f1115' : '#e6e9ef'
        ctx.fillText(
          s.toFixed(2),
          LABEL + col * cell + 4,
          LABEL + row * cell + cell / 2 + 4,
        )
      }
    }
  }
}

/** Which cell a pointer is over, or null outside the grid. */
export function cellAt(
  canvas: HTMLCanvasElement,
  count: number,
  clientX: number,
  clientY: number,
): { row: number; col: number } | null {
  if (count === 0) return null
  const rect = canvas.getBoundingClientRect()
  const cell = Math.min(MAX_CELL, Math.max(12, (rect.width - LABEL) / count))
  const col = Math.floor((clientX - rect.left - LABEL) / cell)
  const row = Math.floor((clientY - rect.top - LABEL) / cell)
  if (row < 0 || col < 0 || row >= count || col >= count) return null
  return { row, col }
}

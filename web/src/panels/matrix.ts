import { similarity } from 'hrr-lib'
import type { Store } from '../state.js'
import { cellAt, drawMatrix } from '../viz/matrix.js'

/**
 * Every named vector against every other. The diagonal is 1 by definition;
 * everything else being near zero is the whole point of the representation.
 */
export function mountMatrix(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Similarity</h2>
    <p class="hint">
      Cosine similarity between every pair. Red is alike, blue is opposed, dark
      is unrelated — the near-black field off the diagonal is what makes
      superposition possible.
    </p>
    <canvas id="matrix"></canvas>
    <p class="readout" id="matrix-readout"></p>
  `
  root.append(panel)

  const canvas = panel.querySelector<HTMLCanvasElement>('#matrix')!
  const readout = panel.querySelector<HTMLParagraphElement>('#matrix-readout')!

  canvas.addEventListener('mousemove', event => {
    const entries = store.entries
    const cell = cellAt(canvas, entries.length, event.clientX, event.clientY)
    if (cell === null) {
      readout.textContent = ''
      return
    }
    const a = entries[cell.row]!
    const b = entries[cell.col]!
    readout.textContent = `similarity(${a.name}, ${b.name}) = ${similarity(
      a.vector,
      b.vector,
    ).toFixed(6)}`
  })

  canvas.addEventListener('mouseleave', () => {
    readout.textContent = ''
  })

  const render = (): void => {
    queueMicrotask(() => {
      drawMatrix(canvas, store.entries)
    })
  }

  store.subscribe(render)
  window.addEventListener('resize', render)
  render()
}

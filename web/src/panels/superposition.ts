import { Superposition } from 'hrr-lib'
import type { Store } from '../state.js'
import { fitCanvas, cssWidth } from '../viz/canvas.js'
import { magnitudeToColor } from '../viz/color.js'
import { drawDial } from '../viz/dial.js'
import { drawStrip } from '../viz/strip.js'

interface Contribution {
  name: string
  weight: number
}

/**
 * The accumulator behind bundle, kept unreduced. Reducing to phases throws
 * away how strongly the members agreed; the magnitude strip is that discarded
 * information, and it is where cancellation becomes visible.
 */
export function mountSuperposition(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Superposition</h2>
    <p class="hint">
      Add vectors with weights. The top strip is the reduced result; the
      grayscale strip below is per-component consensus — bright where the
      members agree, dark where they cancel.
    </p>
    <form class="row" id="sup-form">
      <select id="sup-name"></select>
      <label for="sup-weight">weight</label>
      <input id="sup-weight" type="number" step="0.1" value="1" size="5" />
      <button type="submit">Add</button>
    </form>
    <p class="error" id="sup-error"></p>
    <ul class="contributions" id="contributions"></ul>
    <canvas id="sup-strip"></canvas>
    <p class="readout">reduced phases</p>
    <canvas id="sup-magnitude"></canvas>
    <p class="readout" id="sup-readout">consensus magnitude</p>
    <canvas id="sup-dial"></canvas>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#sup-form')!
  const select = panel.querySelector<HTMLSelectElement>('#sup-name')!
  const weightInput = panel.querySelector<HTMLInputElement>('#sup-weight')!
  const error = panel.querySelector<HTMLParagraphElement>('#sup-error')!
  const list = panel.querySelector<HTMLUListElement>('#contributions')!
  const strip = panel.querySelector<HTMLCanvasElement>('#sup-strip')!
  const magnitudeCanvas = panel.querySelector<HTMLCanvasElement>('#sup-magnitude')!
  const readout = panel.querySelector<HTMLParagraphElement>('#sup-readout')!
  const dial = panel.querySelector<HTMLCanvasElement>('#sup-dial')!

  let contributions: Contribution[] = []

  const drawMagnitude = (magnitude: Float64Array): void => {
    const ctx = fitCanvas(magnitudeCanvas, 22)
    const width = cssWidth(magnitudeCanvas)
    let peak = 0
    for (let i = 0; i < magnitude.length; i++) {
      if (magnitude[i]! > peak) peak = magnitude[i]!
    }
    const step = width / magnitude.length
    for (let i = 0; i < magnitude.length; i++) {
      ctx.fillStyle = magnitudeToColor(magnitude[i]!, peak)
      ctx.fillRect(i * step, 0, step + 0.5, 22)
    }
    readout.textContent = `consensus magnitude — peak ${peak.toFixed(3)}, total weight ${contributions
      .reduce((sum, c) => sum + Math.abs(c.weight), 0)
      .toFixed(2)}`
  }

  const render = (): void => {
    select.replaceChildren()
    for (const entry of store.entries) {
      const option = document.createElement('option')
      option.value = entry.name
      option.textContent = entry.name
      select.append(option)
    }

    list.replaceChildren()
    for (const [index, contribution] of contributions.entries()) {
      const item = document.createElement('li')
      item.textContent = `${contribution.name} × ${contribution.weight}`
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        contributions.splice(index, 1)
        render()
      })
      item.append(remove)
      list.append(item)
    }

    const accumulator = new Superposition(store.dim)
    let added = 0
    for (const contribution of contributions) {
      const entry = store.get(contribution.name)
      if (entry === undefined) continue
      accumulator.add(entry.vector, contribution.weight)
      added++
    }

    // Drop contributions whose vector has since been removed from the shelf.
    contributions = contributions.filter(c => store.get(c.name) !== undefined)

    queueMicrotask(() => {
      const reduced = accumulator.toVector()
      drawStrip(strip, reduced)
      drawMagnitude(accumulator.magnitude)
      drawDial(dial, reduced, { magnitude: accumulator.magnitude })
      if (added === 0) readout.textContent = 'add a vector to see consensus'
    })
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    const name = select.value
    const weight = Number(weightInput.value)
    if (name === '' || !Number.isFinite(weight)) {
      error.textContent = 'pick a vector and a finite weight'
      return
    }
    contributions.push({ name, weight })
    render()
  })

  store.subscribe(render)
  window.addEventListener('resize', render)
  render()
}

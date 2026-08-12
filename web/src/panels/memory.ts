import { HolographicMemory } from 'hrr-lib'
import type { Store } from '../state.js'
import { drawChart } from '../viz/chart.js'

const SEED: Array<[string, string]> = [
  ['capital-of-france', 'paris'],
  ['capital-of-japan', 'tokyo'],
  ['capital-of-peru', 'lima'],
]

/**
 * One superposed trace holding every key→value binding, plus a sweep showing
 * how confidence decays as the trace fills up. The decay, not the lookup, is
 * the interesting part: the memory degrades gradually rather than failing.
 */
export function mountMemory(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Holographic memory</h2>
    <p class="hint">
      Every fact is bound and summed into a single vector. Probing unbinds the
      key and cleans up against the known values — confidence falls as the
      trace crowds.
    </p>
    <form class="row" id="store-form">
      <input id="mem-key" placeholder="key" autocomplete="off" size="16" />
      <input id="mem-value" placeholder="value" autocomplete="off" size="16" />
      <button type="submit">Store</button>
    </form>
    <p class="error" id="mem-error"></p>
    <table class="facts"><tbody id="facts"></tbody></table>
    <form class="row" id="probe-form">
      <input id="probe-key" placeholder="probe a key" autocomplete="off" size="16" />
      <button type="submit">Probe</button>
    </form>
    <p class="readout" id="probe-readout"></p>
    <div class="confidence"><span id="confidence-bar"></span></div>
    <h3 class="subhead">Capacity</h3>
    <p class="hint">
      Mean probe confidence over a fresh memory holding N synthetic facts, at
      the current dimension.
    </p>
    <canvas id="capacity"></canvas>
  `
  root.append(panel)

  const storeForm = panel.querySelector<HTMLFormElement>('#store-form')!
  const keyInput = panel.querySelector<HTMLInputElement>('#mem-key')!
  const valueInput = panel.querySelector<HTMLInputElement>('#mem-value')!
  const error = panel.querySelector<HTMLParagraphElement>('#mem-error')!
  const facts = panel.querySelector<HTMLTableSectionElement>('#facts')!
  const probeForm = panel.querySelector<HTMLFormElement>('#probe-form')!
  const probeInput = panel.querySelector<HTMLInputElement>('#probe-key')!
  const probeReadout = panel.querySelector<HTMLParagraphElement>('#probe-readout')!
  const bar = panel.querySelector<HTMLSpanElement>('#confidence-bar')!
  const capacity = panel.querySelector<HTMLCanvasElement>('#capacity')!

  let memory = new HolographicMemory(store.dim)
  for (const [key, value] of SEED) memory.store(key, value)

  const renderFacts = (): void => {
    facts.replaceChildren()
    for (const key of [...memory.keys()]) {
      const row = document.createElement('tr')

      const keyCell = document.createElement('td')
      keyCell.textContent = key

      const probeCell = document.createElement('td')
      const probed = memory.probe(key)
      probeCell.textContent = probed === null ? '—' : probed.value

      const confCell = document.createElement('td')
      confCell.textContent = probed === null ? '—' : probed.confidence.toFixed(4)

      const actionCell = document.createElement('td')
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        memory.delete(key)
        renderFacts()
      })
      actionCell.append(remove)

      row.append(keyCell, probeCell, confCell, actionCell)
      facts.append(row)
    }
  }

  const renderCapacity = (): void => {
    const points: Array<{ x: number; y: number }> = []
    const step = Math.max(1, Math.round(store.dim / 32))

    for (let n = step; n <= store.dim; n += step) {
      const sweep = new HolographicMemory(store.dim)
      for (let i = 0; i < n; i++) sweep.store(`k${i}`, `v${i}`)

      let total = 0
      for (let i = 0; i < n; i++) {
        total += sweep.probe(`k${i}`)?.confidence ?? 0
      }
      points.push({ x: n, y: total / n })
    }

    queueMicrotask(() => {
      drawChart(capacity, points, {
        xLabel: 'facts stored',
        yLabel: 'mean confidence',
        yMin: 0,
        yMax: 1,
      })
    })
  }

  storeForm.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    const key = keyInput.value.trim()
    const value = valueInput.value.trim()
    if (key === '' || value === '') {
      error.textContent = 'both a key and a value are required'
      return
    }
    memory.store(key, value)
    keyInput.value = ''
    valueInput.value = ''
    renderFacts()
  })

  probeForm.addEventListener('submit', event => {
    event.preventDefault()
    const key = probeInput.value.trim()
    if (key === '') return

    const result = memory.probe(key)
    if (result === null) {
      probeReadout.textContent = 'the memory is empty'
      bar.style.width = '0%'
      return
    }
    probeReadout.textContent = `${key} → ${result.value} (confidence ${result.confidence.toFixed(4)})`
    bar.style.width = `${Math.max(0, Math.min(1, result.confidence)) * 100}%`
    // An unstored key still returns the nearest value — degradation, not error.
    bar.style.background = result.confidence > 0.3 ? 'var(--accent)' : 'var(--bad)'
  })

  const onDimChange = (): void => {
    const rebuilt = new HolographicMemory(store.dim)
    for (const key of [...memory.keys()]) {
      const probed = memory.probe(key)
      if (probed !== null) rebuilt.store(key, probed.value)
    }
    memory = rebuilt
    renderFacts()
    renderCapacity()
  }

  let lastDim = store.dim
  store.subscribe(() => {
    if (store.dim === lastDim) return
    lastDim = store.dim
    onDimChange()
  })

  window.addEventListener('resize', renderCapacity)
  renderFacts()
  renderCapacity()
}

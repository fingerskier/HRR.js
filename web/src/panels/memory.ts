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
 * how recall accuracy decays as the trace fills up. Recall is reconstructed
 * from the trace, not looked up from a ground truth, so a crowded trace can
 * return the wrong value — the facts table keeps its own record of what was
 * actually stored and flags any row where recall no longer agrees with it.
 */
export function mountMemory(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Holographic memory</h2>
    <p class="hint">
      Every fact is bound and summed into a single vector. Recall is
      reconstructed, not looked up — unbinding the key and cleaning up
      against the known values — so once the trace is crowded it can return
      the wrong value. Mismatches below are highlighted, not hidden.
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
      Share of probes that still return the exact stored value as the trace
      fills with synthetic facts, at the current dimension.
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
  // Ground truth: exactly what the user (or the seed) stored, independent of
  // whatever the trace's cleanup step reconstructs. A dimension change must
  // migrate from here, never from `probe` — probing returns the best guess,
  // not a fact, and re-storing a guess would silently bake corruption in.
  const trueFacts = new Map<string, string>()
  for (const [key, value] of SEED) {
    memory.store(key, value)
    trueFacts.set(key, value)
  }

  const renderFacts = (): void => {
    facts.replaceChildren()
    for (const [key, storedValue] of trueFacts) {
      const row = document.createElement('tr')

      const keyCell = document.createElement('td')
      keyCell.textContent = key

      const storedCell = document.createElement('td')
      storedCell.textContent = storedValue

      const recalledCell = document.createElement('td')
      const probed = memory.probe(key)
      const recalledValue = probed === null ? null : probed.value
      recalledCell.textContent = recalledValue === null ? '—' : recalledValue

      const confCell = document.createElement('td')
      confCell.textContent = probed === null ? '—' : probed.confidence.toFixed(4)

      const actionCell = document.createElement('td')
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        memory.delete(key)
        trueFacts.delete(key)
        renderFacts()
      })
      actionCell.append(remove)

      if (recalledValue !== storedValue) row.classList.add('fact-mismatch')

      row.append(keyCell, storedCell, recalledCell, confCell, actionCell)
      facts.append(row)
    }
  }

  const computeCapacity = (): Array<{ x: number; y: number }> => {
    const maxFacts = Math.min(store.dim, 256)
    const step = Math.max(1, Math.round(maxFacts / 16))
    const memory = new HolographicMemory(store.dim)
    const points: Array<{ x: number; y: number }> = []

    for (let n = 1; n <= maxFacts; n++) {
      memory.store(`k${n}`, `v${n}`)
      if (n !== 1 && n % step !== 0 && n !== maxFacts) continue

      const stride = Math.max(1, Math.floor(n / 6))
      let correct = 0
      let probes = 0
      for (let i = 1; i <= n; i += stride) {
        if (memory.probe(`k${i}`)?.value === `v${i}`) correct++
        probes++
      }
      points.push({ x: n, y: correct / probes })
    }
    return points
  }

  let capacityPoints: Array<{ x: number; y: number }> = []

  const drawCapacity = (): void => {
    queueMicrotask(() => {
      drawChart(capacity, capacityPoints, {
        xLabel: 'facts stored',
        yLabel: 'probe accuracy',
        yMin: 0,
        yMax: 1,
      })
    })
  }

  const renderCapacity = (): void => {
    capacityPoints = computeCapacity()
    drawCapacity()
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
    trueFacts.set(key, value)
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
    // Migrate from the ground truth, not from `probe` — probing returns the
    // trace's best guess, and re-storing a guess would bake a bad recall in
    // as if the user had typed it. A dimension change never alters facts.
    const rebuilt = new HolographicMemory(store.dim)
    for (const [key, value] of trueFacts) rebuilt.store(key, value)
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

  window.addEventListener('resize', drawCapacity)
  renderFacts()
  renderCapacity()
}

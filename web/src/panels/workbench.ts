import { ExprError, splitAssignment } from '../expr.js'
import type { Entry, Store } from '../state.js'
import { onResize } from '../viz/canvas.js'
import { drawDial } from '../viz/dial.js'
import { drawScatter } from '../viz/scatter.js'
import { drawStrip, indexAtX } from '../viz/strip.js'

const EXAMPLES = [
  'pet = bind(dog, role)',
  'back = unbind(pet, role)',
  'blend = bundle(dog, cat)',
  'shifted = permute(dog, 1)',
  'similarity(back, dog)',
]

/**
 * The expression bar and one row per named vector. A row shows the strip; the
 * row expands to a dial and a scatter when clicked.
 */
export function mountWorkbench(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Workbench</h2>
    <p class="hint">
      Combine named vectors: <code>bind</code>, <code>unbind</code>,
      <code>bundle</code>, <code>permute</code>, <code>similarity</code>.
      Write <code>name = expression</code> to keep the result.
    </p>
    <form class="row" id="expr-form">
      <input id="expr-input" placeholder="pet = bind(dog, role)" autocomplete="off" />
      <button type="submit">Run</button>
    </form>
    <p class="error" id="expr-error"></p>
    <p class="readout" id="expr-result"></p>
    <div class="row examples" id="examples"></div>
    <div id="rows"></div>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#expr-form')!
  const input = panel.querySelector<HTMLInputElement>('#expr-input')!
  const error = panel.querySelector<HTMLParagraphElement>('#expr-error')!
  const result = panel.querySelector<HTMLParagraphElement>('#expr-result')!
  const examples = panel.querySelector<HTMLDivElement>('#examples')!
  const rows = panel.querySelector<HTMLDivElement>('#rows')!

  for (const example of EXAMPLES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'example'
    button.textContent = example
    button.addEventListener('click', () => {
      input.value = example
      input.focus()
    })
    examples.append(button)
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    result.textContent = ''

    const line = input.value.trim()
    if (line === '') return

    try {
      const { name, expression } = splitAssignment(line)

      if (name === null) {
        // A bare expression: a scalar just prints, anything else yields a
        // vector and gets an automatic name and a row.
        try {
          const scalar = store.submitScalar(line)
          result.textContent = `= ${scalar.toFixed(6)}`
        } catch {
          const entry = store.submit(line)
          result.textContent = `stored ${entry.name}`
        }
        input.value = ''
        return
      }

      // A named assignment must produce a vector — a scalar result has
      // nothing to store under that name. Check before storing so this is
      // reported instead of silently discarded.
      let isScalar = true
      try {
        store.submitScalar(line)
      } catch {
        isScalar = false
      }
      if (isScalar) {
        throw new ExprError(
          `${expression} yields a number, not a vector — there is nothing to store under "${name}"`,
        )
      }

      const entry = store.submit(line)
      result.textContent = `stored ${entry.name}`
      input.value = ''
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
    }
  })

  const expanded = new Set<string>()

  const buildRow = (entry: Entry): HTMLElement => {
    const row = document.createElement('article')
    row.className = 'vrow'

    const head = document.createElement('div')
    head.className = 'vrow-head'
    head.innerHTML = `
      <button type="button" class="vrow-toggle"></button>
      <span class="vrow-readout"></span>
    `
    const toggle = head.querySelector<HTMLButtonElement>('.vrow-toggle')!
    const readout = head.querySelector<HTMLSpanElement>('.vrow-readout')!
    toggle.style.color = entry.color
    toggle.textContent =
      entry.kind === 'atom' ? entry.name : `${entry.name} = ${entry.source}`

    const strip = document.createElement('canvas')
    strip.className = 'strip'

    const detail = document.createElement('div')
    detail.className = 'vrow-detail'

    const dial = document.createElement('canvas')
    const scatter = document.createElement('canvas')
    detail.append(dial, scatter)

    row.append(head, strip, detail)

    const isOpen = expanded.has(entry.name)
    detail.hidden = !isOpen

    toggle.addEventListener('click', () => {
      if (expanded.has(entry.name)) expanded.delete(entry.name)
      else expanded.add(entry.name)
      detail.hidden = !expanded.has(entry.name)
      if (!detail.hidden) {
        drawDial(dial, entry.vector)
        drawScatter(scatter, entry.vector)
      }
    })

    strip.addEventListener('mousemove', event => {
      const i = indexAtX(strip, entry.vector.length, event.clientX)
      readout.textContent = `[${i}] ${entry.vector[i]!.toFixed(4)} rad`
    })
    strip.addEventListener('mouseleave', () => {
      readout.textContent = `dim ${entry.vector.length}`
    })
    readout.textContent = `dim ${entry.vector.length}`

    // Canvases must be in the document before they report a width.
    queueMicrotask(() => {
      drawStrip(strip, entry.vector)
      if (isOpen) {
        drawDial(dial, entry.vector)
        drawScatter(scatter, entry.vector)
      }
    })

    return row
  }

  const render = (): void => {
    const live = new Set(store.entries.map(entry => entry.name))
    for (const name of expanded) {
      if (!live.has(name)) expanded.delete(name)
    }

    rows.replaceChildren()
    if (store.entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'Add an atom above to get started.'
      rows.append(empty)
      return
    }
    for (const entry of store.entries) rows.append(buildRow(entry))
  }

  store.subscribe(render)
  render()

  // Coalesce a burst of resize events into one render per frame, rather than
  // rebuilding every row's DOM on every single event.
  onResize(render)
}

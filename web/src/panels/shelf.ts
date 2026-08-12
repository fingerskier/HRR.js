import { DIMS, Store } from '../state.js'

/**
 * Atom management: type a label, get a deterministic vector. Also owns the
 * dimension selector, since changing it re-encodes everything on the shelf.
 */
export function mountShelf(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Atoms</h2>
    <p class="hint">
      Every label hashes to a fixed phase vector. Unrelated labels come out
      near-orthogonal — similarity close to zero.
    </p>
    <form class="row" id="atom-form">
      <input id="atom-label" placeholder="label, e.g. dog" autocomplete="off" size="18" />
      <button type="submit">Add atom</button>
      <label for="dim-select">dim</label>
      <select id="dim-select"></select>
      <button type="button" id="reset">Clear all</button>
    </form>
    <p class="error" id="atom-error"></p>
    <div class="chips" id="chips"></div>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#atom-form')!
  const input = panel.querySelector<HTMLInputElement>('#atom-label')!
  const select = panel.querySelector<HTMLSelectElement>('#dim-select')!
  const reset = panel.querySelector<HTMLButtonElement>('#reset')!
  const error = panel.querySelector<HTMLParagraphElement>('#atom-error')!
  const chips = panel.querySelector<HTMLDivElement>('#chips')!

  for (const dim of DIMS) {
    const option = document.createElement('option')
    option.value = String(dim)
    option.textContent = String(dim)
    select.append(option)
  }
  select.value = String(store.dim)

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    try {
      store.addAtom(input.value)
      input.value = ''
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
    }
  })

  select.addEventListener('change', () => {
    error.textContent = ''
    try {
      store.setDim(Number(select.value))
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
      select.value = String(store.dim)
    }
  })

  reset.addEventListener('click', () => {
    store.reset()
    error.textContent = ''
  })

  const render = (): void => {
    select.value = String(store.dim)
    chips.replaceChildren()

    for (const entry of store.entries) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.style.borderColor = entry.color

      const dot = document.createElement('i')
      dot.style.background = entry.color
      chip.append(dot, document.createTextNode(entry.name))

      if (entry.kind === 'derived') {
        const source = document.createElement('em')
        source.textContent = entry.source
        chip.append(source)
      }

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.title = `remove ${entry.name} and anything derived from it`
      remove.addEventListener('click', () => {
        store.remove(entry.name)
      })
      chip.append(remove)

      chips.append(chip)
    }
  }

  store.subscribe(render)
  render()
}

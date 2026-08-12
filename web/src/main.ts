import './style.css'
import { mountMatrix } from './panels/matrix.js'
import { mountShelf } from './panels/shelf.js'
import { mountWorkbench } from './panels/workbench.js'
import { Store } from './state.js'

const app = document.querySelector<HTMLElement>('#app')
if (app === null) throw new Error('#app is missing from index.html')

const store = new Store()

mountShelf(app, store)
mountWorkbench(app, store)
mountMatrix(app, store)

// A starting point that already shows the interesting behaviour.
store.addAtom('dog')
store.addAtom('cat')
store.addAtom('role')

import './style.css'
import { encodeAtom, similarity } from 'hrr-lib'

const app = document.querySelector<HTMLElement>('#app')
if (app === null) throw new Error('#app is missing from index.html')

const self = similarity(encodeAtom('dog', 256), encodeAtom('dog', 256))
app.textContent = `library loaded — similarity(dog, dog) = ${self.toFixed(3)}`

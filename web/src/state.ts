import { encodeAtom, type PhaseVector } from 'hrr-lib'
import { ExprError, evaluate, identifiers, splitAssignment } from './expr.js'

/** Dimensions the workbench offers. Smaller vectors read better on screen. */
export const DIMS = [64, 256, 1024] as const

const DEFAULT_DIM = 256

/** Names the expression language owns, so an atom may not take them. */
const RESERVED = new Set(['bind', 'unbind', 'bundle', 'permute', 'similarity'])

const PALETTE = [
  '#7aa2f7',
  '#9ece6a',
  '#e0af68',
  '#bb9af7',
  '#7dcfff',
  '#f7768e',
  '#73daca',
  '#ff9e64',
]

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A named vector on the shelf: either encoded from a label or computed. */
export interface Entry {
  name: string
  kind: 'atom' | 'derived'
  /** An atom's label, or a derived entry's expression text. */
  source: string
  vector: PhaseVector
  color: string
}

type Listener = () => void

/**
 * Every named vector in the app, in insertion order, plus the dimension they
 * all share. Panels subscribe and redraw; nothing else holds vector state.
 */
export class Store {
  #dim: number = DEFAULT_DIM
  #entries = new Map<string, Entry>()
  #listeners = new Set<Listener>()
  #colorCursor = 0
  #resultCursor = 0

  get dim(): number {
    return this.#dim
  }

  /** Entries in insertion order. Derived entries follow their dependencies. */
  get entries(): Entry[] {
    return [...this.#entries.values()]
  }

  get(name: string): Entry | undefined {
    return this.#entries.get(name)
  }

  /** The name→vector map the evaluator reads. */
  env(): Map<string, PhaseVector> {
    const env = new Map<string, PhaseVector>()
    for (const entry of this.#entries.values()) env.set(entry.name, entry.vector)
    return env
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Encode `label` and add it to the shelf under the same name. */
  addAtom(label: string): Entry {
    const name = label.trim()
    if (!IDENT.test(name)) {
      throw new ExprError(
        `"${name}" is not a valid name — letters, digits, and _ only, not starting with a digit`,
      )
    }
    if (RESERVED.has(name)) {
      throw new ExprError(`"${name}" is a reserved function name`)
    }
    if (this.#entries.has(name)) {
      throw new ExprError(`"${name}" already exists`)
    }

    const entry: Entry = {
      name,
      kind: 'atom',
      source: name,
      vector: encodeAtom(name, this.#dim),
      color: this.#nextColor(),
    }
    this.#entries.set(name, entry)
    this.#emit()
    return entry
  }

  /** Evaluate `expression` and store the vector it produces under `name`. */
  addDerived(name: string, expression: string): Entry {
    if (!IDENT.test(name)) throw new ExprError(`"${name}" is not a valid name`)
    if (RESERVED.has(name)) {
      throw new ExprError(`"${name}" is a reserved function name`)
    }
    if (this.#entries.has(name)) throw new ExprError(`"${name}" already exists`)

    const value = evaluate(expression, this.env())
    if (value.kind !== 'vector') {
      throw new ExprError(
        `"${expression}" produces a number, not a vector — nothing to store`,
      )
    }

    const entry: Entry = {
      name,
      kind: 'derived',
      source: expression,
      vector: value.vector,
      color: this.#nextColor(),
    }
    this.#entries.set(name, entry)
    this.#emit()
    return entry
  }

  /**
   * Run one line from the expression bar. `name = expr` stores under that
   * name; a bare expression gets the next automatic name (`r1`, `r2`, ...).
   */
  submit(line: string): Entry {
    const { name, expression } = splitAssignment(line)
    return this.addDerived(name ?? this.#nextResultName(), expression)
  }

  /** Evaluate a line that yields a number, storing nothing. */
  submitScalar(line: string): number {
    const { expression } = splitAssignment(line)
    const value = evaluate(expression, this.env())
    if (value.kind !== 'scalar') {
      throw new ExprError(`"${expression}" produces a vector, not a number`)
    }
    return value.value
  }

  /** Remove `name` and every entry whose expression depends on it. */
  remove(name: string): boolean {
    if (!this.#entries.has(name)) return false

    const doomed = new Set([name])
    let grew = true
    while (grew) {
      grew = false
      for (const entry of this.#entries.values()) {
        if (entry.kind !== 'derived' || doomed.has(entry.name)) continue
        if (identifiers(entry.source).some(dep => doomed.has(dep))) {
          doomed.add(entry.name)
          grew = true
        }
      }
    }

    for (const doomedName of doomed) this.#entries.delete(doomedName)
    this.#emit()
    return true
  }

  /** Re-encode every atom at `dim` and re-evaluate every derived entry. */
  setDim(dim: number): void {
    if (!(DIMS as readonly number[]).includes(dim)) {
      throw new ExprError(`unsupported dimension ${dim}`)
    }
    if (dim === this.#dim) return

    this.#dim = dim
    const rebuilt = new Map<string, Entry>()
    const env = new Map<string, PhaseVector>()

    for (const entry of this.#entries.values()) {
      const vector =
        entry.kind === 'atom'
          ? encodeAtom(entry.source, dim)
          : this.#reevaluate(entry, env)
      const next: Entry = { ...entry, vector }
      rebuilt.set(entry.name, next)
      env.set(entry.name, vector)
    }

    this.#entries = rebuilt
    this.#emit()
  }

  /** Drop everything, keeping the current dimension. */
  reset(): void {
    this.#entries.clear()
    this.#colorCursor = 0
    this.#resultCursor = 0
    this.#emit()
  }

  #reevaluate(entry: Entry, env: Map<string, PhaseVector>): PhaseVector {
    const value = evaluate(entry.source, env)
    if (value.kind !== 'vector') {
      throw new ExprError(`"${entry.source}" no longer produces a vector`)
    }
    return value.vector
  }

  #nextColor(): string {
    const color = PALETTE[this.#colorCursor % PALETTE.length]!
    this.#colorCursor++
    return color
  }

  #nextResultName(): string {
    for (;;) {
      this.#resultCursor++
      const name = `r${this.#resultCursor}`
      if (!this.#entries.has(name)) return name
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}

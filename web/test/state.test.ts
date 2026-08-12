import { describe, it, expect } from 'vitest'
import { encodeAtom, similarity } from 'hrr-lib'
import { ExprError } from '../src/expr.js'
import { DIMS, Store } from '../src/state.js'

describe('Store', () => {
  it('starts empty at the default dimension', () => {
    const store = new Store()
    expect(store.entries).toEqual([])
    expect(store.dim).toBe(256)
    expect(DIMS).toContain(256)
  })

  it('encodes an atom at the current dimension', () => {
    const store = new Store()
    const dog = store.addAtom('dog')
    expect(dog.kind).toBe('atom')
    expect(dog.vector.length).toBe(256)
    expect(Array.from(dog.vector)).toEqual(Array.from(encodeAtom('dog', 256)))
  })

  it('gives each entry a distinct color from the palette', () => {
    const store = new Store()
    const a = store.addAtom('dog')
    const b = store.addAtom('cat')
    expect(a.color).not.toBe(b.color)
  })

  it('rejects a duplicate or malformed atom name', () => {
    const store = new Store()
    store.addAtom('dog')
    expect(() => store.addAtom('dog')).toThrow(/already/)
    expect(() => store.addAtom('2dog')).toThrow(ExprError)
    expect(() => store.addAtom('bind')).toThrow(/reserved/)
  })

  it('evaluates a derived entry and remembers its source', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    const pet = store.addDerived('pet', 'bind(dog, role)')
    expect(pet.kind).toBe('derived')
    expect(pet.source).toBe('bind(dog, role)')
    expect(pet.vector.length).toBe(256)
  })

  it('lets a derived entry build on an earlier derived entry', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')
    const back = store.addDerived('back', 'unbind(pet, role)')
    expect(similarity(back.vector, store.get('dog')!.vector)).toBeCloseTo(1, 10)
  })

  it('submits a line, naming the result automatically when no name is given', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    const first = store.submit('bind(dog, role)')
    expect(first.kind).toBe('derived')
    expect(first.name).toBe('r1')
    expect(store.submit('bind(role, dog)').name).toBe('r2')
    expect(store.submit('pet = bind(dog, role)').name).toBe('pet')
  })

  it('returns a scalar result from submit without storing an entry', () => {
    const store = new Store()
    store.addAtom('dog')
    const before = store.entries.length
    const result = store.submitScalar('similarity(dog, dog)')
    expect(result).toBeCloseTo(1, 12)
    expect(store.entries.length).toBe(before)
  })

  it('re-encodes atoms and re-evaluates derived entries when the dim changes', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')

    store.setDim(64)

    expect(store.dim).toBe(64)
    expect(store.get('dog')!.vector.length).toBe(64)
    expect(store.get('pet')!.vector.length).toBe(64)
    expect(Array.from(store.get('dog')!.vector)).toEqual(
      Array.from(encodeAtom('dog', 64)),
    )
  })

  it('rejects a dimension it does not offer', () => {
    const store = new Store()
    expect(() => store.setDim(7)).toThrow(/dimension/)
  })

  it('removes an entry together with everything derived from it', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')
    store.addDerived('back', 'unbind(pet, role)')

    expect(store.remove('dog')).toBe(true)

    expect(store.get('dog')).toBeUndefined()
    expect(store.get('pet')).toBeUndefined()
    expect(store.get('back')).toBeUndefined()
    expect(store.get('role')).toBeDefined()
  })

  it('reports removing an absent name', () => {
    expect(new Store().remove('ghost')).toBe(false)
  })

  it('notifies subscribers once per mutation and stops after unsubscribe', () => {
    const store = new Store()
    let calls = 0
    const off = store.subscribe(() => {
      calls++
    })

    store.addAtom('dog')
    expect(calls).toBe(1)
    store.setDim(64)
    expect(calls).toBe(2)
    store.remove('dog')
    expect(calls).toBe(3)

    off()
    store.addAtom('cat')
    expect(calls).toBe(3)
  })

  it('does not notify when a mutation fails', () => {
    const store = new Store()
    store.addAtom('dog')
    let calls = 0
    store.subscribe(() => {
      calls++
    })
    expect(() => store.addAtom('dog')).toThrow()
    expect(calls).toBe(0)
  })

  it('exposes an env map for the evaluator', () => {
    const store = new Store()
    store.addAtom('dog')
    expect(store.env().get('dog')).toBeDefined()
    expect(store.env().size).toBe(1)
  })
})

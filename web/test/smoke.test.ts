import { describe, it, expect } from 'vitest'
import { encodeAtom, similarity } from 'hrr-lib'

describe('hrr-lib alias', () => {
  it('resolves to the library source', () => {
    const dog = encodeAtom('dog', 64)
    expect(dog.length).toBe(64)
    expect(similarity(dog, dog)).toBeCloseTo(1, 12)
  })

  it('gives near-orthogonal vectors for unrelated labels', () => {
    const s = similarity(encodeAtom('dog', 1024), encodeAtom('cat', 1024))
    expect(Math.abs(s)).toBeLessThan(0.15)
  })
})

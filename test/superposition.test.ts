import { describe, it, expect } from 'vitest'
import { Superposition, encodeAtom, bundle, similarity, TWO_PI } from '../src/index.js'

const inRange = (v: Float64Array) => Array.from(v).every(p => p >= 0 && p < TWO_PI)

/** Elementwise antipode: every phase rotated by π, folded back into [0, 2π). */
const antipode = (v: Float64Array) =>
  Float64Array.from(v, p => (p + Math.PI) % TWO_PI)

describe('Superposition', () => {
  const a = encodeAtom('a')
  const b = encodeAtom('b')
  const c = encodeAtom('c')

  it('defaults to dim 1024 and accepts a custom dim', () => {
    expect(new Superposition().dim).toBe(1024)
    expect(new Superposition(64).dim).toBe(64)
  })

  it('rejects invalid dimensions', () => {
    expect(() => new Superposition(0)).toThrow(RangeError)
    expect(() => new Superposition(-8)).toThrow(RangeError)
    expect(() => new Superposition(1.5)).toThrow(RangeError)
  })

  it('add and remove return the instance for chaining', () => {
    const s = new Superposition()
    expect(s.add(a)).toBe(s)
    expect(s.remove(a)).toBe(s)
  })

  it('add throws on dimension mismatch', () => {
    expect(() => new Superposition(64).add(encodeAtom('x', 128))).toThrow(RangeError)
  })

  it('toVector keeps phases in [0, 2π)', () => {
    expect(inRange(new Superposition().add(a).add(b).toVector())).toBe(true)
  })

  it('matches a single flat bundle exactly, however the additions are grouped', () => {
    const acc = new Superposition().add(a).add(b)
    // toVector is non-destructive: reduce mid-stream, then keep accumulating
    expect(Array.from(acc.toVector())).toEqual(Array.from(bundle(a, b)))
    acc.add(c)
    expect(Array.from(acc.toVector())).toEqual(Array.from(bundle(a, b, c)))
  })

  it('pins the non-associativity gap in nested bundle that motivates the accumulator', () => {
    const nested = bundle(bundle(a, b), c)
    const flat = bundle(a, b, c)

    // nesting renormalizes between steps, so the results measurably diverge…
    expect(similarity(nested, flat)).toBeLessThan(0.999)
    // …with c overweighted: it enters as an equal partner against the
    // collapsed bundle(a, b), taking as much weight as a and b combined
    expect(similarity(nested, c)).toBeGreaterThan(similarity(flat, c) + 0.02)
    // while the accumulator built in the same nested order stays exactly flat
    const acc = new Superposition().add(a).add(b).add(c)
    expect(Array.from(acc.toVector())).toEqual(Array.from(flat))
  })

  it('remove roundtrip: add three, remove one, matches bundling the other two', () => {
    const out = new Superposition().add(a).add(b).add(c).remove(b).toVector()
    expect(similarity(out, bundle(a, c))).toBeCloseTo(1, 12)
  })

  it('removing everything cancels back to the empty state', () => {
    const s = new Superposition().add(a).add(b).remove(a).remove(b)
    expect(Math.max(...s.magnitude)).toBeLessThan(1e-12)
  })

  it('weighted add computes the weighted circular mean', () => {
    // integer weight n behaves as adding the vector n times
    const weighted = new Superposition().add(a, 2).add(b).toVector()
    expect(similarity(weighted, bundle(a, a, b))).toBeCloseTo(1, 12)

    // heavier inputs pull the mean toward themselves
    const skewed = new Superposition().add(a, 3).add(b).toVector()
    expect(similarity(skewed, a)).toBeGreaterThan(similarity(skewed, b) + 0.2)

    // and remove(v, w) cancels exactly that share
    const back = new Superposition().add(a, 3).add(b).remove(a, 2).toVector()
    expect(similarity(back, bundle(a, b))).toBeCloseTo(1, 12)
  })

  it('magnitude exposes per-element consensus strength', () => {
    const agreed = new Superposition().add(a).add(a).magnitude
    for (const m of agreed) expect(m).toBeCloseTo(2, 12)

    const cancelled = new Superposition().add(a).add(antipode(a)).magnitude
    for (const m of cancelled) expect(m).toBeCloseTo(0, 12)

    // unrelated vectors land strictly in between
    const mixed = new Superposition().add(a).add(b).magnitude
    for (const m of mixed) {
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThanOrEqual(2)
    }
  })

  it('a fresh superposition reduces to the zero vector with zero magnitude', () => {
    const s = new Superposition(4)
    expect(Array.from(s.toVector())).toEqual([0, 0, 0, 0])
    expect(Array.from(s.magnitude)).toEqual([0, 0, 0, 0])
  })
})

import { describe, it, expect } from 'vitest'
import {
  encodeAtom,
  bind,
  unbind,
  bundle,
  similarity,
  DEFAULT_DIM,
  TWO_PI,
} from '../src/index.js'

const inRange = (v: Float64Array) => Array.from(v).every(p => p >= 0 && p < TWO_PI)

describe('encodeAtom', () => {
  it('returns a Float64Array of the default dimension (1024)', () => {
    const v = encodeAtom('alice')
    expect(v).toBeInstanceOf(Float64Array)
    expect(v.length).toBe(1024)
    expect(DEFAULT_DIM).toBe(1024)
  })

  it('respects a custom dimension', () => {
    expect(encodeAtom('alice', 16).length).toBe(16)
    expect(encodeAtom('alice', 4096).length).toBe(4096)
    // dims that are not multiples of the 16 phases-per-hash-block work too
    expect(encodeAtom('alice', 17).length).toBe(17)
  })

  it('is deterministic: same label always yields the identical vector', () => {
    const a = encodeAtom('alice')
    const b = encodeAtom('alice')
    expect(a).not.toBe(b) // fresh array each call
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('matches the frozen SHA-256 phase derivation (cross-version stability)', () => {
    // Precomputed independently: sha256(`${label}:${counter}`) digest read as
    // little-endian uint16s, scaled by 2π/65536.
    const alice = encodeAtom('alice', 4)
    expect(Array.from(alice)).toEqual([
      6.192105197898877, 3.5992941711751714, 2.2194784524720372, 5.642268959241116,
    ])
    const paris = encodeAtom('paris', 4)
    expect(Array.from(paris)).toEqual([
      3.5768597021523436, 1.691501440041648, 2.5502430598598784, 2.6964506037052285,
    ])
    const empty = encodeAtom('', 2)
    expect(Array.from(empty)).toEqual([5.696533529612571, 1.781239316132958])
  })

  it('produces phases in [0, 2π)', () => {
    expect(inRange(encodeAtom('alice'))).toBe(true)
    expect(inRange(encodeAtom('bob', 2048))).toBe(true)
  })

  it('gives near-orthogonal vectors for distinct labels', () => {
    const a = encodeAtom('alice')
    const b = encodeAtom('bob')
    expect(Math.abs(similarity(a, b))).toBeLessThan(0.1)
  })

  it('distinguishes labels that only differ by the counter separator', () => {
    // 'a:1' at counter 0 hashes 'a:1:0'; 'a' at counter 1 hashes 'a:1' — no collision
    const a = encodeAtom('a:1', 32)
    const b = encodeAtom('a', 32)
    expect(Math.abs(similarity(a, b))).toBeLessThan(0.5)
  })

  it('rejects invalid dimensions', () => {
    expect(() => encodeAtom('alice', 0)).toThrow(RangeError)
    expect(() => encodeAtom('alice', -8)).toThrow(RangeError)
    expect(() => encodeAtom('alice', 1.5)).toThrow(RangeError)
  })
})

describe('bind / unbind', () => {
  const a = encodeAtom('a')
  const b = encodeAtom('b')
  const c = encodeAtom('c')

  it('unbind inverts bind: unbind(bind(a, b), b) ≈ a', () => {
    const recovered = unbind(bind(a, b), b)
    expect(similarity(recovered, a)).toBeCloseTo(1.0, 10)
  })

  it('is commutative: bind(a, b) equals bind(b, a)', () => {
    expect(Array.from(bind(a, b))).toEqual(Array.from(bind(b, a)))
  })

  it('is associative up to floating point: sim(bind(bind(a,b),c), bind(a,bind(b,c))) ≈ 1', () => {
    const left = bind(bind(a, b), c)
    const right = bind(a, bind(b, c))
    expect(similarity(left, right)).toBeCloseTo(1.0, 10)
  })

  it('produces a vector dissimilar to both operands', () => {
    const bound = bind(a, b)
    expect(Math.abs(similarity(bound, a))).toBeLessThan(0.1)
    expect(Math.abs(similarity(bound, b))).toBeLessThan(0.1)
  })

  it('preserves similarity under binding: sim(bind(a,c), bind(b,c)) ≈ sim(a,b)', () => {
    const s1 = similarity(bind(a, c), bind(b, c))
    const s2 = similarity(a, b)
    expect(s1).toBeCloseTo(s2, 10)
  })

  it('keeps phases in [0, 2π)', () => {
    expect(inRange(bind(a, b))).toBe(true)
    expect(inRange(unbind(a, b))).toBe(true)
    expect(inRange(unbind(b, a))).toBe(true)
  })

  it('throws on dimension mismatch', () => {
    expect(() => bind(encodeAtom('x', 64), encodeAtom('y', 128))).toThrow(RangeError)
    expect(() => unbind(encodeAtom('x', 64), encodeAtom('y', 128))).toThrow(RangeError)
  })

  it('supports the nested role-filler example from the design doc', () => {
    const alice = encodeAtom('alice')
    const livesIn = encodeAtom('lives_in')
    const paris = encodeAtom('paris')

    const fact = bind(bind(alice, livesIn), paris)
    const recovered = unbind(unbind(fact, alice), livesIn)

    expect(similarity(recovered, paris)).toBeCloseTo(1.0, 10)
    // and probing with the wrong filler stays near zero
    expect(Math.abs(similarity(recovered, encodeAtom('london')))).toBeLessThan(0.1)
  })
})

describe('bundle', () => {
  const a = encodeAtom('a')
  const b = encodeAtom('b')
  const c = encodeAtom('c')

  it('of a single vector is that vector', () => {
    const out = bundle(a)
    expect(similarity(out, a)).toBeCloseTo(1.0, 10)
  })

  it('is similar to each of its components', () => {
    const out = bundle(a, b)
    expect(similarity(out, a)).toBeGreaterThan(0.5)
    expect(similarity(out, b)).toBeGreaterThan(0.5)
  })

  it('remains dissimilar to unrelated vectors', () => {
    const out = bundle(a, b, c)
    expect(Math.abs(similarity(out, encodeAtom('unrelated')))).toBeLessThan(0.1)
  })

  it('is order-independent up to floating point', () => {
    const x = bundle(a, b, c)
    const y = bundle(c, a, b)
    let maxDiff = 0
    for (let i = 0; i < x.length; i++) maxDiff = Math.max(maxDiff, Math.abs(x[i]! - y[i]!))
    expect(maxDiff).toBeLessThan(1e-12)
  })

  it('keeps phases in [0, 2π)', () => {
    expect(inRange(bundle(a, b, c))).toBe(true)
  })

  it('throws with no vectors', () => {
    expect(() => bundle()).toThrow()
  })

  it('throws on dimension mismatch', () => {
    expect(() => bundle(encodeAtom('x', 64), encodeAtom('y', 128))).toThrow(RangeError)
  })

  it('lets bound facts be superposed and selectively recovered', () => {
    const f1 = bind(encodeAtom('alice'), encodeAtom('paris'))
    const f2 = bind(encodeAtom('bob'), encodeAtom('london'))
    const mem = bundle(f1, f2)

    const recovered = unbind(mem, encodeAtom('alice'))
    const simParis = similarity(recovered, encodeAtom('paris'))
    const simLondon = similarity(recovered, encodeAtom('london'))
    expect(simParis).toBeGreaterThan(0.4)
    expect(simParis).toBeGreaterThan(simLondon + 0.2)
  })
})

describe('similarity', () => {
  const a = encodeAtom('a')
  const b = encodeAtom('b')

  it('of a vector with itself is exactly 1', () => {
    expect(similarity(a, a)).toBe(1)
  })

  it('is symmetric', () => {
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 12)
  })

  it('is bounded in [-1, 1]', () => {
    const s = similarity(a, b)
    expect(s).toBeGreaterThanOrEqual(-1)
    expect(s).toBeLessThanOrEqual(1)
  })

  it('throws on dimension mismatch', () => {
    expect(() => similarity(encodeAtom('x', 64), encodeAtom('y', 128))).toThrow(RangeError)
  })
})

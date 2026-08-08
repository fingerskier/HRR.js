import { describe, it, expect } from 'vitest'
import { HolographicMemory } from '../src/index.js'

describe('HolographicMemory', () => {
  it('defaults to dim 1024 and accepts a custom dim', () => {
    expect(new HolographicMemory().dim).toBe(1024)
    expect(new HolographicMemory(2048).dim).toBe(2048)
  })

  it('probe on an empty memory returns null', () => {
    const mem = new HolographicMemory()
    expect(mem.probe('anything')).toBeNull()
  })

  it('recovers a single stored fact with high confidence', () => {
    const mem = new HolographicMemory()
    mem.store('alice', 'paris')

    const result = mem.probe('alice')
    expect(result).not.toBeNull()
    expect(result!.value).toBe('paris')
    expect(result!.confidence).toBeGreaterThan(0.9)
  })

  it('recovers each of several stored facts', () => {
    const mem = new HolographicMemory()
    const facts: Array<[string, string]> = [
      ['alice', 'paris'],
      ['bob', 'london'],
      ['carol', 'tokyo'],
      ['dave', 'oslo'],
      ['erin', 'cairo'],
    ]
    for (const [k, v] of facts) mem.store(k, v)

    for (const [k, v] of facts) {
      const result = mem.probe(k)
      expect(result, `probe(${k})`).not.toBeNull()
      expect(result!.value, `probe(${k})`).toBe(v)
      expect(result!.confidence).toBeGreaterThan(0.2)
    }
  })

  it('holds ten facts at dim 1024 without cross-talk errors', () => {
    const mem = new HolographicMemory()
    const facts: Array<[string, string]> = Array.from({ length: 10 }, (_, i) => [
      `key-${i}`,
      `value-${i}`,
    ])
    for (const [k, v] of facts) mem.store(k, v)

    for (const [k, v] of facts) {
      expect(mem.probe(k)!.value, `probe(${k})`).toBe(v)
    }
  })

  it('probing an unknown key yields low confidence', () => {
    const mem = new HolographicMemory()
    mem.store('alice', 'paris')
    mem.store('bob', 'london')

    const result = mem.probe('mallory')
    expect(result).not.toBeNull()
    expect(result!.confidence).toBeLessThan(0.3)
  })

  it('reports its size and can be cleared', () => {
    const mem = new HolographicMemory()
    expect(mem.size).toBe(0)
    mem.store('alice', 'paris')
    mem.store('bob', 'london')
    expect(mem.size).toBe(2)

    mem.clear()
    expect(mem.size).toBe(0)
    expect(mem.probe('alice')).toBeNull()
  })

  it('overwriting a key keeps probes working for the latest value', () => {
    const mem = new HolographicMemory()
    mem.store('alice', 'paris')
    mem.store('alice', 'rome')

    const result = mem.probe('alice')
    expect(result!.value).toBe('rome')
  })

  it('is deterministic across instances', () => {
    const m1 = new HolographicMemory()
    const m2 = new HolographicMemory()
    m1.store('alice', 'paris')
    m2.store('alice', 'paris')

    expect(m1.probe('alice')!.confidence).toBe(m2.probe('alice')!.confidence)
  })
})

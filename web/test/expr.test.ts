import { describe, it, expect } from 'vitest'
import { encodeAtom, bind, similarity, type PhaseVector } from 'hrr-lib'
import { ExprError, evaluate, identifiers, splitAssignment } from '../src/expr.js'

const DIM = 64
const env = new Map<string, PhaseVector>([
  ['dog', encodeAtom('dog', DIM)],
  ['cat', encodeAtom('cat', DIM)],
  ['role', encodeAtom('role', DIM)],
])

const vec = (source: string): PhaseVector => {
  const v = evaluate(source, env)
  if (v.kind !== 'vector') throw new Error(`expected a vector from ${source}`)
  return v.vector
}

const num = (source: string): number => {
  const v = evaluate(source, env)
  if (v.kind !== 'scalar') throw new Error(`expected a scalar from ${source}`)
  return v.value
}

describe('splitAssignment', () => {
  it('separates a name from its expression', () => {
    expect(splitAssignment('pet = bind(dog, role)')).toEqual({
      name: 'pet',
      expression: 'bind(dog, role)',
    })
  })

  it('returns a null name for a bare expression', () => {
    expect(splitAssignment('  bind(dog, role) ')).toEqual({
      name: null,
      expression: 'bind(dog, role)',
    })
  })

  it('does not mistake a nested call for an assignment', () => {
    expect(splitAssignment('bind(dog, role)').name).toBeNull()
  })

  it('rejects a name that is not an identifier', () => {
    expect(() => splitAssignment('2pet = dog')).toThrow(ExprError)
  })
})

describe('identifiers', () => {
  it('lists every name an expression depends on, without duplicates', () => {
    expect(identifiers('bundle(bind(dog, role), cat, dog)')).toEqual([
      'dog',
      'role',
      'cat',
    ])
  })

  it('ignores function names and numbers', () => {
    expect(identifiers('permute(dog, 3)')).toEqual(['dog'])
  })
})

describe('evaluate', () => {
  it('resolves a bare identifier', () => {
    expect(Array.from(vec('dog'))).toEqual(Array.from(env.get('dog')!))
  })

  it('binds two vectors', () => {
    const expected = bind(env.get('dog')!, env.get('role')!)
    expect(Array.from(vec('bind(dog, role)'))).toEqual(Array.from(expected))
  })

  it('recovers a bound vector by unbinding, to numeric tolerance', () => {
    const recovered = vec('unbind(bind(dog, role), role)')
    expect(similarity(recovered, env.get('dog')!)).toBeCloseTo(1, 10)
  })

  it('bundles a variable number of arguments', () => {
    // A three-way bundle sits around 0.53 from each member asymptotically, but
    // at dim 64 sampling noise drags it as low as 0.40. Unrelated atoms at this
    // dimension reach |0.13|, so 0.3 separates signal from noise with room to
    // spare.
    const blend = vec('bundle(dog, cat, role)')
    expect(similarity(blend, env.get('dog')!)).toBeGreaterThan(0.3)
    expect(similarity(blend, env.get('cat')!)).toBeGreaterThan(0.3)
  })

  it('permutes by an integer shift and back again', () => {
    const round = vec('permute(permute(dog, 3), -3)')
    expect(Array.from(round)).toEqual(Array.from(env.get('dog')!))
  })

  it('returns a scalar from similarity', () => {
    expect(num('similarity(dog, dog)')).toBeCloseTo(1, 12)
    expect(Math.abs(num('similarity(dog, cat)'))).toBeLessThan(0.3)
  })

  it('tolerates whitespace and is case-sensitive about names', () => {
    expect(num('  similarity( dog ,dog )  ')).toBeCloseTo(1, 12)
    expect(() => evaluate('similarity(Dog, dog)', env)).toThrow(/unknown name/i)
  })

  it('rejects an unknown identifier', () => {
    expect(() => evaluate('bind(dog, ferret)', env)).toThrow(ExprError)
    expect(() => evaluate('bind(dog, ferret)', env)).toThrow(/ferret/)
  })

  it('rejects an unknown function', () => {
    expect(() => evaluate('blend(dog, cat)', env)).toThrow(/unknown function/i)
  })

  it('rejects the wrong number of arguments', () => {
    expect(() => evaluate('bind(dog)', env)).toThrow(/expects 2/)
    expect(() => evaluate('bundle(dog)', env)).toThrow(/at least 2/)
    expect(() => evaluate('permute(dog, 1, 2)', env)).toThrow(/expects/)
  })

  it('rejects a scalar where a vector belongs, and the reverse', () => {
    expect(() => evaluate('bind(dog, 3)', env)).toThrow(/expects a vector/)
    expect(() => evaluate('permute(dog, cat)', env)).toThrow(/expects a number/)
  })

  it('rejects a non-integer shift', () => {
    expect(() => evaluate('permute(dog, 1.5)', env)).toThrow(ExprError)
  })

  it('rejects malformed input', () => {
    expect(() => evaluate('bind(dog, cat', env)).toThrow(/expected \)/)
    expect(() => evaluate('', env)).toThrow(/empty/)
    expect(() => evaluate('dog cat', env)).toThrow(/unexpected/)
  })

  it('reports a dimension mismatch from the library as an ExprError', () => {
    const mixed = new Map(env)
    mixed.set('wide', encodeAtom('wide', 128))
    expect(() => evaluate('bind(dog, wide)', mixed)).toThrow(ExprError)
  })
})

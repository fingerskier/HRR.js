import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256 } from '../src/sha256.js'

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('sha256', () => {
  it('hashes the empty input (FIPS 180-4 known answer)', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes "abc" (FIPS 180-4 known answer)', () => {
    expect(hex(sha256(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('hashes a 56-byte input, which forces a second padding block', () => {
    const input = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(input.length).toBe(56)
    expect(hex(sha256(utf8(input)))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('returns exactly 32 bytes', () => {
    expect(sha256(utf8('anything')).length).toBe(32)
  })

  it('agrees with node:crypto across lengths that straddle block boundaries', () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 200, 1000]) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 0xff
      const expected = createHash('sha256').update(bytes).digest('hex')
      expect(hex(sha256(bytes)), `length ${n}`).toBe(expected)
    }
  })

  it('does not mutate its input', () => {
    const bytes = utf8('abc')
    const copy = bytes.slice()
    sha256(bytes)
    expect(Array.from(bytes)).toEqual(Array.from(copy))
  })
})

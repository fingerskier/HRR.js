import { createHash } from 'node:crypto'

/** Full circle in radians; phases live in [0, 2π). */
export const TWO_PI = 2 * Math.PI

/** Default vector dimension. */
export const DEFAULT_DIM = 1024

/** A phase vector: each component is an angle in [0, 2π). */
export type PhaseVector = Float64Array

function assertSameDim(a: PhaseVector, b: PhaseVector): void {
  if (a.length !== b.length) {
    throw new RangeError(`dimension mismatch: ${a.length} !== ${b.length}`)
  }
}

/**
 * Fold a phase from (-2π, 2π) into [0, 2π). Adding 2π to a tiny negative
 * value rounds to exactly 2π, so the result must be folded back down to
 * keep the half-open invariant.
 */
export function canonicalPhase(v: number): number {
  if (v < 0) v += TWO_PI
  if (v >= TWO_PI) v -= TWO_PI
  return v
}

/**
 * Deterministic phase vector for a label.
 *
 * Phases are derived from SHA-256 of `${label}:${counter}` — each 32-byte
 * digest is read as 16 little-endian uint16s scaled onto [0, 2π), with the
 * counter incremented until `dim` phases are produced. The same label yields
 * the same vector on every platform and version.
 */
export function encodeAtom(label: string, dim: number = DEFAULT_DIM): PhaseVector {
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new RangeError(`dim must be a positive integer, got ${dim}`)
  }

  const phases = new Float64Array(dim)
  let i = 0
  let counter = 0

  while (i < dim) {
    const hash = createHash('sha256').update(`${label}:${counter}`).digest()
    for (let j = 0; j < 16 && i < dim; j++, i++) {
      const uint16 = hash.readUInt16LE(j * 2)
      phases[i] = (uint16 / 65536) * TWO_PI
    }
    counter++
  }
  return phases
}

/**
 * Bind two vectors (elementwise phase addition — circular convolution for
 * unit-modulus complex vectors). Commutative; inverted by {@link unbind}.
 */
export function bind(a: PhaseVector, b: PhaseVector): PhaseVector {
  assertSameDim(a, b)
  const out = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = (a[i]! + b[i]!) % TWO_PI
  }
  return out
}

/** Unbind `b` from `a` (elementwise phase subtraction). */
export function unbind(a: PhaseVector, b: PhaseVector): PhaseVector {
  assertSameDim(a, b)
  const out = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = canonicalPhase((a[i]! - b[i]!) % TWO_PI)
  }
  return out
}

/**
 * Cyclically shift a vector's components by `k` positions (component `i`
 * of the result is component `i - k` of the input). A permuted vector is
 * near-orthogonal to the original, and `permute(permute(v, k), -k)`
 * restores `v` exactly — the standard non-commutative marker for encoding
 * sequences and protecting against {@link bind}'s symmetry.
 */
export function permute(v: PhaseVector, k: number = 1): PhaseVector {
  if (!Number.isInteger(k)) {
    throw new RangeError(`shift must be an integer, got ${k}`)
  }
  const n = v.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const shift = ((k % n) + n) % n
  for (let i = 0; i < n; i++) {
    out[(i + shift) % n] = v[i]!
  }
  return out
}

/**
 * Superpose vectors by the elementwise circular mean. The result stays
 * similar to every input while remaining near-orthogonal to unrelated
 * vectors.
 */
export function bundle(...vectors: PhaseVector[]): PhaseVector {
  const first = vectors[0]
  if (first === undefined) throw new Error('bundle requires at least one vector')
  const dim = first.length

  const sumCos = new Float64Array(dim)
  const sumSin = new Float64Array(dim)
  for (const v of vectors) {
    assertSameDim(first, v)
    for (let i = 0; i < dim; i++) {
      sumCos[i] = sumCos[i]! + Math.cos(v[i]!)
      sumSin[i] = sumSin[i]! + Math.sin(v[i]!)
    }
  }

  const out = new Float64Array(dim)
  for (let i = 0; i < dim; i++) {
    out[i] = canonicalPhase(Math.atan2(sumSin[i]!, sumCos[i]!))
  }
  return out
}

/**
 * Cosine similarity of the corresponding complex unit vectors: mean of
 * cos(aᵢ − bᵢ). 1 for identical vectors, ~0 for unrelated atoms.
 */
export function similarity(a: PhaseVector, b: PhaseVector): number {
  assertSameDim(a, b)
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += Math.cos(a[i]! - b[i]!)
  }
  return dot / a.length
}

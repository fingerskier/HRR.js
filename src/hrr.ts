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
 * An incremental superposition: the running cos/sin sums behind
 * {@link bundle}, kept unreduced so vectors can be added one at a time —
 * weighted, removed again, and reduced to phases only when asked.
 *
 * `bundle` reduces immediately via atan2, which discards magnitude and
 * makes nested bundling non-associative: in `bundle(bundle(a, b), c)` the
 * inner result collapses to unit magnitude and meets `c` as an equal
 * partner, so `c` carries as much weight as `a` and `b` combined. An
 * accumulator defers that collapse — however the additions are grouped,
 * {@link toVector} equals one flat `bundle` over everything added.
 */
export class Superposition {
  readonly dim: number
  private sumCos: Float64Array
  private sumSin: Float64Array

  constructor(dim: number = DEFAULT_DIM) {
    if (!Number.isInteger(dim) || dim <= 0) {
      throw new RangeError(`dim must be a positive integer, got ${dim}`)
    }
    this.dim = dim
    this.sumCos = new Float64Array(dim)
    this.sumSin = new Float64Array(dim)
  }

  /**
   * Add `v` to the superposition, scaled by `weight`. The atan2 of weighted
   * sums is the weighted circular mean, so unequal weights (recency decay,
   * confidence) drop in directly. Returns `this` for chaining.
   */
  add(v: PhaseVector, weight: number = 1): this {
    if (v.length !== this.dim) {
      throw new RangeError(`dimension mismatch: ${this.dim} !== ${v.length}`)
    }
    for (let i = 0; i < this.dim; i++) {
      this.sumCos[i] = this.sumCos[i]! + weight * Math.cos(v[i]!)
      this.sumSin[i] = this.sumSin[i]! + weight * Math.sin(v[i]!)
    }
    return this
  }

  /**
   * Cancel a previous `add(v, weight)` by subtracting the same contribution
   * (exact to floating-point rounding). Returns `this` for chaining.
   */
  remove(v: PhaseVector, weight: number = 1): this {
    return this.add(v, -weight)
  }

  /**
   * Reduce to a phase vector — the elementwise circular mean, in [0, 2π).
   * Non-destructive: the sums are kept, so accumulation can continue.
   * Components whose sums cancel to zero reduce to phase 0; consult
   * {@link magnitude} to tell consensus from cancellation.
   */
  toVector(): PhaseVector {
    const out = new Float64Array(this.dim)
    for (let i = 0; i < this.dim; i++) {
      out[i] = canonicalPhase(Math.atan2(this.sumSin[i]!, this.sumCos[i]!))
    }
    return out
  }

  /**
   * Per-component length of the summed phasors (`hypot`) — the consensus
   * strength that reduction discards. After `n` unit-weight additions each
   * component ranges from 0 (phases cancelled) to `n` (phases identical).
   */
  get magnitude(): Float64Array {
    const out = new Float64Array(this.dim)
    for (let i = 0; i < this.dim; i++) {
      out[i] = Math.hypot(this.sumCos[i]!, this.sumSin[i]!)
    }
    return out
  }
}

/**
 * Superpose vectors by the elementwise circular mean. The result stays
 * similar to every input while remaining near-orthogonal to unrelated
 * vectors.
 *
 * Not associative — nesting calls renormalizes between steps (see
 * {@link Superposition}). To superpose incrementally or with weights,
 * accumulate into a `Superposition` instead; its `toVector()` equals one
 * flat `bundle` call over the same vectors.
 */
export function bundle(...vectors: PhaseVector[]): PhaseVector {
  const first = vectors[0]
  if (first === undefined) throw new Error('bundle requires at least one vector')

  const acc = new Superposition(first.length)
  for (const v of vectors) acc.add(v)
  return acc.toVector()
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

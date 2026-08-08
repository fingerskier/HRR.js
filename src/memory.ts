import {
  DEFAULT_DIM,
  TWO_PI,
  encodeAtom,
  bind,
  unbind,
  similarity,
  type PhaseVector,
} from './hrr.js'

/** Result of probing the memory with a key. */
export interface ProbeResult {
  /** Best-matching stored value. */
  value: string
  /** Similarity of the recovered vector to that value, in [-1, 1]. */
  confidence: number
}

/**
 * A single-trace holographic memory: every stored key→value pair is bound
 * into one superposed phase vector, and {@link probe} recovers a value by
 * unbinding the key and cleaning up against the known values.
 *
 * Superposition is kept as running cos/sin sums so all facts carry equal
 * weight and overwriting a key exactly removes its previous binding.
 */
export class HolographicMemory {
  readonly dim: number
  private sumCos: Float64Array
  private sumSin: Float64Array
  private facts = new Map<string, string>()

  constructor(dim: number = DEFAULT_DIM) {
    if (!Number.isInteger(dim) || dim <= 0) {
      throw new RangeError(`dim must be a positive integer, got ${dim}`)
    }
    this.dim = dim
    this.sumCos = new Float64Array(dim)
    this.sumSin = new Float64Array(dim)
  }

  /** Number of stored facts. */
  get size(): number {
    return this.facts.size
  }

  /** Bind `key` to `value` and add the pair to the superposition. */
  store(key: string, value: string): void {
    const previous = this.facts.get(key)
    if (previous !== undefined) {
      this.accumulate(this.boundVector(key, previous), -1)
    }
    this.accumulate(this.boundVector(key, value), +1)
    this.facts.set(key, value)
  }

  /**
   * Recover the value bound to `key`. Returns the best cleanup match among
   * all stored values with its similarity, or null if the memory is empty.
   */
  probe(key: string): ProbeResult | null {
    if (this.facts.size === 0) return null

    const recovered = unbind(this.trace(), encodeAtom(key, this.dim))

    let best: string | null = null
    let bestSim = -Infinity
    for (const value of new Set(this.facts.values())) {
      const s = similarity(recovered, encodeAtom(value, this.dim))
      if (s > bestSim) {
        bestSim = s
        best = value
      }
    }
    return best === null ? null : { value: best, confidence: bestSim }
  }

  /** Remove all stored facts. */
  clear(): void {
    this.sumCos.fill(0)
    this.sumSin.fill(0)
    this.facts.clear()
  }

  private boundVector(key: string, value: string): PhaseVector {
    return bind(encodeAtom(key, this.dim), encodeAtom(value, this.dim))
  }

  private accumulate(v: PhaseVector, sign: 1 | -1): void {
    for (let i = 0; i < this.dim; i++) {
      this.sumCos[i] = this.sumCos[i]! + sign * Math.cos(v[i]!)
      this.sumSin[i] = this.sumSin[i]! + sign * Math.sin(v[i]!)
    }
  }

  /** Current superposition as a phase vector (circular mean of the sums). */
  private trace(): PhaseVector {
    const out = new Float64Array(this.dim)
    for (let i = 0; i < this.dim; i++) {
      let phase = Math.atan2(this.sumSin[i]!, this.sumCos[i]!)
      if (phase < 0) phase += TWO_PI
      out[i] = phase
    }
    return out
  }
}

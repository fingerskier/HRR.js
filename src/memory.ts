import {
  DEFAULT_DIM,
  Superposition,
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

/** Options for {@link HolographicMemory.probe}. */
export interface ProbeOptions {
  /** Return null instead of a match whose confidence is below this. */
  minConfidence?: number
}

/**
 * A single-trace holographic memory: every stored key→value pair is bound
 * into one superposed phase vector, and {@link probe} recovers a value by
 * unbinding the key and cleaning up against the known values.
 *
 * The trace is a {@link Superposition} accumulator, so all facts carry
 * equal weight and overwriting or deleting a key exactly removes its
 * previous binding.
 *
 * Note that the cleanup table already maps keys to values, so for exact
 * string keys `probe` recovers nothing a plain `Map` lookup wouldn't —
 * the trace demonstrates the algebra and its graceful degradation. Where
 * the vector machinery earns its keep is {@link probeVector}, which
 * accepts composed key vectors that never existed as stored strings.
 */
export class HolographicMemory {
  readonly dim: number
  private trace: Superposition
  private facts = new Map<string, string>()
  private atoms = new Map<string, PhaseVector>()

  constructor(dim: number = DEFAULT_DIM) {
    this.trace = new Superposition(dim) // validates dim
    this.dim = dim
  }

  /** Number of stored facts. */
  get size(): number {
    return this.facts.size
  }

  /** Bind `key` to `value` and add the pair to the superposition. */
  store(key: string, value: string): void {
    const previous = this.facts.get(key)
    if (previous !== undefined) {
      this.trace.remove(this.boundVector(key, previous))
    }
    this.trace.add(this.boundVector(key, value))
    this.facts.set(key, value)
  }

  /** Whether a fact is stored under `key`. */
  has(key: string): boolean {
    return this.facts.has(key)
  }

  /** Iterate over the stored keys. */
  keys(): IterableIterator<string> {
    return this.facts.keys()
  }

  /**
   * Remove the fact stored under `key`, exactly subtracting its binding
   * from the superposition. Returns whether the key was present.
   */
  delete(key: string): boolean {
    const value = this.facts.get(key)
    if (value === undefined) return false
    this.trace.remove(this.boundVector(key, value))
    this.facts.delete(key)
    return true
  }

  /**
   * Recover the value bound to `key`. Returns the best cleanup match among
   * all stored values with its similarity, or null if the memory is empty
   * (or the match falls below `options.minConfidence`).
   */
  probe(key: string, options?: ProbeOptions): ProbeResult | null {
    if (this.facts.size === 0) return null
    return this.probeVector(this.atom(key), options)
  }

  /**
   * Recover the value bound to an arbitrary key vector — e.g. one composed
   * with `bind`/`bundle` rather than encoded from a stored string. Same
   * cleanup and options as {@link probe}.
   */
  probeVector(key: PhaseVector, options?: ProbeOptions): ProbeResult | null {
    if (this.facts.size === 0) return null

    const recovered = unbind(this.trace.toVector(), key)

    let best: string | null = null
    let bestSim = -Infinity
    for (const value of new Set(this.facts.values())) {
      const s = similarity(recovered, this.atom(value))
      if (s > bestSim) {
        bestSim = s
        best = value
      }
    }
    if (best === null) return null
    if (options?.minConfidence !== undefined && bestSim < options.minConfidence) {
      return null
    }
    return { value: best, confidence: bestSim }
  }

  /** Remove all stored facts. */
  clear(): void {
    this.trace = new Superposition(this.dim)
    this.facts.clear()
    this.atoms.clear()
  }

  /** Encode a label at this memory's dim, caching the (deterministic) result. */
  private atom(label: string): PhaseVector {
    let v = this.atoms.get(label)
    if (v === undefined) {
      v = encodeAtom(label, this.dim)
      this.atoms.set(label, v)
    }
    return v
  }

  private boundVector(key: string, value: string): PhaseVector {
    return bind(this.atom(key), this.atom(value))
  }
}

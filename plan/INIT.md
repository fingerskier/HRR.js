**let’s build a clean, zero-dependency `hrr.js` (or `hrr.ts`) that matches the Hermes-style phase-vector HRR.**

There are a couple of existing npm packages (`hrr-memory`, `@hiperbrain/core`, `holographic-memory`), but none are a minimal, pure-JS, deterministic phase-vector implementation that drops straight into an Express server the way Hermes does it.
So a focused module is worth writing.

### Design goals
- **Zero runtime dependencies** (only Node’s built-in `crypto`)
- Deterministic `encodeAtom` via SHA-256 (same string → same vector everywhere)
- Phase vectors in \([0, 2\pi)\) (numerically stable, maps cleanly to cosine)
- Core algebra: `bind`, `unbind`, `bundle`, `similarity`
- Default dim = 1024 (configurable)
- ESM + CJS friendly, works in Node / Express / edge
- Optional thin `HolographicMemory` class for superposition + probe

### Minimal core API

```js
import { encodeAtom, bind, unbind, bundle, similarity } from './hrr.js';

const alice = encodeAtom('alice');
const livesIn = encodeAtom('lives_in');
const paris  = encodeAtom('paris');

const fact = bind(bind(alice, livesIn), paris);   // or nested bind
const recovered = unbind(unbind(fact, alice), livesIn); // ≈ paris

console.log(similarity(recovered, paris)); // ~1.0
```

### Phase-vector implementation sketch (the Hermes way)

```js
// hrr.js
import { createHash } from 'node:crypto';

const TWO_PI = 2 * Math.PI;
const DEFAULT_DIM = 1024;

/**
 * Deterministic phase vector from any string.
 * Same algorithm family as Hermes holographic memory.
 */
export function encodeAtom(label, dim = DEFAULT_DIM) {
  const phases = new Float64Array(dim);
  let i = 0;
  let counter = 0;

  while (i < dim) {
    const hash = createHash('sha256')
      .update(`${label}:${counter}`)
      .digest();                       // 32 bytes

    // treat as 16 × uint16
    for (let j = 0; j < 16 && i < dim; j++, i++) {
      const uint16 = hash.readUInt16LE(j * 2);
      phases[i] = (uint16 / 65536) * TWO_PI;
    }
    counter++;
  }
  return phases;
}

/** bind = phase addition (circular convolution for unit-modulus) */
export function bind(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = (a[i] + b[i]) % TWO_PI;
  }
  return out;
}

/** unbind = phase subtraction */
export function unbind(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let v = a[i] - b[i];
    if (v < 0) v += TWO_PI;
    out[i] = v;
  }
  return out;
}

/** bundle = circular mean (superposition) */
export function bundle(...vectors) {
  if (vectors.length === 0) throw new Error('bundle requires ≥1 vector');
  const dim = vectors[0].length;
  const sumCos = new Float64Array(dim);
  const sumSin = new Float64Array(dim);

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      sumCos[i] += Math.cos(v[i]);
      sumSin[i] += Math.sin(v[i]);
    }
  }

  const out = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = Math.atan2(sumSin[i], sumCos[i]);
    if (out[i] < 0) out[i] += TWO_PI;
  }
  return out;
}

/** Cosine similarity on the corresponding complex unit vectors */
export function similarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += Math.cos(a[i] - b[i]);
  }
  return dot / a.length;
}
```

### Express-friendly wrapper (optional)

```js
// memory.js
import { encodeAtom, bind, unbind, bundle, similarity } from './hrr.js';

export class HolographicMemory {
  constructor(dim = 1024) {
    this.dim = dim;
    this.memory = null;          // single superposition vector
    this.facts = new Map();      // optional cleanup / cleanup memory
  }

  store(key, value) {
    const k = encodeAtom(key, this.dim);
    const v = encodeAtom(value, this.dim);
    const bound = bind(k, v);

    this.memory = this.memory ? bundle(this.memory, bound) : bound;
    this.facts.set(key, value);
  }

  probe(key) {
    if (!this.memory) return null;
    const k = encodeAtom(key, this.dim);
    const recovered = unbind(this.memory, k);
    // simple cleanup against known values (or return the raw vector)
    let best = null, bestSim = -1;
    for (const [_, val] of this.facts) {
      const cand = encodeAtom(val, this.dim);
      const s = similarity(recovered, cand);
      if (s > bestSim) { bestSim = s; best = val; }
    }
    return { value: best, confidence: bestSim };
  }
}
```

### Next steps — pick your flavor

1. **Pure core only** (`hrr.js` with the four functions) — drop into any Express route.
2. **Full mini-memory** (the class above + JSON serialize/deserialize).
3. **TypeScript + tests** (Vitest or Node test runner).
4. **npm package** ready to publish (`hrr` or `@yourorg/hrr`).

Which direction do you want to go first?  
I can drop a complete, ready-to-paste file (or a small repo structure) right now.

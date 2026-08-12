# HRR.js

[![CI](https://github.com/fingerskier/HRR.js/actions/workflows/ci.yml/badge.svg)](https://github.com/fingerskier/HRR.js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hrr-lib.svg)](https://www.npmjs.com/package/hrr-lib)

Minimal, deterministic, zero-dependency [Holographic Reduced Representations](https://en.wikipedia.org/wiki/Holographic_Reduced_Representation) for Node and edge runtimes, built on phase vectors.

- **Zero runtime dependencies** — only Node's built-in `crypto`
- **Deterministic** — `encodeAtom('alice')` yields the identical vector on every platform, process, and version (SHA-256 derived)
- **Phase vectors** in `[0, 2π)` — numerically stable, maps cleanly onto cosine similarity
- **Core algebra** — `bind`, `unbind`, `bundle`, `similarity`
- **Dual ESM + CJS** with bundled TypeScript types
- Optional `HolographicMemory` class for superposition + cleanup probing

## Install

```sh
npm install hrr-lib
```

Requires Node ≥ 18 (or any runtime with `node:crypto` support, e.g. Cloudflare Workers with `nodejs_compat`).

## Quick start

```js
import { encodeAtom, bind, unbind, similarity } from 'hrr-lib'
// CJS also works: const { encodeAtom, bind, unbind, similarity } = require('hrr-lib')

const alice = encodeAtom('alice')
const livesIn = encodeAtom('lives_in')
const paris = encodeAtom('paris')

// bind role and filler into a single fact vector
const fact = bind(bind(alice, livesIn), paris)

// recover the filler by unbinding the roles
const recovered = unbind(unbind(fact, alice), livesIn)

similarity(recovered, paris)              // ≈ 1.0
similarity(recovered, encodeAtom('london')) // ≈ 0.0
```

### Holographic memory

```js
import { HolographicMemory } from 'hrr-lib'

const mem = new HolographicMemory() // dim 1024 by default

mem.store('alice', 'paris')
mem.store('bob', 'london')
mem.store('carol', 'tokyo')

mem.probe('bob')
// → { value: 'london', confidence: 0.57... }

mem.probe('mallory')
// → { value: ..., confidence: ≈0 }  (low confidence = no such fact)
```

All facts share **one** superposed trace vector; `probe` unbinds the key and cleans up the result against the known values. Confidence degrades gracefully as the trace fills — dim 1024 comfortably holds ~10 facts with reliable recall.

## API

All vectors are `Float64Array`s of phases in `[0, 2π)` (exported type alias: `PhaseVector`). Functions never mutate their inputs. Mixing dimensions throws a `RangeError`.

### `encodeAtom(label, dim = 1024): PhaseVector`

Deterministic phase vector for a string. Phases derive from `sha256("<label>:<counter>")` digests read as little-endian uint16s scaled onto `[0, 2π)`. Distinct labels give near-orthogonal vectors (`|similarity| ≲ 0.05` at dim 1024).

### `bind(a, b): PhaseVector`

Associate two vectors by elementwise phase addition (equivalent to circular convolution of unit-modulus complex vectors). Commutative and associative; the result is dissimilar to both inputs. Binding preserves similarity: `sim(bind(a, c), bind(b, c)) === sim(a, b)`.

### `unbind(a, b): PhaseVector`

Inverse of `bind`: elementwise phase subtraction. `unbind(bind(a, b), b) ≈ a` exactly (up to floating point).

### `bundle(...vectors): PhaseVector`

Superpose any number of vectors via the elementwise circular mean. The result stays similar to every input (≈ 0.63 for two inputs at dim 1024) while remaining near-orthogonal to everything else. Throws if called with no vectors.

### `similarity(a, b): number`

Mean cosine of the phase differences — cosine similarity of the corresponding complex unit vectors. `1` for identical vectors, `≈ 0` for unrelated atoms, bounded in `[-1, 1]`.

### `new HolographicMemory(dim = 1024)`

| Member | Description |
| --- | --- |
| `store(key, value)` | Bind `key`→`value` and add the pair to the single superposed trace. Re-storing a key exactly replaces its previous binding. |
| `probe(key)` | `{ value, confidence } \| null` — best cleanup match for the unbound trace, `null` when empty. |
| `size` | Number of stored facts. |
| `clear()` | Reset the trace and fact table. |
| `dim` | Vector dimensionality (readonly). |

### Constants

- `DEFAULT_DIM` — `1024`
- `TWO_PI` — `2 * Math.PI`

## How it works

Classical HRR (Plate, 1995) uses real-valued vectors with circular convolution for binding. This library uses the equivalent **frequency-domain / phasor form**: each component is a unit-modulus complex number stored as its phase angle. Circular convolution then reduces to phase addition, correlation (unbinding) to phase subtraction, and superposition to the circular mean — all O(dim), no FFT needed. High dimensionality makes random vectors nearly orthogonal, which is what lets many bound facts share one trace and still be recovered.

## Development

```sh
npm install
npm test            # vitest suite (TDD — the specs are the contract)
npm run typecheck   # strict TS, no emit
npm run build       # dual ESM/CJS + .d.ts via tsup
```

## License

Apache-2.0

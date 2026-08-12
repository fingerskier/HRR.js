# HRR.js

[![CI](https://github.com/fingerskier/HRR.js/actions/workflows/ci.yml/badge.svg)](https://github.com/fingerskier/HRR.js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hrr-lib.svg)](https://www.npmjs.com/package/hrr-lib)

Minimal, deterministic, zero-dependency [Holographic Reduced Representations](https://en.wikipedia.org/wiki/Holographic_Reduced_Representation) for Node, browsers, and edge runtimes, built on phase vectors.

- **Zero runtime dependencies** — no Node builtins, no polyfills; the bundled SHA-256 is pure TypeScript
- **Deterministic** — `encodeAtom('alice')` yields the identical vector on every platform, process, and version (SHA-256 derived)
- **Phase vectors** in `[0, 2π)` — numerically stable, maps cleanly onto cosine similarity
- **Core algebra** — `bind`, `unbind`, `bundle`, `similarity`
- **Incremental superposition** — `Superposition` accumulator with weighted add, exact remove, and per-element consensus magnitude
- **Dual ESM + CJS** with bundled TypeScript types
- Optional `HolographicMemory` class for superposition + cleanup probing

## Install

```sh
npm install hrr-lib
```

> The package is published as **`hrr-lib`** — the npm registry rejected `hrr.js` as too similar to an existing package name. The repository keeps the HRR.js name.

Runs anywhere modern JavaScript runs: Node ≥ 18, browsers, and edge runtimes (e.g. Cloudflare Workers) — no Node builtins required.

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

### Direction and order

`bind` is commutative and associative, so the fact above is a symmetric product of all three atoms — *"alice lives_in paris"* and *"paris lives_in alice"* encode to the **identical** vector. (Classical HRR shares this property; circular convolution is commutative too.) When direction matters, bundle role-filler pairs instead:

```js
import { bundle } from 'hrr-lib'

const fact = bundle(
  bind(encodeAtom('subject'), alice),
  bind(encodeAtom('verb'), livesIn),
  bind(encodeAtom('object'), paris),
)

unbind(fact, encodeAtom('object'))  // ≈ paris (≈ 0.57 similarity; cleanup picks it)
```

For ordered sequences, tag positions with `permute` (cyclic shift): `bind(a, permute(b))` distinguishes `[a, b]` from `[b, a]`, and `permute(v, k)` marks position `k`.

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

mem.probe('mallory', { minConfidence: 0.3 })
// → null
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

**Not associative:** the circular mean renormalizes, so `bundle(bundle(a, b), c)` gives `c` as much weight as `a` and `b` combined. Superpose everything in one call when facts should carry equal weight — or accumulate incrementally with [`Superposition`](#new-superpositiondim--1024), which defers the renormalization and matches a single flat `bundle` exactly.

### `new Superposition(dim = 1024)`

The accumulator behind `bundle`, exposed for incremental and weighted superposition. It keeps the running cos/sin sums unreduced, so grouping doesn't matter and the magnitude information `bundle`'s `atan2` discards stays available.

```js
import { Superposition } from 'hrr-lib'

const s = new Superposition()
for (const v of stream) s.add(v)   // no need to materialize an array
s.add(recentFact, 2)               // weighted: recency decay, confidence…
s.remove(retractedFact)            // exact removal
const trace = s.toVector()         // ≡ one flat bundle over everything added
```

| Member | Description |
| --- | --- |
| `add(v, weight = 1)` | Add `v` scaled by `weight` — `atan2` of weighted sums is the weighted circular mean. Returns `this` for chaining. |
| `remove(v, weight = 1)` | Cancel a previous `add(v, weight)` (exact to floating-point rounding). |
| `toVector()` | Reduce to phases in `[0, 2π)`. Non-destructive, so you can keep accumulating. A fresh or fully cancelled accumulator reduces to the zero vector. |
| `magnitude` | Per-element `hypot` of the sums — consensus strength, from `0` (phases cancelled) to the number of unit-weight additions (phases identical). |
| `dim` | Vector dimensionality (readonly). |

`HolographicMemory` keeps its trace as a `Superposition` — this is the same primitive that gives it equal-weight facts and exact overwrite/delete.

### `permute(v, k = 1): PhaseVector`

Cyclically shift components by `k` positions (negative `k` inverts: `permute(permute(v, k), -k)` restores `v` exactly). Permutation preserves similarity and yields a vector near-orthogonal to the original — the standard tool for encoding order on top of commutative `bind`.

### `similarity(a, b): number`

Mean cosine of the phase differences — cosine similarity of the corresponding complex unit vectors. `1` for identical vectors, `≈ 0` for unrelated atoms, bounded in `[-1, 1]`.

### `new HolographicMemory(dim = 1024)`

| Member | Description |
| --- | --- |
| `store(key, value)` | Bind `key`→`value` and add the pair to the single superposed trace. Re-storing a key exactly replaces its previous binding. |
| `probe(key, options?)` | `{ value, confidence } \| null` — best cleanup match for the unbound trace, `null` when empty or below `options.minConfidence`. |
| `probeVector(vec, options?)` | Same cleanup, but probes with a raw key vector — e.g. one composed with `bind`/`bundle` that never existed as a stored string. |
| `has(key)` / `keys()` | Key membership / iterator over stored keys. |
| `delete(key)` | Exactly subtract the key's binding from the trace; returns whether it existed. |
| `size` | Number of stored facts. |
| `clear()` | Reset the trace, fact table, and atom cache. |
| `dim` | Vector dimensionality (readonly). |

Encoded atoms are cached per instance, so repeated stores and probes don't re-hash. Note that for exact string keys `probe` recovers nothing the internal key→value cleanup table doesn't already hold — the trace demonstrates the algebra (graceful degradation, capacity) and earns its keep when probing with `probeVector` and composed keys.

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

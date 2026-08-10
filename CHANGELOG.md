# Changelog

## Unreleased

- New: `Superposition` — the incremental accumulator behind `bundle`, now public (#3). `add(v, weight?)` / `remove(v, weight?)` / `toVector()` / `magnitude`: streaming and weighted superposition, exact removal, and per-element consensus strength that `bundle`'s `atan2` used to discard. However additions are grouped, `toVector()` matches a single flat `bundle` exactly — the fix for `bundle`'s non-associativity.
- `bundle` is now a thin wrapper over `Superposition` (bit-identical results).
- `HolographicMemory` refactored onto `Superposition`; no behavior change.

## 0.2.0

- **Renamed on npm to `hrr-lib`** — the registry rejected `hrr.js` as too similar to an existing package. The repository remains HRR.js; README, badge, and CI now reference the published name.
- Fix: `unbind`, `bundle`, and the memory trace could emit exactly 2π when floating-point rounding landed on the boundary, violating the documented `[0, 2π)` range.
- New: `permute(v, k)` — cyclic shift for encoding order and sequences on top of commutative `bind`.
- New: `HolographicMemory.delete(key)`, `has(key)`, `keys()`, `probeVector(vec, options?)`, and a `minConfidence` option on `probe`.
- Perf: `HolographicMemory` caches encoded atoms per instance.
- Docs: role-filler bundling pattern for directional facts (`bind` is symmetric), `bundle` non-associativity note.
- Dev: added missing `@vitest/coverage-v8` dependency; `npm run test:coverage` now works.

## 0.1.0

Initial release.

- `encodeAtom(label, dim?)` — deterministic SHA-256-derived phase vectors
- `bind` / `unbind` — phase addition/subtraction (circular convolution and its inverse)
- `bundle(...vectors)` — superposition via elementwise circular mean
- `similarity(a, b)` — mean cosine of phase differences
- `HolographicMemory` — single-trace store/probe with cleanup, exact overwrite semantics, `size`, `clear()`
- Dual ESM + CJS build with bundled TypeScript declarations; zero runtime dependencies

# Changelog

## 0.1.0

Initial release.

- `encodeAtom(label, dim?)` — deterministic SHA-256-derived phase vectors
- `bind` / `unbind` — phase addition/subtraction (circular convolution and its inverse)
- `bundle(...vectors)` — superposition via elementwise circular mean
- `similarity(a, b)` — mean cosine of phase differences
- `HolographicMemory` — single-trace store/probe with cleanup, exact overwrite semantics, `size`, `clear()`
- Dual ESM + CJS build with bundled TypeScript declarations; zero runtime dependencies

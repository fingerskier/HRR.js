# HRR Visualizer Webapp — Design

Date: 2026-08-12
Status: approved
Reqall: spec #3743, blocking task #3744

## Purpose

An interactive webapp for building intuition about Holographic Reduced
Representations, powered by this repository's own `hrr-lib`. The audience is
someone who has heard of vector-symbolic architectures and wants to see what
`bind`, `bundle`, `unbind`, and `permute` actually do to a vector. It is a
teaching playground, not a marketing page and not a debugging console.

It is deployed to GitHub Pages at `https://fingerskier.github.io/HRR.js/` by a
GitHub Actions workflow.

## Prerequisite: the library must run in a browser

`encodeAtom` hashes with `createHash('sha256')` from `node:crypto`. Browsers
offer no synchronous SHA-256 — `crypto.subtle.digest` is async only — so the
package cannot load in a browser as published.

The fix is to make the library isomorphic: add `src/sha256.ts`, a pure
TypeScript synchronous SHA-256 with no dependencies, and have `encodeAtom` use
it. Digest bytes are read as little-endian uint16s through a `DataView` rather
than `Buffer.readUInt16LE`. Output must be byte-identical to the current
implementation, so every existing encoding stays valid.

Two alternatives were rejected. A Vite alias that shims `node:crypto` inside
the webapp leaves the published package Node-only. Async WebCrypto with a
precomputed atom cache would break `encodeAtom`'s synchronous signature and
force the app to reimplement the encoding.

Sequence, red/green:

1. Known-answer tests for `sha256` from FIPS 180-4 — empty string, `"abc"`, and
   a multi-block input.
2. Golden `encodeAtom` vectors captured from the current `node:crypto`
   implementation, e.g. the exact eight phases of `encodeAtom('dog', 8)`, so
   the swap is provably output-preserving.
3. Swap the implementation. The whole existing suite stays green.

Release as 0.4.0 with a CHANGELOG entry noting that the package now runs in
browsers and edge runtimes with no `node:` imports. The `tsup` config is
unaffected. Coordinate the version with the still-open 0.3.0 publish task.

## Repository layout

The webapp lives in `web/` with its own `package.json`, holding `vite`,
`vitest`, `typescript`, and `@types/node` as devDependencies — the last of
these because `vite.config.ts` imports `node:url` and Vite declares
`@types/node` only as an optional peer dependency, so without it the CI job
fails to typecheck on a clean checkout. The library's `package.json`, its
`files` list, and its publish flow are untouched.

```
web/
  package.json
  vite.config.ts        base: '/HRR.js/'; alias hrr-lib -> ../src/index.ts
  index.html
  src/
    main.ts             wiring and layout
    state.ts            store and pub/sub
    expr.ts             expression parser and evaluator
    viz/strip.ts        phase-to-hue strip
    viz/dial.ts         phasor dial
    viz/scatter.ts      phase vs index
    viz/matrix.ts       similarity heatmap
    viz/chart.ts        line chart for the capacity sweep
    panels/shelf.ts
    panels/workbench.ts
    panels/memory.ts
    panels/superposition.ts
    style.css
```

Vite resolves the alias to the library's TypeScript source, so a library edit
is visible in the browser on save.

## State

A single store holds a `Map<name, Entry>`, where an entry carries its label,
its `PhaseVector`, whether it is an atom or a derived result, and a display
color. The store also holds the active dimension, selectable among 64, 256,
and 1024 and defaulting to 256 — smaller vectors read far better in the strip
and dial, and the library's own default of 1024 remains one click away.

Changing the dimension re-encodes every atom and re-evaluates every derived
expression. Panels subscribe to the store and re-render on change. Nothing
persists across reloads in v1.

## Expression language

A hand-written recursive-descent parser, roughly 120 lines, no dependencies.

```
statement := (ident '=')? expr
expr      := call | ident | number
call      := name '(' expr (',' expr)* ')'
```

Callable: `bind(a, b)`, `unbind(a, b)`, `bundle(a, b, ...)`, `permute(v, k)`,
and `similarity(a, b)`, which yields a scalar rather than a vector.
Identifiers resolve against the shelf's atoms and any previously named result.
Unknown names, wrong arity, dimension mismatches, and scalar/vector confusion
report inline next to the input.

## Visualizations

All four render to `<canvas>`.

- **Strip** — one 1px column per component, phase mapped onto a cyclic hue
  ramp. The whole vector reads as a single band; two related vectors show
  visibly related banding. Hovering reports the index and the phase in
  radians.
- **Dial** — up to 256 sampled components drawn as unit phasors on a circle,
  with the resultant mean vector overlaid. Fed a `Superposition`, it also draws
  the magnitude ring.
- **Scatter** — phase against index, one dot per component. Precise where the
  strip is impressionistic.
- **Matrix** — an n×n cosine-similarity heatmap over everything named, on a
  diverging ramp centered at zero. Hovering reports the value.

A cyclic hue ramp is inherently hostile to colorblind viewers; every panel
therefore carries numeric readouts, and no conclusion in the app depends on
distinguishing two hues.

## Panels

- **Shelf** — add and remove atoms by label, each with a color chip, plus the
  dimension selector.
- **Workbench** — the expression bar and a list of results. Each result is a
  row showing its strip; clicking expands it to the dial and scatter. The strip
  alone keeps a row to one line, so a dozen results still fit on a screen.
- **Similarity matrix** — live over every named vector.
- **Memory** — a `HolographicMemory` panel with a store/delete table, a probe
  box reporting the recovered value and its confidence as a bar, and a capacity
  sweep that plots probe *accuracy* against the number of stored facts.
  Accuracy, not confidence: confidence decays as roughly 1/√n at every
  dimension, so it cannot show the difference between a 64-dimensional memory
  and a 1024-dimensional one, which is the whole point of the panel. The table
  shows the stored value beside the recalled one and highlights rows where they
  disagree, so a crowded trace visibly starts losing facts.
- **Superposition** — add and remove vectors with weights, showing the reduced
  phase strip beside a grayscale magnitude strip, so consensus and cancellation
  are distinguishable.

## Deployment

`.github/workflows/pages.yml` runs on pushes to `main` that touch `web/**` or
`src/**`, and on manual dispatch. It installs with `npm ci` and builds with
`npm run build` inside `web/` on Node 20, then hands `web/dist` to
`actions/upload-pages-artifact` and `actions/deploy-pages`. It declares
`pages: write` and `id-token: write` and uses a `pages` concurrency group.

The repository owner must set Settings → Pages → Source to "GitHub Actions"
once; the workflow cannot do this itself.

## Testing

The library keeps its existing suite green throughout and gains the SHA-256
known-answer tests and the golden `encodeAtom` vectors described above.

The webapp gets Vitest specs for `expr.ts` and `state.ts` — both pure logic
with no DOM dependency. Parser tests cover precedence-free nesting, arity
errors, unknown identifiers, scalar results, and assignment. Store tests cover
re-encoding on dimension change, subscriber notification, and removal of an
atom that a derived result depends on. Canvas rendering is not unit-tested.

Both packages typecheck. Development follows red/green TDD per the repository's
`CLAUDE.md`.

## Out of scope for v1

URL or localStorage persistence of a session, guided lesson chapters, export
of vectors, and any framework runtime.

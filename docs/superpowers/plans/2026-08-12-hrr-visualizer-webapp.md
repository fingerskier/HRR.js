# HRR Visualizer Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an interactive browser workbench for building intuition about Holographic Reduced Representations, powered by this repository's own library and deployed to GitHub Pages.

**Architecture:** The library first becomes isomorphic by replacing its `node:crypto` SHA-256 with a pure-TypeScript synchronous one, so it loads in a browser. The webapp then lives in `web/` as a separate Vite package that aliases `hrr-lib` straight to `../src/index.ts`. A single observable store holds named vectors; a hand-written expression parser produces new ones; four canvas renderers draw them; four panels compose the renderers into a page.

**Tech Stack:** TypeScript 5.7, Vite 6, Vitest 3, plain DOM, `<canvas>` 2D. No runtime dependencies anywhere.

**Spec:** `docs/superpowers/specs/2026-08-12-hrr-visualizer-webapp-design.md`

## Global Constraints

- Zero runtime dependencies. `vite`, `vitest`, and `typescript` are devDependencies only. No framework, no charting library, no hashing library.
- The library keeps `"type": "module"` ESM source with `.js` extensions on relative imports (`./hrr.js`), as `verbatimModuleSyntax` and the bundler resolution require.
- Both packages compile under `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Indexed reads need `!` or an explicit guard; optional properties must be omitted, never set to `undefined`.
- `encodeAtom` output must stay byte-identical to the current implementation forever. Every change is checked against pinned golden vectors.
- After Task 1, no file under `src/` may import anything from `node:`. The webapp must never shim, alias, or polyfill a Node builtin.
- Vite `base` is `'/HRR.js/'` — the GitHub Pages project subpath. All asset URLs must go through Vite so this prefix is applied.
- Every task ends with a commit. Tests are written before implementation and observed failing first.
- Test commands run from the repository root unless the step says otherwise.

---

### Task 1: Pure-TypeScript SHA-256 and an isomorphic `encodeAtom`

**Files:**
- Create: `src/sha256.ts`
- Create: `test/sha256.test.ts`
- Modify: `src/hrr.ts` (imports at top; `encodeAtom` body)
- Modify: `test/hrr.test.ts` (add golden vectors to the existing `describe('encodeAtom')` block)
- Modify: `tsup.config.ts` (drop the `external` entry)
- Modify: `package.json` (version), `CHANGELOG.md`, `.github/workflows/ci.yml` (browser smoke check)

**Interfaces:**
- Consumes: nothing.
- Produces: `sha256(bytes: Uint8Array): Uint8Array` (32 bytes) from `src/sha256.ts`. `encodeAtom(label: string, dim?: number): PhaseVector` keeps its exact current signature and output.

- [ ] **Step 1: Write the failing SHA-256 test**

Create `test/sha256.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256 } from '../src/sha256.js'

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('sha256', () => {
  it('hashes the empty input (FIPS 180-4 known answer)', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes "abc" (FIPS 180-4 known answer)', () => {
    expect(hex(sha256(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('hashes a 56-byte input, which forces a second padding block', () => {
    const input = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(input.length).toBe(56)
    expect(hex(sha256(utf8(input)))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('returns exactly 32 bytes', () => {
    expect(sha256(utf8('anything')).length).toBe(32)
  })

  it('agrees with node:crypto across lengths that straddle block boundaries', () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 200, 1000]) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 0xff
      const expected = createHash('sha256').update(bytes).digest('hex')
      expect(hex(sha256(bytes)), `length ${n}`).toBe(expected)
    }
  })

  it('does not mutate its input', () => {
    const bytes = utf8('abc')
    const copy = bytes.slice()
    sha256(bytes)
    expect(Array.from(bytes)).toEqual(Array.from(copy))
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run test/sha256.test.ts`
Expected: FAIL — cannot resolve `../src/sha256.js`.

- [ ] **Step 3: Implement the hash**

Create `src/sha256.ts`:

```ts
/**
 * Synchronous SHA-256 (FIPS 180-4), pure TypeScript.
 *
 * The library's encoding must be reproducible in every runtime, and browsers
 * offer no synchronous digest — `crypto.subtle` is promise-based. Roughly
 * eighty lines of arithmetic buys the package a life outside Node.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0

/** SHA-256 digest of `bytes`, as 32 bytes. The input is not modified. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ])

  // Pad to a multiple of 64 bytes: a 0x80 byte, zeros, then the message
  // length in bits as a big-endian 64-bit integer.
  const len = bytes.length
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6)
  padded.set(bytes)
  padded[len] = 0x80

  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000), false)
  view.setUint32(padded.length - 4, (len << 3) >>> 0, false)

  const w = new Uint32Array(64)

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!
      const y = w[i - 2]!
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }

    let a = h[0]!
    let b = h[1]!
    let c = h[2]!
    let d = h[3]!
    let e = h[4]!
    let f = h[5]!
    let g = h[6]!
    let hh = h[7]!

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (S0 + maj) >>> 0

      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }

    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + b) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
    h[5] = (h[5]! + f) >>> 0
    h[6] = (h[6]! + g) >>> 0
    h[7] = (h[7]! + hh) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!, false)
  return out
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run test/sha256.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Pin golden `encodeAtom` vectors before touching `encodeAtom`**

These values were captured from the current `node:crypto` implementation. They are the contract the swap must preserve. Append to `test/hrr.test.ts` inside the existing `describe('encodeAtom', ...)` block:

```ts
  it('matches golden vectors captured from the original implementation', () => {
    expect(Array.from(encodeAtom('dog', 8))).toEqual([
      1.0467501401334645, 1.4648557786315444, 0.4065049087896949,
      5.537287149070194, 2.9833050110398434, 2.0945548920586003,
      1.5598667136812114, 3.0531011368886403,
    ])

    // A dim that is not a multiple of 16 stops mid-digest.
    expect(Array.from(encodeAtom('cat', 3))).toEqual([
      4.73089262363856, 3.081767402862253, 1.8381883528832124,
    ])

    // Non-ASCII labels must hash as UTF-8, as node:crypto did by default.
    expect(Array.from(encodeAtom('café ☕', 4))).toEqual([
      6.221346706667946, 1.0755122799063201, 1.1806858376757294,
      4.992340474173819,
    ])

    // A label long enough to span multiple hash blocks.
    expect(Array.from(encodeAtom('x'.repeat(200), 20)).slice(0, 4)).toEqual([
      3.736010208895479, 0.3452415510735121, 1.8594723363151258,
      0.9688047413490253,
    ])
  })
```

- [ ] **Step 6: Run the suite and confirm the goldens already pass**

Run: `npx vitest run test/hrr.test.ts`
Expected: PASS. The goldens describe current behaviour, so they must be green *before* the swap. If any fails, stop — the captured values are wrong and the swap cannot be verified.

- [ ] **Step 7: Commit the safety net**

```bash
git add src/sha256.ts test/sha256.test.ts test/hrr.test.ts
git commit -m "test: pure-TS sha256 with known answers, plus encodeAtom goldens"
```

- [ ] **Step 8: Swap `encodeAtom` onto the new hash**

In `src/hrr.ts`, replace the first line:

```ts
import { createHash } from 'node:crypto'
```

with:

```ts
import { sha256 } from './sha256.js'

const utf8 = new TextEncoder()
```

Then replace the body of the `while` loop inside `encodeAtom`:

```ts
  while (i < dim) {
    const hash = sha256(utf8.encode(`${label}:${counter}`))
    const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength)
    for (let j = 0; j < 16 && i < dim; j++, i++) {
      const uint16 = view.getUint16(j * 2, true)
      phases[i] = (uint16 / 65536) * TWO_PI
    }
    counter++
  }
```

Update the doc comment above `encodeAtom` so the sentence about digests reads:

```
 * Phases are derived from SHA-256 of `${label}:${counter}` — each 32-byte
 * digest is read as 16 little-endian uint16s scaled onto [0, 2π), with the
 * counter incremented until `dim` phases are produced. The hash is computed
 * in pure JavaScript, so the same label yields the same vector in every
 * runtime — Node, browsers, and edge workers alike.
```

- [ ] **Step 9: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, every existing spec plus the new ones. The frozen-encoding test and the goldens both prove the output is unchanged.

- [ ] **Step 10: Prove no `node:` import survives**

Run: `npx tsc --noEmit && grep -rn "node:" src/ || echo "clean"`
Expected: typecheck passes and `grep` prints `clean`.

- [ ] **Step 11: Drop the bundler's Node escape hatch**

In `tsup.config.ts`, delete the line:

```ts
  external: ['node:crypto'],
```

- [ ] **Step 12: Add a browser-target smoke check to CI**

In `.github/workflows/ci.yml`, append this step to the `test` job, after the packed-tarball step:

```yaml
      - name: Verify the bundle has no Node builtins
        run: |
          if grep -rn "node:" dist/; then
            echo "dist still references a Node builtin" >&2
            exit 1
          fi
```

- [ ] **Step 13: Build and verify the bundle is clean**

Run: `npm run build && grep -rn "node:" dist/ || echo "clean"`
Expected: build succeeds, `grep` prints `clean`.

- [ ] **Step 14: Bump the version and write the changelog**

In `package.json`, set `"version": "0.4.0"`.

In `CHANGELOG.md`, add a new section above the previous release, matching the file's existing heading style:

```markdown
## 0.4.0

### Changed

- `encodeAtom` now hashes with a bundled pure-TypeScript SHA-256 instead of
  `node:crypto`. Output is byte-identical — pinned by golden vectors — but the
  package no longer imports any Node builtin, so it runs unchanged in browsers
  and edge runtimes.
```

- [ ] **Step 15: Commit**

```bash
git add src/hrr.ts tsup.config.ts package.json CHANGELOG.md .github/workflows/ci.yml
git commit -m "feat: run in any runtime by dropping the node:crypto dependency"
```

---

### Task 2: The `web/` package skeleton

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.ts`, `web/src/style.css`, `web/test/smoke.test.ts`, `web/.gitignore`
- Modify: `.github/workflows/ci.yml` (add a `web` job)

**Interfaces:**
- Consumes: `encodeAtom`, `similarity` from `hrr-lib` (Task 1).
- Produces: the `hrr-lib` alias, which every later task imports from; `npm run dev|build|test|typecheck` inside `web/`.

- [ ] **Step 1: Write the failing smoke test**

Create `web/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeAtom, similarity } from 'hrr-lib'

describe('hrr-lib alias', () => {
  it('resolves to the library source', () => {
    const dog = encodeAtom('dog', 64)
    expect(dog.length).toBe(64)
    expect(similarity(dog, dog)).toBeCloseTo(1, 12)
  })

  it('gives near-orthogonal vectors for unrelated labels', () => {
    const s = similarity(encodeAtom('dog', 1024), encodeAtom('cat', 1024))
    expect(Math.abs(s)).toBeLessThan(0.15)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run`
Expected: FAIL — there is no `web/` package yet, so the command itself errors.

- [ ] **Step 3: Create the package files**

`web/package.json`:

```json
{
  "name": "hrr-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`web/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The GitHub Pages project subpath. Every asset URL is prefixed with it.
  base: '/HRR.js/',
  resolve: {
    alias: {
      // Point at the library's TypeScript source, so editing the library
      // hot-reloads the app.
      'hrr-lib': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "hrr-lib": ["../src/index.ts"]
    }
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`web/.gitignore`:

```
dist
node_modules
```

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HRR Workbench</title>
    <meta
      name="description"
      content="An interactive workbench for holographic reduced representations."
    />
  </head>
  <body>
    <header class="masthead">
      <h1>HRR Workbench</h1>
      <p>
        Bind, bundle, and unbind phase vectors, and watch what each operation
        does to them. Powered by
        <a href="https://github.com/fingerskier/HRR.js">hrr-lib</a>.
      </p>
    </header>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`web/src/main.ts`:

```ts
import './style.css'
import { encodeAtom, similarity } from 'hrr-lib'

const app = document.querySelector<HTMLElement>('#app')
if (app === null) throw new Error('#app is missing from index.html')

const self = similarity(encodeAtom('dog', 256), encodeAtom('dog', 256))
app.textContent = `library loaded — similarity(dog, dog) = ${self.toFixed(3)}`
```

`web/src/style.css`:

```css
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --line: #2a2f3a;
  --ink: #e6e9ef;
  --ink-dim: #9aa3b2;
  --accent: #7aa2f7;
  --bad: #f7768e;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0 1.25rem 3rem;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.masthead {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem 0 1rem;
}

.masthead h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
  letter-spacing: -0.01em;
}

.masthead p {
  margin: 0;
  color: var(--ink-dim);
  max-width: 40rem;
}

a {
  color: var(--accent);
}

#app {
  max-width: 60rem;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}
```

- [ ] **Step 4: Install and run the smoke test**

Run: `cd web && npm install && npx vitest run`
Expected: PASS, 2 tests. `npm install` also writes `web/package-lock.json`, which the deploy workflow's `npm ci` requires.

- [ ] **Step 5: Confirm the dev server actually serves the page**

Run: `cd web && npm run build`
Expected: build succeeds and reports assets written to `web/dist`, with `/HRR.js/` in the emitted script URL.

- [ ] **Step 6: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Add a CI job for the webapp**

In `.github/workflows/ci.yml`, append a second job at the same indentation as `test:`:

```yaml
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm run typecheck
        working-directory: web
      - run: npm test
        working-directory: web
      - run: npm run build
        working-directory: web
```

- [ ] **Step 8: Commit**

```bash
git add web .github/workflows/ci.yml
git commit -m "feat(web): scaffold the Vite workbench package"
```

---

### Task 3: Expression parser and evaluator

**Files:**
- Create: `web/src/expr.ts`, `web/test/expr.test.ts`

**Interfaces:**
- Consumes: `bind`, `unbind`, `bundle`, `permute`, `similarity`, `PhaseVector` from `hrr-lib`.
- Produces:
  - `class ExprError extends Error`
  - `type Value = { kind: 'vector'; vector: PhaseVector } | { kind: 'scalar'; value: number }`
  - `interface Statement { name: string | null; expression: string }`
  - `splitAssignment(input: string): Statement`
  - `identifiers(expression: string): string[]`
  - `evaluate(expression: string, env: ReadonlyMap<string, PhaseVector>): Value`

- [ ] **Step 1: Write the failing tests**

Create `web/test/expr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeAtom, bind, similarity, type PhaseVector } from 'hrr-lib'
import { ExprError, evaluate, identifiers, splitAssignment } from '../src/expr.js'

const DIM = 64
const env = new Map<string, PhaseVector>([
  ['dog', encodeAtom('dog', DIM)],
  ['cat', encodeAtom('cat', DIM)],
  ['role', encodeAtom('role', DIM)],
])

const vec = (source: string): PhaseVector => {
  const v = evaluate(source, env)
  if (v.kind !== 'vector') throw new Error(`expected a vector from ${source}`)
  return v.vector
}

const num = (source: string): number => {
  const v = evaluate(source, env)
  if (v.kind !== 'scalar') throw new Error(`expected a scalar from ${source}`)
  return v.value
}

describe('splitAssignment', () => {
  it('separates a name from its expression', () => {
    expect(splitAssignment('pet = bind(dog, role)')).toEqual({
      name: 'pet',
      expression: 'bind(dog, role)',
    })
  })

  it('returns a null name for a bare expression', () => {
    expect(splitAssignment('  bind(dog, role) ')).toEqual({
      name: null,
      expression: 'bind(dog, role)',
    })
  })

  it('does not mistake a nested call for an assignment', () => {
    expect(splitAssignment('bind(dog, role)').name).toBeNull()
  })

  it('rejects a name that is not an identifier', () => {
    expect(() => splitAssignment('2pet = dog')).toThrow(ExprError)
  })
})

describe('identifiers', () => {
  it('lists every name an expression depends on, without duplicates', () => {
    expect(identifiers('bundle(bind(dog, role), cat, dog)')).toEqual([
      'dog',
      'role',
      'cat',
    ])
  })

  it('ignores function names and numbers', () => {
    expect(identifiers('permute(dog, 3)')).toEqual(['dog'])
  })
})

describe('evaluate', () => {
  it('resolves a bare identifier', () => {
    expect(Array.from(vec('dog'))).toEqual(Array.from(env.get('dog')!))
  })

  it('binds two vectors', () => {
    const expected = bind(env.get('dog')!, env.get('role')!)
    expect(Array.from(vec('bind(dog, role)'))).toEqual(Array.from(expected))
  })

  it('recovers a bound vector by unbinding, to numeric tolerance', () => {
    const recovered = vec('unbind(bind(dog, role), role)')
    expect(similarity(recovered, env.get('dog')!)).toBeCloseTo(1, 10)
  })

  it('bundles a variable number of arguments', () => {
    // A three-way bundle sits around 0.53 from each member asymptotically, but
    // at dim 64 sampling noise drags it as low as 0.40. Unrelated atoms at this
    // dimension reach |0.13|, so 0.3 separates signal from noise with room to
    // spare.
    const blend = vec('bundle(dog, cat, role)')
    expect(similarity(blend, env.get('dog')!)).toBeGreaterThan(0.3)
    expect(similarity(blend, env.get('cat')!)).toBeGreaterThan(0.3)
  })

  it('permutes by an integer shift and back again', () => {
    const round = vec('permute(permute(dog, 3), -3)')
    expect(Array.from(round)).toEqual(Array.from(env.get('dog')!))
  })

  it('returns a scalar from similarity', () => {
    expect(num('similarity(dog, dog)')).toBeCloseTo(1, 12)
    expect(Math.abs(num('similarity(dog, cat)'))).toBeLessThan(0.3)
  })

  it('tolerates whitespace and is case-sensitive about names', () => {
    expect(num('  similarity( dog ,dog )  ')).toBeCloseTo(1, 12)
    expect(() => evaluate('similarity(Dog, dog)', env)).toThrow(/unknown name/i)
  })

  it('rejects an unknown identifier', () => {
    expect(() => evaluate('bind(dog, ferret)', env)).toThrow(ExprError)
    expect(() => evaluate('bind(dog, ferret)', env)).toThrow(/ferret/)
  })

  it('rejects an unknown function', () => {
    expect(() => evaluate('blend(dog, cat)', env)).toThrow(/unknown function/i)
  })

  it('rejects the wrong number of arguments', () => {
    expect(() => evaluate('bind(dog)', env)).toThrow(/expects 2/)
    expect(() => evaluate('bundle(dog)', env)).toThrow(/at least 2/)
    expect(() => evaluate('permute(dog, 1, 2)', env)).toThrow(/expects/)
  })

  it('rejects a scalar where a vector belongs, and the reverse', () => {
    expect(() => evaluate('bind(dog, 3)', env)).toThrow(/expects a vector/)
    expect(() => evaluate('permute(dog, cat)', env)).toThrow(/expects a number/)
  })

  it('rejects a non-integer shift', () => {
    expect(() => evaluate('permute(dog, 1.5)', env)).toThrow(ExprError)
  })

  it('rejects malformed input', () => {
    expect(() => evaluate('bind(dog, cat', env)).toThrow(/expected \)/)
    expect(() => evaluate('', env)).toThrow(/empty/)
    expect(() => evaluate('dog cat', env)).toThrow(/unexpected/)
  })

  it('reports a dimension mismatch from the library as an ExprError', () => {
    const mixed = new Map(env)
    mixed.set('wide', encodeAtom('wide', 128))
    expect(() => evaluate('bind(dog, wide)', mixed)).toThrow(ExprError)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd web && npx vitest run test/expr.test.ts`
Expected: FAIL — cannot resolve `../src/expr.js`.

- [ ] **Step 3: Implement the parser and evaluator**

Create `web/src/expr.ts`:

```ts
import {
  bind,
  bundle,
  permute,
  similarity,
  unbind,
  type PhaseVector,
} from 'hrr-lib'

/** A user-facing problem with an expression: bad syntax, name, or type. */
export class ExprError extends Error {
  override name = 'ExprError'
}

/** The result of evaluating an expression. */
export type Value =
  | { kind: 'vector'; vector: PhaseVector }
  | { kind: 'scalar'; value: number }

/** An input line, split into an optional target name and the expression. */
export interface Statement {
  name: string | null
  expression: string
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Split `name = expression` from a bare expression. Only a leading `=` at the
 * top level counts, so `similarity(a, b)` is never read as an assignment.
 */
export function splitAssignment(input: string): Statement {
  const eq = input.indexOf('=')
  if (eq === -1) return { name: null, expression: input.trim() }

  const name = input.slice(0, eq).trim()
  if (!IDENT.test(name)) {
    throw new ExprError(`"${name}" is not a valid name`)
  }
  return { name, expression: input.slice(eq + 1).trim() }
}

type Token =
  | { type: 'name'; value: string }
  | { type: 'number'; value: number }
  | { type: 'punct'; value: '(' | ')' | ',' }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < source.length) {
    const ch = source[i]!

    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: 'punct', value: ch })
      i++
      continue
    }

    if (/[-0-9.]/.test(ch)) {
      const start = i
      i++
      while (i < source.length && /[0-9.]/.test(source[i]!)) i++
      const text = source.slice(start, i)
      const value = Number(text)
      if (!Number.isFinite(value)) {
        throw new ExprError(`"${text}" is not a number`)
      }
      tokens.push({ type: 'number', value })
      continue
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i++
      tokens.push({ type: 'name', value: source.slice(start, i) })
      continue
    }

    throw new ExprError(`unexpected character "${ch}"`)
  }

  return tokens
}

type Node =
  | { type: 'ref'; name: string }
  | { type: 'number'; value: number }
  | { type: 'call'; fn: string; args: Node[] }

function parse(source: string): Node {
  const tokens = tokenize(source)
  if (tokens.length === 0) throw new ExprError('expression is empty')

  let pos = 0

  const peek = (): Token | undefined => tokens[pos]

  const parseNode = (): Node => {
    const token = tokens[pos]
    if (token === undefined) throw new ExprError('expression ended early')
    pos++

    if (token.type === 'number') return { type: 'number', value: token.value }

    if (token.type === 'name') {
      const next = peek()
      if (next?.type !== 'punct' || next.value !== '(') {
        return { type: 'ref', name: token.value }
      }
      pos++ // consume '('

      const args: Node[] = []
      const closing = peek()
      if (closing?.type === 'punct' && closing.value === ')') {
        pos++
        return { type: 'call', fn: token.value, args }
      }

      for (;;) {
        args.push(parseNode())
        const sep = peek()
        if (sep?.type === 'punct' && sep.value === ',') {
          pos++
          continue
        }
        if (sep?.type === 'punct' && sep.value === ')') {
          pos++
          return { type: 'call', fn: token.value, args }
        }
        throw new ExprError('expected ) or , in the argument list')
      }
    }

    throw new ExprError(`unexpected "${token.value}"`)
  }

  const node = parseNode()
  if (pos !== tokens.length) {
    const extra = tokens[pos]!
    throw new ExprError(`unexpected "${extra.value}" after the expression`)
  }
  return node
}

/** Every name an expression reads, in first-seen order, without duplicates. */
export function identifiers(expression: string): string[] {
  const found: string[] = []

  const walk = (node: Node): void => {
    if (node.type === 'ref') {
      if (!found.includes(node.name)) found.push(node.name)
      return
    }
    if (node.type === 'call') node.args.forEach(walk)
  }

  walk(parse(expression))
  return found
}

const asVector = (value: Value, fn: string, at: number): PhaseVector => {
  if (value.kind !== 'vector') {
    throw new ExprError(`${fn} expects a vector as argument ${at + 1}`)
  }
  return value.vector
}

const asNumber = (value: Value, fn: string, at: number): number => {
  if (value.kind !== 'scalar') {
    throw new ExprError(`${fn} expects a number as argument ${at + 1}`)
  }
  return value.value
}

const expectArity = (fn: string, args: unknown[], n: number): void => {
  if (args.length !== n) {
    throw new ExprError(`${fn} expects ${n} arguments, got ${args.length}`)
  }
}

/**
 * Evaluate an expression against named vectors. Library errors — a dimension
 * mismatch, a bad shift — are re-thrown as ExprError so the UI has one error
 * type to render.
 */
export function evaluate(
  expression: string,
  env: ReadonlyMap<string, PhaseVector>,
): Value {
  const run = (node: Node): Value => {
    if (node.type === 'number') return { kind: 'scalar', value: node.value }

    if (node.type === 'ref') {
      const vector = env.get(node.name)
      if (vector === undefined) {
        throw new ExprError(`unknown name "${node.name}"`)
      }
      return { kind: 'vector', vector }
    }

    const { fn, args } = node
    const values = args.map(run)

    try {
      switch (fn) {
        case 'bind':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: bind(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        case 'unbind':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: unbind(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        case 'bundle': {
          if (values.length < 2) {
            throw new ExprError('bundle expects at least 2 arguments')
          }
          const vectors = values.map((v, i) => asVector(v, fn, i))
          return { kind: 'vector', vector: bundle(...vectors) }
        }
        case 'permute':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: permute(
              asVector(values[0]!, fn, 0),
              asNumber(values[1]!, fn, 1),
            ),
          }
        case 'similarity':
          expectArity(fn, values, 2)
          return {
            kind: 'scalar',
            value: similarity(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        default:
          throw new ExprError(`unknown function "${fn}"`)
      }
    } catch (error) {
      if (error instanceof ExprError) throw error
      throw new ExprError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return run(parse(expression))
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd web && npx vitest run test/expr.test.ts`
Expected: PASS. If the malformed-input test reports a different message than `expected )`, adjust the thrown text — not the test's intent.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && cd ..
git add web/src/expr.ts web/test/expr.test.ts
git commit -m "feat(web): expression parser and evaluator over the HRR algebra"
```

---

### Task 4: The observable store

**Files:**
- Create: `web/src/state.ts`, `web/test/state.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `identifiers`, `splitAssignment`, `ExprError` from `web/src/expr.ts`; `encodeAtom` from `hrr-lib`.
- Produces:
  - `const DIMS: readonly number[]` — `[64, 256, 1024]`
  - `interface Entry { name: string; kind: 'atom' | 'derived'; source: string; vector: PhaseVector; color: string }`
  - `class Store` with `dim`, `entries`, `get`, `env`, `addAtom`, `addDerived`, `submit`, `remove`, `setDim`, `subscribe`, `reset`

- [ ] **Step 1: Write the failing tests**

Create `web/test/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeAtom, similarity } from 'hrr-lib'
import { ExprError } from '../src/expr.js'
import { DIMS, Store } from '../src/state.js'

describe('Store', () => {
  it('starts empty at the default dimension', () => {
    const store = new Store()
    expect(store.entries).toEqual([])
    expect(store.dim).toBe(256)
    expect(DIMS).toContain(256)
  })

  it('encodes an atom at the current dimension', () => {
    const store = new Store()
    const dog = store.addAtom('dog')
    expect(dog.kind).toBe('atom')
    expect(dog.vector.length).toBe(256)
    expect(Array.from(dog.vector)).toEqual(Array.from(encodeAtom('dog', 256)))
  })

  it('gives each entry a distinct color from the palette', () => {
    const store = new Store()
    const a = store.addAtom('dog')
    const b = store.addAtom('cat')
    expect(a.color).not.toBe(b.color)
  })

  it('rejects a duplicate or malformed atom name', () => {
    const store = new Store()
    store.addAtom('dog')
    expect(() => store.addAtom('dog')).toThrow(/already/)
    expect(() => store.addAtom('2dog')).toThrow(ExprError)
    expect(() => store.addAtom('bind')).toThrow(/reserved/)
  })

  it('evaluates a derived entry and remembers its source', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    const pet = store.addDerived('pet', 'bind(dog, role)')
    expect(pet.kind).toBe('derived')
    expect(pet.source).toBe('bind(dog, role)')
    expect(pet.vector.length).toBe(256)
  })

  it('lets a derived entry build on an earlier derived entry', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')
    const back = store.addDerived('back', 'unbind(pet, role)')
    expect(similarity(back.vector, store.get('dog')!.vector)).toBeCloseTo(1, 10)
  })

  it('submits a line, naming the result automatically when no name is given', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    const first = store.submit('bind(dog, role)')
    expect(first.kind).toBe('derived')
    expect(first.name).toBe('r1')
    expect(store.submit('bind(role, dog)').name).toBe('r2')
    expect(store.submit('pet = bind(dog, role)').name).toBe('pet')
  })

  it('returns a scalar result from submit without storing an entry', () => {
    const store = new Store()
    store.addAtom('dog')
    const before = store.entries.length
    const result = store.submitScalar('similarity(dog, dog)')
    expect(result).toBeCloseTo(1, 12)
    expect(store.entries.length).toBe(before)
  })

  it('re-encodes atoms and re-evaluates derived entries when the dim changes', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')

    store.setDim(64)

    expect(store.dim).toBe(64)
    expect(store.get('dog')!.vector.length).toBe(64)
    expect(store.get('pet')!.vector.length).toBe(64)
    expect(Array.from(store.get('dog')!.vector)).toEqual(
      Array.from(encodeAtom('dog', 64)),
    )
  })

  it('rejects a dimension it does not offer', () => {
    const store = new Store()
    expect(() => store.setDim(7)).toThrow(/dimension/)
  })

  it('removes an entry together with everything derived from it', () => {
    const store = new Store()
    store.addAtom('dog')
    store.addAtom('role')
    store.addDerived('pet', 'bind(dog, role)')
    store.addDerived('back', 'unbind(pet, role)')

    expect(store.remove('dog')).toBe(true)

    expect(store.get('dog')).toBeUndefined()
    expect(store.get('pet')).toBeUndefined()
    expect(store.get('back')).toBeUndefined()
    expect(store.get('role')).toBeDefined()
  })

  it('reports removing an absent name', () => {
    expect(new Store().remove('ghost')).toBe(false)
  })

  it('notifies subscribers once per mutation and stops after unsubscribe', () => {
    const store = new Store()
    let calls = 0
    const off = store.subscribe(() => {
      calls++
    })

    store.addAtom('dog')
    expect(calls).toBe(1)
    store.setDim(64)
    expect(calls).toBe(2)
    store.remove('dog')
    expect(calls).toBe(3)

    off()
    store.addAtom('cat')
    expect(calls).toBe(3)
  })

  it('does not notify when a mutation fails', () => {
    const store = new Store()
    store.addAtom('dog')
    let calls = 0
    store.subscribe(() => {
      calls++
    })
    expect(() => store.addAtom('dog')).toThrow()
    expect(calls).toBe(0)
  })

  it('exposes an env map for the evaluator', () => {
    const store = new Store()
    store.addAtom('dog')
    expect(store.env().get('dog')).toBeDefined()
    expect(store.env().size).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd web && npx vitest run test/state.test.ts`
Expected: FAIL — cannot resolve `../src/state.js`.

- [ ] **Step 3: Implement the store**

Create `web/src/state.ts`:

```ts
import { encodeAtom, type PhaseVector } from 'hrr-lib'
import { ExprError, evaluate, identifiers, splitAssignment } from './expr.js'

/** Dimensions the workbench offers. Smaller vectors read better on screen. */
export const DIMS = [64, 256, 1024] as const

const DEFAULT_DIM = 256

/** Names the expression language owns, so an atom may not take them. */
const RESERVED = new Set(['bind', 'unbind', 'bundle', 'permute', 'similarity'])

const PALETTE = [
  '#7aa2f7',
  '#9ece6a',
  '#e0af68',
  '#bb9af7',
  '#7dcfff',
  '#f7768e',
  '#73daca',
  '#ff9e64',
]

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A named vector on the shelf: either encoded from a label or computed. */
export interface Entry {
  name: string
  kind: 'atom' | 'derived'
  /** An atom's label, or a derived entry's expression text. */
  source: string
  vector: PhaseVector
  color: string
}

type Listener = () => void

/**
 * Every named vector in the app, in insertion order, plus the dimension they
 * all share. Panels subscribe and redraw; nothing else holds vector state.
 */
export class Store {
  #dim: number = DEFAULT_DIM
  #entries = new Map<string, Entry>()
  #listeners = new Set<Listener>()
  #colorCursor = 0
  #resultCursor = 0

  get dim(): number {
    return this.#dim
  }

  /** Entries in insertion order. Derived entries follow their dependencies. */
  get entries(): Entry[] {
    return [...this.#entries.values()]
  }

  get(name: string): Entry | undefined {
    return this.#entries.get(name)
  }

  /** The name→vector map the evaluator reads. */
  env(): Map<string, PhaseVector> {
    const env = new Map<string, PhaseVector>()
    for (const entry of this.#entries.values()) env.set(entry.name, entry.vector)
    return env
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Encode `label` and add it to the shelf under the same name. */
  addAtom(label: string): Entry {
    const name = label.trim()
    if (!IDENT.test(name)) {
      throw new ExprError(
        `"${name}" is not a valid name — letters, digits, and _ only, not starting with a digit`,
      )
    }
    if (RESERVED.has(name)) {
      throw new ExprError(`"${name}" is a reserved function name`)
    }
    if (this.#entries.has(name)) {
      throw new ExprError(`"${name}" already exists`)
    }

    const entry: Entry = {
      name,
      kind: 'atom',
      source: name,
      vector: encodeAtom(name, this.#dim),
      color: this.#nextColor(),
    }
    this.#entries.set(name, entry)
    this.#emit()
    return entry
  }

  /** Evaluate `expression` and store the vector it produces under `name`. */
  addDerived(name: string, expression: string): Entry {
    if (!IDENT.test(name)) throw new ExprError(`"${name}" is not a valid name`)
    if (RESERVED.has(name)) {
      throw new ExprError(`"${name}" is a reserved function name`)
    }
    if (this.#entries.has(name)) throw new ExprError(`"${name}" already exists`)

    const value = evaluate(expression, this.env())
    if (value.kind !== 'vector') {
      throw new ExprError(
        `"${expression}" produces a number, not a vector — nothing to store`,
      )
    }

    const entry: Entry = {
      name,
      kind: 'derived',
      source: expression,
      vector: value.vector,
      color: this.#nextColor(),
    }
    this.#entries.set(name, entry)
    this.#emit()
    return entry
  }

  /**
   * Run one line from the expression bar. `name = expr` stores under that
   * name; a bare expression gets the next automatic name (`r1`, `r2`, ...).
   */
  submit(line: string): Entry {
    const { name, expression } = splitAssignment(line)
    return this.addDerived(name ?? this.#nextResultName(), expression)
  }

  /** Evaluate a line that yields a number, storing nothing. */
  submitScalar(line: string): number {
    const { expression } = splitAssignment(line)
    const value = evaluate(expression, this.env())
    if (value.kind !== 'scalar') {
      throw new ExprError(`"${expression}" produces a vector, not a number`)
    }
    return value.value
  }

  /** Remove `name` and every entry whose expression depends on it. */
  remove(name: string): boolean {
    if (!this.#entries.has(name)) return false

    const doomed = new Set([name])
    let grew = true
    while (grew) {
      grew = false
      for (const entry of this.#entries.values()) {
        if (entry.kind !== 'derived' || doomed.has(entry.name)) continue
        if (identifiers(entry.source).some(dep => doomed.has(dep))) {
          doomed.add(entry.name)
          grew = true
        }
      }
    }

    for (const doomedName of doomed) this.#entries.delete(doomedName)
    this.#emit()
    return true
  }

  /** Re-encode every atom at `dim` and re-evaluate every derived entry. */
  setDim(dim: number): void {
    if (!(DIMS as readonly number[]).includes(dim)) {
      throw new ExprError(`unsupported dimension ${dim}`)
    }
    if (dim === this.#dim) return

    this.#dim = dim
    const rebuilt = new Map<string, Entry>()
    const env = new Map<string, PhaseVector>()

    for (const entry of this.#entries.values()) {
      const vector =
        entry.kind === 'atom'
          ? encodeAtom(entry.source, dim)
          : this.#reevaluate(entry, env)
      const next: Entry = { ...entry, vector }
      rebuilt.set(entry.name, next)
      env.set(entry.name, vector)
    }

    this.#entries = rebuilt
    this.#emit()
  }

  /** Drop everything, keeping the current dimension. */
  reset(): void {
    this.#entries.clear()
    this.#colorCursor = 0
    this.#resultCursor = 0
    this.#emit()
  }

  #reevaluate(entry: Entry, env: Map<string, PhaseVector>): PhaseVector {
    const value = evaluate(entry.source, env)
    if (value.kind !== 'vector') {
      throw new ExprError(`"${entry.source}" no longer produces a vector`)
    }
    return value.vector
  }

  #nextColor(): string {
    const color = PALETTE[this.#colorCursor % PALETTE.length]!
    this.#colorCursor++
    return color
  }

  #nextResultName(): string {
    for (;;) {
      this.#resultCursor++
      const name = `r${this.#resultCursor}`
      if (!this.#entries.has(name)) return name
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd web && npx vitest run test/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole web suite, typecheck, and commit**

```bash
cd web && npx vitest run && npx tsc --noEmit && cd ..
git add web/src/state.ts web/test/state.test.ts
git commit -m "feat(web): observable store for named vectors"
```

---

### Task 5: Canvas renderers

**Files:**
- Create: `web/src/viz/canvas.ts`, `web/src/viz/color.ts`, `web/src/viz/strip.ts`, `web/src/viz/dial.ts`, `web/src/viz/scatter.ts`, `web/src/viz/matrix.ts`, `web/src/viz/chart.ts`
- Create: `web/test/color.test.ts`
- Modify: `web/src/style.css` (canvas and panel styling)

**Interfaces:**
- Consumes: `PhaseVector`, `similarity` from `hrr-lib`; `Entry` from `web/src/state.ts`.
- Produces:
  - `fitCanvas(canvas: HTMLCanvasElement, cssHeight: number): CanvasRenderingContext2D`
  - `phaseToColor(phase: number): string`
  - `similarityToColor(s: number): string`
  - `magnitudeToColor(m: number, max: number): string`
  - `drawStrip(canvas: HTMLCanvasElement, v: PhaseVector): void`
  - `indexAtX(canvas: HTMLCanvasElement, length: number, clientX: number): number`
  - `drawDial(canvas: HTMLCanvasElement, v: PhaseVector, options?: { magnitude?: Float64Array }): void`
  - `drawScatter(canvas: HTMLCanvasElement, v: PhaseVector): void`
  - `drawMatrix(canvas: HTMLCanvasElement, entries: Entry[]): void`
  - `cellAt(canvas: HTMLCanvasElement, count: number, clientX: number, clientY: number): { row: number; col: number } | null`
  - `drawChart(canvas: HTMLCanvasElement, points: Array<{ x: number; y: number }>, options: { xLabel: string; yLabel: string; yMin: number; yMax: number }): void`

- [ ] **Step 1: Write the failing color tests**

Only the color math is pure enough to unit-test; the drawing code is verified by eye in Task 6. Create `web/test/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { magnitudeToColor, phaseToColor, similarityToColor } from '../src/viz/color.js'

describe('phaseToColor', () => {
  it('wraps: phase 0 and phase 2π are the same color', () => {
    expect(phaseToColor(0)).toBe(phaseToColor(2 * Math.PI))
  })

  it('separates opposite phases', () => {
    expect(phaseToColor(0)).not.toBe(phaseToColor(Math.PI))
  })

  it('returns a CSS color string', () => {
    expect(phaseToColor(1)).toMatch(/^hsl\(/)
  })
})

describe('similarityToColor', () => {
  it('is neutral at zero and saturated at the extremes', () => {
    expect(similarityToColor(0)).not.toBe(similarityToColor(1))
    expect(similarityToColor(1)).not.toBe(similarityToColor(-1))
  })

  it('clamps out-of-range input instead of producing nonsense', () => {
    expect(similarityToColor(5)).toBe(similarityToColor(1))
    expect(similarityToColor(-5)).toBe(similarityToColor(-1))
  })
})

describe('magnitudeToColor', () => {
  it('maps zero to black and the max to white', () => {
    expect(magnitudeToColor(0, 4)).toBe('rgb(0, 0, 0)')
    expect(magnitudeToColor(4, 4)).toBe('rgb(255, 255, 255)')
  })

  it('treats a zero max as fully dark rather than dividing by zero', () => {
    expect(magnitudeToColor(0, 0)).toBe('rgb(0, 0, 0)')
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd web && npx vitest run test/color.test.ts`
Expected: FAIL — cannot resolve `../src/viz/color.js`.

- [ ] **Step 3: Implement the color maps**

Create `web/src/viz/color.ts`:

```ts
const TWO_PI = 2 * Math.PI

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/**
 * Phase to a cyclic hue. Cyclic hue is the only honest mapping for an angle —
 * it wraps where the data wraps — but it is poor for colorblind viewers, so
 * every panel that uses it also prints numbers.
 */
export function phaseToColor(phase: number): string {
  const wrapped = ((phase % TWO_PI) + TWO_PI) % TWO_PI
  const hue = (wrapped / TWO_PI) * 360
  return `hsl(${hue.toFixed(1)}, 70%, 55%)`
}

/** Similarity to a diverging ramp: blue at -1, near-black at 0, red at +1. */
export function similarityToColor(s: number): string {
  const v = clamp(s, -1, 1)
  const strength = Math.abs(v)
  const hue = v >= 0 ? 12 : 220
  const lightness = 12 + strength * 48
  return `hsl(${hue}, ${(strength * 80).toFixed(1)}%, ${lightness.toFixed(1)}%)`
}

/** Consensus magnitude to grayscale, black at 0 and white at `max`. */
export function magnitudeToColor(m: number, max: number): string {
  const t = max <= 0 ? 0 : clamp(m / max, 0, 1)
  const level = Math.round(t * 255)
  return `rgb(${level}, ${level}, ${level})`
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd web && npx vitest run test/color.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Implement the canvas sizing helper**

Create `web/src/viz/canvas.ts`:

```ts
/**
 * Size a canvas to its CSS width and the given height, accounting for device
 * pixel ratio, then return a context scaled so drawing code can work in CSS
 * pixels. Also clears whatever was there.
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssHeight: number,
): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1
  const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 600

  canvas.width = Math.max(1, Math.round(cssWidth * ratio))
  canvas.height = Math.max(1, Math.round(cssHeight * ratio))
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('2D canvas context unavailable')

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  return ctx
}

/** The CSS-pixel width a `fitCanvas` context draws into. */
export const cssWidth = (canvas: HTMLCanvasElement): number =>
  canvas.clientWidth || canvas.parentElement?.clientWidth || 600
```

- [ ] **Step 6: Implement the strip**

Create `web/src/viz/strip.ts`:

```ts
import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const HEIGHT = 34

/** One column per component, colored by phase. */
export function drawStrip(canvas: HTMLCanvasElement, v: PhaseVector): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const step = width / v.length

  for (let i = 0; i < v.length; i++) {
    ctx.fillStyle = phaseToColor(v[i]!)
    // Overdraw by a fraction of a pixel so no seams show between columns.
    ctx.fillRect(i * step, 0, step + 0.5, HEIGHT)
  }
}

/** Which component sits under a pointer at `clientX`. */
export function indexAtX(
  canvas: HTMLCanvasElement,
  length: number,
  clientX: number,
): number {
  const rect = canvas.getBoundingClientRect()
  const t = (clientX - rect.left) / rect.width
  const index = Math.floor(t * length)
  return index < 0 ? 0 : index >= length ? length - 1 : index
}
```

- [ ] **Step 7: Implement the dial**

Create `web/src/viz/dial.ts`:

```ts
import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const SIZE = 220
const MAX_ARROWS = 256

/**
 * Components as unit phasors on a circle, with the resultant mean overlaid.
 * A uniform ring means an unstructured vector; a clump means agreement.
 * Given a magnitude array, an inner ring shows mean consensus strength.
 */
export function drawDial(
  canvas: HTMLCanvasElement,
  v: PhaseVector,
  options?: { magnitude?: Float64Array },
): void {
  const ctx = fitCanvas(canvas, SIZE)
  const width = cssWidth(canvas)
  const cx = width / 2
  const cy = SIZE / 2
  const radius = Math.min(cx, cy) - 12

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  const stride = Math.max(1, Math.ceil(v.length / MAX_ARROWS))
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5

  let sumCos = 0
  let sumSin = 0
  for (let i = 0; i < v.length; i++) {
    const phase = v[i]!
    sumCos += Math.cos(phase)
    sumSin += Math.sin(phase)
    if (i % stride !== 0) continue

    ctx.strokeStyle = phaseToColor(phase)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(phase) * radius, cy - Math.sin(phase) * radius)
    ctx.stroke()
  }

  ctx.globalAlpha = 1

  // The resultant: long when phases agree, near zero when they cancel.
  const meanCos = sumCos / v.length
  const meanSin = sumSin / v.length
  const resultant = Math.hypot(meanCos, meanSin)
  const angle = Math.atan2(meanSin, meanCos)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(
    cx + Math.cos(angle) * radius * resultant,
    cy - Math.sin(angle) * radius * resultant,
  )
  ctx.stroke()

  if (options?.magnitude !== undefined) {
    const mags = options.magnitude
    let total = 0
    let peak = 0
    for (let i = 0; i < mags.length; i++) {
      total += mags[i]!
      if (mags[i]! > peak) peak = mags[i]!
    }
    const mean = mags.length === 0 ? 0 : total / mags.length
    const ratio = peak === 0 ? 0 : mean / peak

    ctx.strokeStyle = '#9ece6a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(`resultant ${resultant.toFixed(3)}`, 8, SIZE - 8)
}
```

- [ ] **Step 8: Implement the scatter**

Create `web/src/viz/scatter.ts`:

```ts
import type { PhaseVector } from 'hrr-lib'
import { cssWidth, fitCanvas } from './canvas.js'
import { phaseToColor } from './color.js'

const HEIGHT = 160
const TWO_PI = 2 * Math.PI

/** Phase against index — precise where the strip is impressionistic. */
export function drawScatter(canvas: HTMLCanvasElement, v: PhaseVector): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const pad = 24
  const plotWidth = width - pad - 6
  const plotHeight = HEIGHT - pad - 6

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, 6)
  ctx.lineTo(pad, HEIGHT - pad)
  ctx.lineTo(width - 6, HEIGHT - pad)
  ctx.stroke()

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText('2π', 2, 14)
  ctx.fillText('0', 8, HEIGHT - pad)
  ctx.fillText(`index 0…${v.length - 1}`, pad + 4, HEIGHT - 6)

  for (let i = 0; i < v.length; i++) {
    const x = pad + (i / Math.max(1, v.length - 1)) * plotWidth
    const y = HEIGHT - pad - (v[i]! / TWO_PI) * plotHeight
    ctx.fillStyle = phaseToColor(v[i]!)
    ctx.fillRect(x, y, 1.5, 1.5)
  }
}
```

- [ ] **Step 9: Implement the similarity matrix**

Create `web/src/viz/matrix.ts`:

```ts
import { similarity } from 'hrr-lib'
import type { Entry } from '../state.js'
import { cssWidth, fitCanvas } from './canvas.js'
import { similarityToColor } from './color.js'

const LABEL = 84
const MAX_CELL = 46

/** Every pair's cosine similarity as a heatmap, with names down both edges. */
export function drawMatrix(canvas: HTMLCanvasElement, entries: Entry[]): void {
  const n = entries.length
  const width = cssWidth(canvas)
  const cell =
    n === 0 ? MAX_CELL : Math.min(MAX_CELL, Math.max(12, (width - LABEL) / n))
  const height = LABEL + cell * n
  const ctx = fitCanvas(canvas, Math.max(60, height))

  if (n === 0) {
    ctx.fillStyle = '#9aa3b2'
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Add some atoms to compare them.', 4, 24)
    return
  }

  const compatible = entries.every(e => e.vector.length === entries[0]!.vector.length)
  if (!compatible) {
    ctx.fillStyle = '#f7768e'
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Entries have mismatched dimensions.', 4, 24)
    return
  }

  ctx.font = '11px ui-monospace, monospace'

  for (let i = 0; i < n; i++) {
    const label = entries[i]!.name.slice(0, 11)

    ctx.fillStyle = entries[i]!.color
    ctx.textAlign = 'right'
    ctx.fillText(label, LABEL - 6, LABEL + i * cell + cell / 2 + 4)

    ctx.save()
    ctx.translate(LABEL + i * cell + cell / 2, LABEL - 6)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'left'
    ctx.fillText(label, 0, 4)
    ctx.restore()
  }

  ctx.textAlign = 'left'

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const s = similarity(entries[row]!.vector, entries[col]!.vector)
      ctx.fillStyle = similarityToColor(s)
      ctx.fillRect(LABEL + col * cell, LABEL + row * cell, cell - 1, cell - 1)

      if (cell >= 34) {
        ctx.fillStyle = Math.abs(s) > 0.55 ? '#0f1115' : '#e6e9ef'
        ctx.fillText(
          s.toFixed(2),
          LABEL + col * cell + 4,
          LABEL + row * cell + cell / 2 + 4,
        )
      }
    }
  }
}

/** Which cell a pointer is over, or null outside the grid. */
export function cellAt(
  canvas: HTMLCanvasElement,
  count: number,
  clientX: number,
  clientY: number,
): { row: number; col: number } | null {
  if (count === 0) return null
  const rect = canvas.getBoundingClientRect()
  const cell = Math.min(MAX_CELL, Math.max(12, (rect.width - LABEL) / count))
  const col = Math.floor((clientX - rect.left - LABEL) / cell)
  const row = Math.floor((clientY - rect.top - LABEL) / cell)
  if (row < 0 || col < 0 || row >= count || col >= count) return null
  return { row, col }
}
```

- [ ] **Step 10: Implement the line chart**

Create `web/src/viz/chart.ts`:

```ts
import { cssWidth, fitCanvas } from './canvas.js'

const HEIGHT = 180

/** A plain line chart with labelled axes, for the memory capacity sweep. */
export function drawChart(
  canvas: HTMLCanvasElement,
  points: Array<{ x: number; y: number }>,
  options: { xLabel: string; yLabel: string; yMin: number; yMax: number },
): void {
  const ctx = fitCanvas(canvas, HEIGHT)
  const width = cssWidth(canvas)
  const padLeft = 42
  const padBottom = 28
  const plotWidth = width - padLeft - 10
  const plotHeight = HEIGHT - padBottom - 12

  ctx.strokeStyle = '#2a2f3a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padLeft, 12)
  ctx.lineTo(padLeft, HEIGHT - padBottom)
  ctx.lineTo(width - 10, HEIGHT - padBottom)
  ctx.stroke()

  ctx.fillStyle = '#9aa3b2'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText(options.yMax.toFixed(2), 4, 16)
  ctx.fillText(options.yMin.toFixed(2), 4, HEIGHT - padBottom)
  ctx.fillText(options.xLabel, width / 2 - 30, HEIGHT - 8)
  ctx.save()
  ctx.translate(12, HEIGHT / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(options.yLabel, -22, 0)
  ctx.restore()

  if (points.length === 0) return

  const xs = points.map(p => p.x)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xSpan = xMax - xMin || 1
  const ySpan = options.yMax - options.yMin || 1

  const px = (x: number) => padLeft + ((x - xMin) / xSpan) * plotWidth
  const py = (y: number) =>
    HEIGHT - padBottom - ((y - options.yMin) / ySpan) * plotHeight

  ctx.strokeStyle = '#7aa2f7'
  ctx.lineWidth = 2
  ctx.beginPath()
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(px(p.x), py(p.y))
    else ctx.lineTo(px(p.x), py(p.y))
  })
  ctx.stroke()

  ctx.fillStyle = '#7aa2f7'
  for (const p of points) ctx.fillRect(px(p.x) - 1.5, py(p.y) - 1.5, 3, 3)
}
```

- [ ] **Step 11: Add the shared panel styles**

Append to `web/src/style.css`:

```css
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1rem 1.1rem 1.2rem;
}

.panel > h2 {
  margin: 0 0 0.15rem;
  font-size: 1rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.panel > .hint {
  margin: 0 0 0.9rem;
  color: var(--ink-dim);
  font-size: 0.85rem;
}

canvas {
  display: block;
  width: 100%;
  border-radius: 4px;
}

input,
select,
button {
  font: inherit;
  color: var(--ink);
  background: #0d1017;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

button {
  cursor: pointer;
}

button:hover {
  border-color: var(--accent);
}

.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.error {
  color: var(--bad);
  font-size: 0.85rem;
  min-height: 1.2em;
  margin: 0.4rem 0 0;
}

.readout {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: var(--ink-dim);
  min-height: 1.2em;
}
```

- [ ] **Step 12: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && npx vitest run && cd ..
git add web/src/viz web/test/color.test.ts web/src/style.css
git commit -m "feat(web): canvas renderers for strips, dials, scatters, matrices, charts"
```

---

### Task 6: Shelf and workbench panels

**Files:**
- Create: `web/src/panels/shelf.ts`, `web/src/panels/workbench.ts`
- Modify: `web/src/main.ts` (replace the smoke-test body with the real layout), `web/src/style.css` (shelf and workbench styles)

**Interfaces:**
- Consumes: `Store`, `Entry`, `DIMS` from `web/src/state.ts`; `ExprError` from `web/src/expr.ts`; every renderer from Task 5.
- Produces: `mountShelf(root: HTMLElement, store: Store): void`, `mountWorkbench(root: HTMLElement, store: Store): void`.

- [ ] **Step 1: Implement the shelf**

Create `web/src/panels/shelf.ts`:

```ts
import { DIMS, Store } from '../state.js'

/**
 * Atom management: type a label, get a deterministic vector. Also owns the
 * dimension selector, since changing it re-encodes everything on the shelf.
 */
export function mountShelf(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Atoms</h2>
    <p class="hint">
      Every label hashes to a fixed phase vector. Unrelated labels come out
      near-orthogonal — similarity close to zero.
    </p>
    <form class="row" id="atom-form">
      <input id="atom-label" placeholder="label, e.g. dog" autocomplete="off" size="18" />
      <button type="submit">Add atom</button>
      <label for="dim-select">dim</label>
      <select id="dim-select"></select>
      <button type="button" id="reset">Clear all</button>
    </form>
    <p class="error" id="atom-error"></p>
    <div class="chips" id="chips"></div>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#atom-form')!
  const input = panel.querySelector<HTMLInputElement>('#atom-label')!
  const select = panel.querySelector<HTMLSelectElement>('#dim-select')!
  const reset = panel.querySelector<HTMLButtonElement>('#reset')!
  const error = panel.querySelector<HTMLParagraphElement>('#atom-error')!
  const chips = panel.querySelector<HTMLDivElement>('#chips')!

  for (const dim of DIMS) {
    const option = document.createElement('option')
    option.value = String(dim)
    option.textContent = String(dim)
    select.append(option)
  }
  select.value = String(store.dim)

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    try {
      store.addAtom(input.value)
      input.value = ''
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
    }
  })

  select.addEventListener('change', () => {
    error.textContent = ''
    try {
      store.setDim(Number(select.value))
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
      select.value = String(store.dim)
    }
  })

  reset.addEventListener('click', () => {
    store.reset()
    error.textContent = ''
  })

  const render = (): void => {
    select.value = String(store.dim)
    chips.replaceChildren()

    for (const entry of store.entries) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.style.borderColor = entry.color

      const dot = document.createElement('i')
      dot.style.background = entry.color
      chip.append(dot, document.createTextNode(entry.name))

      if (entry.kind === 'derived') {
        const source = document.createElement('em')
        source.textContent = entry.source
        chip.append(source)
      }

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.title = `remove ${entry.name} and anything derived from it`
      remove.addEventListener('click', () => {
        store.remove(entry.name)
      })
      chip.append(remove)

      chips.append(chip)
    }
  }

  store.subscribe(render)
  render()
}
```

- [ ] **Step 2: Implement the workbench**

Create `web/src/panels/workbench.ts`:

```ts
import type { Entry, Store } from '../state.js'
import { drawDial } from '../viz/dial.js'
import { drawScatter } from '../viz/scatter.js'
import { drawStrip, indexAtX } from '../viz/strip.js'

const EXAMPLES = [
  'pet = bind(dog, role)',
  'back = unbind(pet, role)',
  'blend = bundle(dog, cat)',
  'shifted = permute(dog, 1)',
  'similarity(back, dog)',
]

/**
 * The expression bar and one row per named vector. A row shows the strip; the
 * row expands to a dial and a scatter when clicked.
 */
export function mountWorkbench(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Workbench</h2>
    <p class="hint">
      Combine named vectors: <code>bind</code>, <code>unbind</code>,
      <code>bundle</code>, <code>permute</code>, <code>similarity</code>.
      Write <code>name = expression</code> to keep the result.
    </p>
    <form class="row" id="expr-form">
      <input id="expr-input" placeholder="pet = bind(dog, role)" autocomplete="off" />
      <button type="submit">Run</button>
    </form>
    <p class="error" id="expr-error"></p>
    <p class="readout" id="expr-result"></p>
    <div class="row examples" id="examples"></div>
    <div id="rows"></div>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#expr-form')!
  const input = panel.querySelector<HTMLInputElement>('#expr-input')!
  const error = panel.querySelector<HTMLParagraphElement>('#expr-error')!
  const result = panel.querySelector<HTMLParagraphElement>('#expr-result')!
  const examples = panel.querySelector<HTMLDivElement>('#examples')!
  const rows = panel.querySelector<HTMLDivElement>('#rows')!

  for (const example of EXAMPLES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'example'
    button.textContent = example
    button.addEventListener('click', () => {
      input.value = example
      input.focus()
    })
    examples.append(button)
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    result.textContent = ''

    const line = input.value.trim()
    if (line === '') return

    try {
      // A bare similarity call yields a number; anything else yields a vector.
      try {
        const scalar = store.submitScalar(line)
        result.textContent = `= ${scalar.toFixed(6)}`
      } catch {
        const entry = store.submit(line)
        result.textContent = `stored ${entry.name}`
      }
      input.value = ''
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e)
    }
  })

  const expanded = new Set<string>()

  const buildRow = (entry: Entry): HTMLElement => {
    const row = document.createElement('article')
    row.className = 'vrow'

    const head = document.createElement('div')
    head.className = 'vrow-head'
    head.innerHTML = `
      <button type="button" class="vrow-toggle"></button>
      <span class="vrow-readout"></span>
    `
    const toggle = head.querySelector<HTMLButtonElement>('.vrow-toggle')!
    const readout = head.querySelector<HTMLSpanElement>('.vrow-readout')!
    toggle.style.color = entry.color
    toggle.textContent =
      entry.kind === 'atom' ? entry.name : `${entry.name} = ${entry.source}`

    const strip = document.createElement('canvas')
    strip.className = 'strip'

    const detail = document.createElement('div')
    detail.className = 'vrow-detail'

    const dial = document.createElement('canvas')
    const scatter = document.createElement('canvas')
    detail.append(dial, scatter)

    row.append(head, strip, detail)

    const isOpen = expanded.has(entry.name)
    detail.hidden = !isOpen

    toggle.addEventListener('click', () => {
      if (expanded.has(entry.name)) expanded.delete(entry.name)
      else expanded.add(entry.name)
      detail.hidden = !expanded.has(entry.name)
      if (!detail.hidden) {
        drawDial(dial, entry.vector)
        drawScatter(scatter, entry.vector)
      }
    })

    strip.addEventListener('mousemove', event => {
      const i = indexAtX(strip, entry.vector.length, event.clientX)
      readout.textContent = `[${i}] ${entry.vector[i]!.toFixed(4)} rad`
    })
    strip.addEventListener('mouseleave', () => {
      readout.textContent = `dim ${entry.vector.length}`
    })
    readout.textContent = `dim ${entry.vector.length}`

    // Canvases must be in the document before they report a width.
    queueMicrotask(() => {
      drawStrip(strip, entry.vector)
      if (isOpen) {
        drawDial(dial, entry.vector)
        drawScatter(scatter, entry.vector)
      }
    })

    return row
  }

  const render = (): void => {
    rows.replaceChildren()
    if (store.entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'Add an atom above to get started.'
      rows.append(empty)
      return
    }
    for (const entry of store.entries) rows.append(buildRow(entry))
  }

  store.subscribe(render)
  render()

  window.addEventListener('resize', render)
}
```

- [ ] **Step 3: Wire the panels into the page**

Replace the whole body of `web/src/main.ts`:

```ts
import './style.css'
import { mountShelf } from './panels/shelf.js'
import { mountWorkbench } from './panels/workbench.js'
import { Store } from './state.js'

const app = document.querySelector<HTMLElement>('#app')
if (app === null) throw new Error('#app is missing from index.html')

const store = new Store()

mountShelf(app, store)
mountWorkbench(app, store)

// A starting point that already shows the interesting behaviour.
store.addAtom('dog')
store.addAtom('cat')
store.addAtom('role')
```

- [ ] **Step 4: Add the shelf and workbench styles**

Append to `web/src/style.css`:

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.9rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.2rem 0.35rem 0.2rem 0.6rem;
  font-size: 0.85rem;
}

.chip i {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
}

.chip em {
  color: var(--ink-dim);
  font-style: normal;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
}

.chip button {
  border: 0;
  background: transparent;
  padding: 0 0.2rem;
  color: var(--ink-dim);
}

.chip button:hover {
  color: var(--bad);
}

#expr-input {
  flex: 1 1 22rem;
  font-family: ui-monospace, monospace;
}

.examples {
  margin: 0.5rem 0 1rem;
}

.example {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  padding: 0.2rem 0.45rem;
  color: var(--ink-dim);
}

.vrow {
  border-top: 1px solid var(--line);
  padding: 0.7rem 0;
}

.vrow-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.35rem;
}

.vrow-toggle {
  border: 0;
  background: transparent;
  padding: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  text-align: left;
}

.vrow-readout {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--ink-dim);
  white-space: nowrap;
}

.vrow-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 1rem;
  margin-top: 0.6rem;
}

@media (max-width: 40rem) {
  .vrow-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Re-run the web suite**

`web/test/smoke.test.ts` keeps earning its place — it proves the alias still resolves after `main.ts` was rewritten.

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Look at it**

Run: `cd web && npm run dev`
Open the printed URL. Verify by eye:
- Three chips appear: dog, cat, role.
- Three strips render as colored bands, each different.
- Hovering a strip prints an index and a phase.
- Clicking a row's name opens a dial and a scatter.
- Running `pet = bind(dog, role)` adds a row.
- Running `similarity(unbind(pet, role), dog)` prints a number very close to 1.
- Running `bind(dog, ferret)` prints `unknown name "ferret"` in red and stores nothing.
- Switching dim to 64 redraws every strip coarser and keeps `pet` consistent.
- Removing `dog` also removes `pet`.

Stop the server with Ctrl-C.

- [ ] **Step 7: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && cd ..
git add web/src
git commit -m "feat(web): atom shelf and expression workbench"
```

---

### Task 7: Similarity matrix panel

**Files:**
- Create: `web/src/panels/matrix.ts`
- Modify: `web/src/main.ts` (mount it)

**Interfaces:**
- Consumes: `drawMatrix`, `cellAt` from `web/src/viz/matrix.ts`; `Store` from `web/src/state.ts`; `similarity` from `hrr-lib`.
- Produces: `mountMatrix(root: HTMLElement, store: Store): void`.

- [ ] **Step 1: Implement the panel**

Create `web/src/panels/matrix.ts`:

```ts
import { similarity } from 'hrr-lib'
import type { Store } from '../state.js'
import { cellAt, drawMatrix } from '../viz/matrix.js'

/**
 * Every named vector against every other. The diagonal is 1 by definition;
 * everything else being near zero is the whole point of the representation.
 */
export function mountMatrix(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Similarity</h2>
    <p class="hint">
      Cosine similarity between every pair. Red is alike, blue is opposed, dark
      is unrelated — the near-black field off the diagonal is what makes
      superposition possible.
    </p>
    <canvas id="matrix"></canvas>
    <p class="readout" id="matrix-readout"></p>
  `
  root.append(panel)

  const canvas = panel.querySelector<HTMLCanvasElement>('#matrix')!
  const readout = panel.querySelector<HTMLParagraphElement>('#matrix-readout')!

  canvas.addEventListener('mousemove', event => {
    const entries = store.entries
    const cell = cellAt(canvas, entries.length, event.clientX, event.clientY)
    if (cell === null) {
      readout.textContent = ''
      return
    }
    const a = entries[cell.row]!
    const b = entries[cell.col]!
    readout.textContent = `similarity(${a.name}, ${b.name}) = ${similarity(
      a.vector,
      b.vector,
    ).toFixed(6)}`
  })

  canvas.addEventListener('mouseleave', () => {
    readout.textContent = ''
  })

  const render = (): void => {
    queueMicrotask(() => {
      drawMatrix(canvas, store.entries)
    })
  }

  store.subscribe(render)
  window.addEventListener('resize', render)
  render()
}
```

- [ ] **Step 2: Mount it**

In `web/src/main.ts`, add the import and the mount call, keeping the seed atoms last:

```ts
import { mountMatrix } from './panels/matrix.js'
```

```ts
mountShelf(app, store)
mountWorkbench(app, store)
mountMatrix(app, store)
```

- [ ] **Step 3: Look at it**

Run: `cd web && npm run dev`
Verify by eye:
- The diagonal is the brightest red; off-diagonal cells are near-black.
- After `pet = bind(dog, role)`, `pet` is unlike both `dog` and `role` — binding hides its operands.
- After `blend = bundle(dog, cat)`, `blend` is clearly similar to both — bundling keeps them.
- Hovering a cell prints the exact number.

Stop the server.

- [ ] **Step 4: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && npx vitest run && cd ..
git add web/src
git commit -m "feat(web): live similarity matrix panel"
```

---

### Task 8: Holographic memory panel

**Files:**
- Create: `web/src/panels/memory.ts`
- Modify: `web/src/main.ts` (mount it)

**Interfaces:**
- Consumes: `HolographicMemory`, `encodeAtom`, `similarity` from `hrr-lib`; `drawChart` from `web/src/viz/chart.ts`; `Store` from `web/src/state.ts`.
- Produces: `mountMemory(root: HTMLElement, store: Store): void`.

- [ ] **Step 1: Implement the panel**

Create `web/src/panels/memory.ts`:

```ts
import { HolographicMemory } from 'hrr-lib'
import type { Store } from '../state.js'
import { drawChart } from '../viz/chart.js'

const SEED: Array<[string, string]> = [
  ['capital-of-france', 'paris'],
  ['capital-of-japan', 'tokyo'],
  ['capital-of-peru', 'lima'],
]

/**
 * One superposed trace holding every key→value binding, plus a sweep showing
 * how confidence decays as the trace fills up. The decay, not the lookup, is
 * the interesting part: the memory degrades gradually rather than failing.
 */
export function mountMemory(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Holographic memory</h2>
    <p class="hint">
      Every fact is bound and summed into a single vector. Probing unbinds the
      key and cleans up against the known values — confidence falls as the
      trace crowds.
    </p>
    <form class="row" id="store-form">
      <input id="mem-key" placeholder="key" autocomplete="off" size="16" />
      <input id="mem-value" placeholder="value" autocomplete="off" size="16" />
      <button type="submit">Store</button>
    </form>
    <p class="error" id="mem-error"></p>
    <table class="facts"><tbody id="facts"></tbody></table>
    <form class="row" id="probe-form">
      <input id="probe-key" placeholder="probe a key" autocomplete="off" size="16" />
      <button type="submit">Probe</button>
    </form>
    <p class="readout" id="probe-readout"></p>
    <div class="confidence"><span id="confidence-bar"></span></div>
    <h3 class="subhead">Capacity</h3>
    <p class="hint">
      Mean probe confidence over a fresh memory holding N synthetic facts, at
      the current dimension.
    </p>
    <canvas id="capacity"></canvas>
  `
  root.append(panel)

  const storeForm = panel.querySelector<HTMLFormElement>('#store-form')!
  const keyInput = panel.querySelector<HTMLInputElement>('#mem-key')!
  const valueInput = panel.querySelector<HTMLInputElement>('#mem-value')!
  const error = panel.querySelector<HTMLParagraphElement>('#mem-error')!
  const facts = panel.querySelector<HTMLTableSectionElement>('#facts')!
  const probeForm = panel.querySelector<HTMLFormElement>('#probe-form')!
  const probeInput = panel.querySelector<HTMLInputElement>('#probe-key')!
  const probeReadout = panel.querySelector<HTMLParagraphElement>('#probe-readout')!
  const bar = panel.querySelector<HTMLSpanElement>('#confidence-bar')!
  const capacity = panel.querySelector<HTMLCanvasElement>('#capacity')!

  let memory = new HolographicMemory(store.dim)
  for (const [key, value] of SEED) memory.store(key, value)

  const renderFacts = (): void => {
    facts.replaceChildren()
    for (const key of [...memory.keys()]) {
      const row = document.createElement('tr')

      const keyCell = document.createElement('td')
      keyCell.textContent = key

      const probeCell = document.createElement('td')
      const probed = memory.probe(key)
      probeCell.textContent = probed === null ? '—' : probed.value

      const confCell = document.createElement('td')
      confCell.textContent = probed === null ? '—' : probed.confidence.toFixed(4)

      const actionCell = document.createElement('td')
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        memory.delete(key)
        renderFacts()
      })
      actionCell.append(remove)

      row.append(keyCell, probeCell, confCell, actionCell)
      facts.append(row)
    }
  }

  const renderCapacity = (): void => {
    const points: Array<{ x: number; y: number }> = []
    const step = Math.max(1, Math.round(store.dim / 32))

    for (let n = step; n <= store.dim; n += step) {
      const sweep = new HolographicMemory(store.dim)
      for (let i = 0; i < n; i++) sweep.store(`k${i}`, `v${i}`)

      let total = 0
      for (let i = 0; i < n; i++) {
        total += sweep.probe(`k${i}`)?.confidence ?? 0
      }
      points.push({ x: n, y: total / n })
    }

    queueMicrotask(() => {
      drawChart(capacity, points, {
        xLabel: 'facts stored',
        yLabel: 'mean confidence',
        yMin: 0,
        yMax: 1,
      })
    })
  }

  storeForm.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    const key = keyInput.value.trim()
    const value = valueInput.value.trim()
    if (key === '' || value === '') {
      error.textContent = 'both a key and a value are required'
      return
    }
    memory.store(key, value)
    keyInput.value = ''
    valueInput.value = ''
    renderFacts()
  })

  probeForm.addEventListener('submit', event => {
    event.preventDefault()
    const key = probeInput.value.trim()
    if (key === '') return

    const result = memory.probe(key)
    if (result === null) {
      probeReadout.textContent = 'the memory is empty'
      bar.style.width = '0%'
      return
    }
    probeReadout.textContent = `${key} → ${result.value} (confidence ${result.confidence.toFixed(4)})`
    bar.style.width = `${Math.max(0, Math.min(1, result.confidence)) * 100}%`
    // An unstored key still returns the nearest value — degradation, not error.
    bar.style.background = result.confidence > 0.3 ? 'var(--accent)' : 'var(--bad)'
  })

  const onDimChange = (): void => {
    const rebuilt = new HolographicMemory(store.dim)
    for (const key of [...memory.keys()]) {
      const probed = memory.probe(key)
      if (probed !== null) rebuilt.store(key, probed.value)
    }
    memory = rebuilt
    renderFacts()
    renderCapacity()
  }

  let lastDim = store.dim
  store.subscribe(() => {
    if (store.dim === lastDim) return
    lastDim = store.dim
    onDimChange()
  })

  window.addEventListener('resize', renderCapacity)
  renderFacts()
  renderCapacity()
}
```

- [ ] **Step 2: Mount it**

In `web/src/main.ts`:

```ts
import { mountMemory } from './panels/memory.js'
```

```ts
mountMemory(app, store)
```

placed after `mountMatrix(app, store)`.

- [ ] **Step 3: Add the styles**

Append to `web/src/style.css`:

```css
.subhead {
  margin: 1.4rem 0 0.15rem;
  font-size: 0.9rem;
  color: var(--ink-dim);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.facts {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  margin: 0.6rem 0;
}

.facts td {
  border-bottom: 1px solid var(--line);
  padding: 0.25rem 0.4rem;
}

.facts td:last-child {
  width: 1.8rem;
  text-align: right;
}

.facts button {
  border: 0;
  background: transparent;
  color: var(--ink-dim);
  padding: 0 0.2rem;
}

.facts button:hover {
  color: var(--bad);
}

.confidence {
  height: 6px;
  background: #0d1017;
  border: 1px solid var(--line);
  border-radius: 999px;
  overflow: hidden;
  margin: 0.35rem 0 0.2rem;
}

.confidence span {
  display: block;
  height: 100%;
  width: 0;
  background: var(--accent);
  transition: width 120ms ease-out;
}
```

- [ ] **Step 4: Look at it**

Run: `cd web && npm run dev`
Verify by eye:
- Three seeded facts appear, each probing back to its own value with confidence well above 0.5.
- Storing a new fact adds a row and slightly lowers the others' confidence.
- Probing an unstored key still returns a value, with visibly low confidence and a red bar — graceful degradation.
- The capacity chart falls from near 1 toward 0 as facts accumulate.
- Switching dim to 64 makes the curve collapse much sooner; 1024 holds up far longer.

Stop the server.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && npx vitest run && cd ..
git add web/src
git commit -m "feat(web): holographic memory panel with capacity sweep"
```

---

### Task 9: Superposition panel

**Files:**
- Create: `web/src/panels/superposition.ts`
- Modify: `web/src/main.ts` (mount it), `web/src/style.css`

**Interfaces:**
- Consumes: `Superposition` from `hrr-lib`; `drawStrip` from `web/src/viz/strip.ts`; `drawDial` from `web/src/viz/dial.ts`; `magnitudeToColor` from `web/src/viz/color.ts`; `Store` from `web/src/state.ts`.
- Produces: `mountSuperposition(root: HTMLElement, store: Store): void`.

- [ ] **Step 1: Implement the panel**

Create `web/src/panels/superposition.ts`:

```ts
import { Superposition } from 'hrr-lib'
import type { Store } from '../state.js'
import { fitCanvas, cssWidth } from '../viz/canvas.js'
import { magnitudeToColor } from '../viz/color.js'
import { drawDial } from '../viz/dial.js'
import { drawStrip } from '../viz/strip.js'

interface Contribution {
  name: string
  weight: number
}

/**
 * The accumulator behind bundle, kept unreduced. Reducing to phases throws
 * away how strongly the members agreed; the magnitude strip is that discarded
 * information, and it is where cancellation becomes visible.
 */
export function mountSuperposition(root: HTMLElement, store: Store): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.innerHTML = `
    <h2>Superposition</h2>
    <p class="hint">
      Add vectors with weights. The top strip is the reduced result; the
      grayscale strip below is per-component consensus — bright where the
      members agree, dark where they cancel.
    </p>
    <form class="row" id="sup-form">
      <select id="sup-name"></select>
      <label for="sup-weight">weight</label>
      <input id="sup-weight" type="number" step="0.1" value="1" size="5" />
      <button type="submit">Add</button>
    </form>
    <p class="error" id="sup-error"></p>
    <ul class="contributions" id="contributions"></ul>
    <canvas id="sup-strip"></canvas>
    <p class="readout">reduced phases</p>
    <canvas id="sup-magnitude"></canvas>
    <p class="readout" id="sup-readout">consensus magnitude</p>
    <canvas id="sup-dial"></canvas>
  `
  root.append(panel)

  const form = panel.querySelector<HTMLFormElement>('#sup-form')!
  const select = panel.querySelector<HTMLSelectElement>('#sup-name')!
  const weightInput = panel.querySelector<HTMLInputElement>('#sup-weight')!
  const error = panel.querySelector<HTMLParagraphElement>('#sup-error')!
  const list = panel.querySelector<HTMLUListElement>('#contributions')!
  const strip = panel.querySelector<HTMLCanvasElement>('#sup-strip')!
  const magnitudeCanvas = panel.querySelector<HTMLCanvasElement>('#sup-magnitude')!
  const readout = panel.querySelector<HTMLParagraphElement>('#sup-readout')!
  const dial = panel.querySelector<HTMLCanvasElement>('#sup-dial')!

  let contributions: Contribution[] = []

  const drawMagnitude = (magnitude: Float64Array): void => {
    const ctx = fitCanvas(magnitudeCanvas, 22)
    const width = cssWidth(magnitudeCanvas)
    let peak = 0
    for (let i = 0; i < magnitude.length; i++) {
      if (magnitude[i]! > peak) peak = magnitude[i]!
    }
    const step = width / magnitude.length
    for (let i = 0; i < magnitude.length; i++) {
      ctx.fillStyle = magnitudeToColor(magnitude[i]!, peak)
      ctx.fillRect(i * step, 0, step + 0.5, 22)
    }
    readout.textContent = `consensus magnitude — peak ${peak.toFixed(3)}, total weight ${contributions
      .reduce((sum, c) => sum + Math.abs(c.weight), 0)
      .toFixed(2)}`
  }

  const render = (): void => {
    select.replaceChildren()
    for (const entry of store.entries) {
      const option = document.createElement('option')
      option.value = entry.name
      option.textContent = entry.name
      select.append(option)
    }

    list.replaceChildren()
    for (const [index, contribution] of contributions.entries()) {
      const item = document.createElement('li')
      item.textContent = `${contribution.name} × ${contribution.weight}`
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        contributions.splice(index, 1)
        render()
      })
      item.append(remove)
      list.append(item)
    }

    const accumulator = new Superposition(store.dim)
    let added = 0
    for (const contribution of contributions) {
      const entry = store.get(contribution.name)
      if (entry === undefined) continue
      accumulator.add(entry.vector, contribution.weight)
      added++
    }

    // Drop contributions whose vector has since been removed from the shelf.
    contributions = contributions.filter(c => store.get(c.name) !== undefined)

    queueMicrotask(() => {
      const reduced = accumulator.toVector()
      drawStrip(strip, reduced)
      drawMagnitude(accumulator.magnitude)
      drawDial(dial, reduced, { magnitude: accumulator.magnitude })
      if (added === 0) readout.textContent = 'add a vector to see consensus'
    })
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    const name = select.value
    const weight = Number(weightInput.value)
    if (name === '' || !Number.isFinite(weight)) {
      error.textContent = 'pick a vector and a finite weight'
      return
    }
    contributions.push({ name, weight })
    render()
  })

  store.subscribe(render)
  window.addEventListener('resize', render)
  render()
}
```

- [ ] **Step 2: Mount it**

In `web/src/main.ts`:

```ts
import { mountSuperposition } from './panels/superposition.js'
```

```ts
mountSuperposition(app, store)
```

placed after `mountMemory(app, store)`.

- [ ] **Step 3: Add the styles**

Append to `web/src/style.css`:

```css
.contributions {
  list-style: none;
  margin: 0.6rem 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}

.contributions li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.15rem 0.2rem 0.15rem 0.5rem;
}

.contributions button {
  border: 0;
  background: transparent;
  color: var(--ink-dim);
  padding: 0 0.2rem;
}

.contributions button:hover {
  color: var(--bad);
}
```

- [ ] **Step 4: Look at it**

Run: `cd web && npm run dev`
Verify by eye:
- Adding `dog` alone gives a uniformly bright magnitude strip — one member always agrees with itself.
- Adding `cat` as well darkens the strip in patches where their phases oppose.
- Adding `dog` again with weight `-1` cancels it back out: the result returns to `cat` alone.
- A large weight on one member pulls the reduced strip toward that member's pattern.

Stop the server.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && npx vitest run && cd ..
git add web/src
git commit -m "feat(web): superposition panel showing consensus and cancellation"
```

---

### Task 10: GitHub Pages deployment

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md` (link the live demo and document `web/`)

**Interfaces:**
- Consumes: the `web/` build from Task 2 and `web/package-lock.json`.
- Produces: a deployed site at `https://fingerskier.github.io/HRR.js/`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Pages

on:
  push:
    branches: [main]
    paths:
      - 'web/**'
      - 'src/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# One deploy at a time; queue the newest and let it finish.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm run typecheck
        working-directory: web
      - run: npm test
        working-directory: web
      - run: npm run build
        working-directory: web
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the built output locally before trusting CI**

Run: `cd web && npm ci && npm run build && npx vite preview`
Open the printed URL — `vite preview` serves under the `/HRR.js/` base, exactly as Pages will. Confirm the page loads with no 404s in the browser console.

Stop the server.

- [ ] **Step 3: Document the app in the README**

Add this section to `README.md`, immediately after the introductory paragraph:

```markdown
## Try it

An interactive workbench for these operations runs at
**<https://fingerskier.github.io/HRR.js/>** — add atoms, bind and bundle them,
and watch the phase vectors change.

To run it locally:

```bash
cd web
npm install
npm run dev
```

The app imports the library's TypeScript source directly, so edits to `src/`
appear in the browser immediately.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "ci: deploy the workbench to GitHub Pages"
```

- [ ] **Step 5: Enable Pages, then push**

The workflow cannot enable Pages itself. Before the first deploy, the
repository owner must open **Settings → Pages** and set **Source** to
**GitHub Actions**. Ask them to do so and confirm before pushing.

Then:

```bash
git push origin main
```

- [ ] **Step 6: Confirm the deploy**

Run: `gh run watch`
Expected: both the `Pages` and `CI` workflows succeed.

Then open `https://fingerskier.github.io/HRR.js/` and repeat the eye checks
from Tasks 6 through 9 against the live site. Confirm the browser console is
free of errors — in particular, nothing about a missing Node builtin.

- [ ] **Step 7: Final verification of the whole repository**

```bash
npm run typecheck && npm test && npm run build
cd web && npm run typecheck && npm test && npm run build && cd ..
grep -rn "node:" src/ dist/ || echo "no Node builtins in the library"
```

Expected: every command passes and the grep reports no Node builtins.

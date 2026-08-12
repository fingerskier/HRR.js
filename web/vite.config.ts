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

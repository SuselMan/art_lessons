import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Contract changes must be tested from this checkout, including worktrees
  // that reuse dependencies. An older shared/dist hides or invents failures.
  resolve: { alias: { '@grafetto/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)) } },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
})

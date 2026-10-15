import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['docs/qa/prototypes/mini-puddle/*.test.ts'], environment: 'node' } })

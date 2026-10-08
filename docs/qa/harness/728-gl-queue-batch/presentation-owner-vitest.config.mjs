import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['docs/qa/harness/728-gl-queue-batch/presentationOwnerPrototype.test.ts'], environment: 'node' } })

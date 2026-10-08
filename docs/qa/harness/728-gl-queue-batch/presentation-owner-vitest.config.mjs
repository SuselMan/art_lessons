import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['docs/qa/harness/728-gl-queue-batch/presentationOwnerPrototype.test.ts','docs/qa/harness/728-gl-queue-batch/ownedVisibleSourceSnapshot.test.ts'], environment: 'node' } })

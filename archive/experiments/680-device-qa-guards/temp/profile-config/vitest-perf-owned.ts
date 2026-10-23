import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { alias: {
    'lodash-es': '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/lodash-es/lodash.js',
    'nanoid': '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/nanoid/index.js',
    '@grafetto/shared': '/home/suselman/projects/pencil-agents/680-watercolor-profile/packages/shared/src/index.ts',
  } },
  test: { include: ['apps/**/*.test.ts'], environment: 'node' },
})

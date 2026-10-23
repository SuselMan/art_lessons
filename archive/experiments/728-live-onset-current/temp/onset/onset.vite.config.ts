import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'
import { fileURLToPath } from 'node:url'
export default defineConfig(async env => mergeConfig(await (typeof base === 'function' ? base(env) : base), {
  resolve: { alias: { '@grafetto/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
}))

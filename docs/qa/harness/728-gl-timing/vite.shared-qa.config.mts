import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import base from '../../../../apps/web/vite.config.ts'
import { sharedQaConfig } from './SharedQaConfig.mjs'
const sourceRoot=fileURLToPath(new URL('../../../../',import.meta.url))
export default defineConfig(async env => {
  if(typeof base!=='function')throw Error('Expected current product config factory')
  const isolated=sharedQaConfig({ ...env, sourceRoot, cacheRoot:process.env.QA_CACHE_ROOT, prebundle:process.env.QA_SHARED_PREBUNDLE })
  return mergeConfig(await base(env),isolated)
})

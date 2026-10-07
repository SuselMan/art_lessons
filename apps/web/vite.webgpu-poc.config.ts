import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
/** Standalone trusted-origin QA bundle, separate from production app / service worker. */
export default defineConfig({
  plugins: [react()], base: './',
  resolve: { alias: { '@grafetto/shared': resolve(import.meta.dirname, '../../packages/shared/src/index.ts') } },
  build: { outDir: '../../temp/webgpu-poc-dist', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, 'webgpu-poc.html') } },
})

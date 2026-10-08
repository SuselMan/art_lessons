import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

/** Isolated QA asset namespace. Production paper decoder and bytes unchanged. */
export default defineConfig({
 base: './',
 plugins: [react(), { name: 'canonical-scene-paper-namespace', enforce: 'pre', load(id) {
  if (!id.endsWith('/paperLoader.ts')) return
  const source = readFileSync(id, 'utf8')
  if (!source.includes("const PAPER_DIR = '/paper'")) throw new Error('Paper asset seam changed')
  return source.replace("const PAPER_DIR = '/paper'", "const PAPER_DIR = './paper'")
 } }],
 resolve: { alias: { '@grafetto/shared': resolve(import.meta.dirname, '../../packages/shared/src/index.ts') } },
 build: { outDir: '../../temp/webgpu-canonical-scene-dist', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, 'webgpu-canonical-scene.html') } },
})

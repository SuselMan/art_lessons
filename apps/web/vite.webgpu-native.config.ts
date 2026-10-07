import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ build: { outDir: '../../temp/webgpu-native-dist', emptyOutDir: true, rollupOptions: { input: resolve(__dirname, 'webgpu-native-stage.html') } } })

import {defineConfig} from 'vitest/config'
export default defineConfig({test:{include:['docs/qa/runs/747-large-pages-20261017/core-readback-candidate/*.test.ts'],maxWorkers:1}})

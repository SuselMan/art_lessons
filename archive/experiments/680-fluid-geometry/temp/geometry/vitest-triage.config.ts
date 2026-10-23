import {defineConfig} from 'vitest/config'
export default defineConfig({test:{include:['temp/geometry/canonical-mock-triage.test.ts'],environment:'node'}})

import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import base from '../../playwright.config'
export default defineConfig({ ...base, webServer: base.webServer.map(s => ({...s, cwd: process.cwd()})), testDir: resolve('temp/494-wash-settle'), testMatch: 'abStorage.spec.ts', globalTeardown: resolve('e2e/globalTeardown.ts'), timeout: 600000, outputDir: resolve('temp/494-wash-settle/traces') })

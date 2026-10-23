import { defineConfig } from '@playwright/test'
import base from '../../playwright.config'
export default defineConfig({ ...base, testDir: '.', globalTeardown: '../../e2e/globalTeardown.ts', outputDir: './results', webServer: (Array.isArray(base.webServer) ? base.webServer : [base.webServer!]).map(server => ({ ...server, cwd: '/home/suselman/projects/pencil-agents/logo-refresh' })) })

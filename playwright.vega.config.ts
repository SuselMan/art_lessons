import { defineConfig } from '@playwright/test'
import stock from './playwright.config'
export default defineConfig({ ...stock, globalSetup: './temp/stock-e2e/amd-preflight.ts', reporter: [['list'], ['./temp/stock-e2e/progress-reporter.ts']], outputDir: './temp/stock-e2e/results' })

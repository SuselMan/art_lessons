// Creates a fresh room on the wc stack and prints its id (for clean measurements).
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] })
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill(process.argv[2] || 'measure')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/, { timeout: 60000 })
console.log(page.url().split('/').pop())
await browser.close()

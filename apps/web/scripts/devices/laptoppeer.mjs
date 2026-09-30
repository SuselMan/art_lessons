// Usage: node laptoppeer.mjs [room]   (stop: touch temp/device-runs/laptoppeer.stop)
// The laptop as a fourth test participant: headed Chrome on the real GPU,
// creates a room (or joins argv[2]), prints its id, and stays in it until the
// stop file appears. Driven through the dev bridge like every other device.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
const { chromium } = createRequire(import.meta.url)('playwright')
import { fileURLToPath } from 'node:url'
import { session } from './bridge.mjs'
const DIR = fileURLToPath(new URL('../../../../temp/device-runs/', import.meta.url))
const STOP = DIR + 'laptoppeer.stop'
const ROOMFILE = DIR + 'laptoppeer.room'
const BASE = (session.url ?? 'https://localhost:5173/').replace(/\/$/, '')
mkdirSync(DIR, { recursive: true })
rmSync(STOP, { force: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0', '--remote-debugging-port=9333'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
if (process.argv[2]) {
  await page.goto(BASE + '/room/' + process.argv[2])
  const inp = page.getByRole('textbox').first(); await inp.waitFor({ timeout: 30000 }); await inp.fill('laptop')
  await page.getByRole('button', { name: /join|войти/i }).last().click()
} else {
  await page.goto(BASE + '/create')
  await page.locator('form input[type="text"]').first().fill('multitest')
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/room\/[^/]+$/)
}
await page.waitForFunction(() => window.__engine && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none', undefined, { timeout: 120000 })
const room = page.url().split('/').pop().split('?')[0]
writeFileSync(ROOMFILE, room)
console.log('room', room)
while (!existsSync(STOP)) await page.waitForTimeout(2000)
await browser.close()

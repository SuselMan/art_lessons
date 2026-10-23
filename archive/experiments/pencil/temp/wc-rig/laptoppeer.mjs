// The laptop as a fourth test participant: headed Chrome on the real GPU,
// creates a room (or joins argv[2]), prints its id, and stays in it until the
// stop file appears. Driven through the dev bridge like every other device.
import { createRequire } from 'node:module'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const STOP = '/home/suselman/projects/pencil/temp/wc-runs/laptoppeer.stop'
const ROOMFILE = '/home/suselman/projects/pencil/temp/wc-runs/laptoppeer.room'
rmSync(STOP, { force: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
if (process.argv[2]) {
  await page.goto('https://localhost:5277/room/' + process.argv[2])
  const inp = page.getByRole('textbox').first(); await inp.waitFor({ timeout: 30000 }); await inp.fill('laptop')
  await page.getByRole('button', { name: /join|войти/i }).last().click()
} else {
  await page.goto('https://localhost:5277/create')
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

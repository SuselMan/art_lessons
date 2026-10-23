// Drive the tablet's Chrome over CDP (adb forward tcp:9222 localabstract:chrome_devtools_remote):
// open the room, draw a fast zigzag with a big brush as touch input, read the perf HUD numbers.
// Usage: node tablet.mjs <roomUrl> [size] [zigzags]
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [url, sizeStr = '240', zzStr = '8'] = process.argv.slice(2)
const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
let page = ctx.pages().find(p => p.url().includes('/room/')) || ctx.pages()[0]
if (!page) page = await ctx.newPage()
if (!page.url().includes(url)) await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)
const inp = page.locator('input[type="text"]').first()
if (await inp.count()) { await inp.fill('rig'); await page.getByRole('button', { name: /join/i }).first().click() }
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2000)
const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent }))
console.log('viewport', JSON.stringify(vp))
await page.evaluate((size) => { const e = window.__engine; e.setTool('watercolor'); e.setPencil('normal:100:100:PB29:round'); e.setColor([0.165, 0.231, 0.592]); e.setSize(size) }, +sizeStr)
const cdp = await ctx.newCDPSession(page)
const box = await page.locator('canvas').first().boundingBox()
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: box.x + x, y: box.y + y, radiusX: 2, radiusY: 2, force: 0.8 }] })
// A fast zigzag across most of the screen: Ilya's "быстрый длинный зигзагообразный штрих крупной кистью".
const zz = +zzStr, x0 = box.width * 0.1, x1 = box.width * 0.9, yTop = box.height * 0.25, yBot = box.height * 0.75
const pts = []
for (let i = 0; i <= zz; i++) pts.push([x0 + (x1 - x0) * i / zz, i % 2 ? yBot : yTop])
const t0 = Date.now()
await touch('touchStart', pts[0][0], pts[0][1])
let [px, py] = pts[0]
for (const [x, y] of pts.slice(1)) {
  for (let i = 1; i <= 12; i++) await touch('touchMove', px + (x - px) * i / 12, py + (y - py) * i / 12)
  ;[px, py] = [x, y]
}
await touch('touchEnd', px, py)
const strokeMs = Date.now() - t0
await page.waitForTimeout(600)
const perf = await page.evaluate(() => window.__engine.getWatercolorPerf())
console.log('tablet stroke', JSON.stringify({ size: +sizeStr, zigzags: zz, strokeMs, perf }))
await page.waitForTimeout(3000)
console.log('tablet after 3 s', JSON.stringify(await page.evaluate(() => window.__engine.getWatercolorPerf())))
await browser.close()

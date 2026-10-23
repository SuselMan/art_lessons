// Taper test: two synthetic strokes appended straight into the engine - one
// with the nib narrowing 140 -> 28 px along the way, one constant 140 - then
// the deposit's darkness per texel along each, in the density view.
// Usage: node taper.mjs <outDir> [preset]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, preset = 'normal:100:100:PB29:round'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const views = (process.env.WC_VIEW || '').split(',').filter(Boolean)
if (views.length) await page.addInitScript(vs => { for (const v of vs) localStorage.setItem('featureFlag:' + v, 'true') }, views)
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
const zoom = page.getByRole('button', { name: /^\d+%$/ })
if ((await zoom.textContent()) !== '100%') await zoom.click()
await page.waitForTimeout(500)
await page.evaluate(({ preset }) => {
  const e = window.__engine
  const layerId = e._activeId
  const mk = (y, sizeAt) => {
    const dabs = []
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, x = 300 + t * 720
      dabs.push({ x, y, pressure: sizeAt(t) / 140, tiltX: 0, tiltY: 0, size: sizeAt(t), aspectRatio: 1, angle: 0, opacity: 1, t: i * 16 })
    }
    return { id: 'taper' + y, userId: 'peer', timestamp: Date.now(), seq: 100000 + y, type: 'stroke', layerId, tool: 'watercolor', preset, color: [0.165, 0.231, 0.592], dabs, strokeId: 'taper' + y, wet: '' }
  }
  const w = (sx, sy) => (e.screenToWorld ? e.screenToWorld(sx, sy) : { x: sx, y: sy })
  window.__w = w
  e.appendOperation(mk(300, t => 140 * (1 - 0.8 * t)), 'remote')
  e.appendOperation(mk(600, () => 140), 'remote')
  // Dwell: the pen pauses (jitters within a px) for 40 samples at the end / at the start.
  const dwell = (y, atEnd) => {
    const dabs = []
    const push = (x, i) => dabs.push({ x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 140, aspectRatio: 1, angle: 0, opacity: 1, t: i * 16 })
    let i = 0
    if (!atEnd) for (let k = 0; k < 40; k++) push(300 + (k % 2) * 0.7, i++)
    for (let k = 0; k <= 60; k++) push(300 + (k / 60) * 720, i++)
    if (atEnd) for (let k = 0; k < 40; k++) push(1020 + (k % 2) * 0.7, i++)
    return { id: 'dwell' + y, userId: 'peer', timestamp: Date.now(), seq: 100000 + y, type: 'stroke', layerId, tool: 'watercolor', preset, color: [0.165, 0.231, 0.592], dabs, strokeId: 'dwell' + y, wet: '' }
  }
  e.appendOperation(dwell(900, true), 'remote')
  e.appendOperation(dwell(1200, false), 'remote')
  // Ilya's real gesture: lands at 40 px with a 40-sample dwell (2 px jitter),
  // widens to 140, narrows to 80 and dwells 40 samples again before the lift.
  const ilya = (y) => {
    const dabs = []
    const push = (x, size, i) => dabs.push({ x, y, pressure: size / 150, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: i * 16 })
    let i = 0
    for (let k = 0; k < 40; k++) push(300 + (k % 3) * 1.0, 40, i++)
    for (let k = 0; k <= 60; k++) { const t = k / 60; push(300 + t * 720, t < 0.3 ? 40 + (140 - 40) * (t / 0.3) : t < 0.8 ? 140 : 140 - 60 * ((t - 0.8) / 0.2), i++) }
    for (let k = 0; k < 40; k++) push(1020 + (k % 3) * 1.0, 80, i++)
    return { id: 'ilya' + y, userId: 'peer', timestamp: Date.now(), seq: 100000 + y, type: 'stroke', layerId, tool: 'watercolor', preset, color: [0.165, 0.231, 0.592], dabs, strokeId: 'ilya' + y, wet: '' }
  }
  e.appendOperation(ilya(1500), 'remote')
}, { preset })
await page.waitForTimeout(6000)
const png = await page.evaluate(async () => {
  const b = await window.__engine.exportPNG(false)
  const buf = new Uint8Array(await b.arrayBuffer())
  let str = ''
  for (let i = 0; i < buf.length; i += 8192) str += String.fromCharCode.apply(null, buf.subarray(i, i + 8192))
  return btoa(str)
})
const fs = await import('node:fs'); fs.writeFileSync(join(out, 'export.png'), Buffer.from(png, 'base64'))
console.log('export saved')
await browser.close()

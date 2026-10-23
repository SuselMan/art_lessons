// Dwell test (#536, ADR 011 s17.37): four synthetic strokes appended straight
// into the engine, identical except for how long the nib stands at its landing
// before moving: 0 / 500 / 2000 / 4000 ms. Ilya's photograph: no pause - a
// start only a little darker with no edge; a pause - a dark landing puddle
// with a hard rounded edge, growing with the pause.
// Usage: node dwell.mjs <outDir> [preset]   (preset default 100:27, series 2)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, preset = 'normal:100:27:PB29:round'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
await page.evaluate(({ preset }) => {
  const e = window.__engine
  const layerId = e._activeId
  const mk = (y, dwellMs) => {
    const dabs = []
    let t = 0, i = 0
    const push = (x) => { dabs.push({ x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 110, aspectRatio: 1, angle: 0, opacity: 1, t }); i++ }
    // Standing: samples every 16 ms, jittering within a pixel.
    for (; t < dwellMs; t += 16) push(300 + (i % 3) * 0.6)
    // Then a steady 1 px/ms sweep of 700 px.
    for (let k = 0; k <= 60; k++, t += 12) push(300 + (k / 60) * 700)
    return { id: 'dwell' + y, userId: 'peer', timestamp: Date.now(), seq: 100000 + y, type: 'stroke', layerId, tool: 'watercolor', preset, color: [0.165, 0.231, 0.592], dabs, strokeId: 'dwell' + y, wet: '' }
  }
  e.appendOperation(mk(200, 0), 'remote')
  e.appendOperation(mk(400, 500), 'remote')
  e.appendOperation(mk(600, 2000), 'remote')
  e.appendOperation(mk(800, 4000), 'remote')
}, { preset })
await page.waitForTimeout(8000)
const png = await page.evaluate(async () => {
  const b = await window.__engine.exportPNG(false)
  const buf = new Uint8Array(await b.arrayBuffer())
  let str = ''
  for (let i = 0; i < buf.length; i += 8192) str += String.fromCharCode.apply(null, buf.subarray(i, i + 8192))
  return btoa(str)
})
writeFileSync(join(out, 'export.png'), Buffer.from(png, 'base64'))
console.log('export saved')
await browser.close()

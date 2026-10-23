// Open an existing room in a real Chrome on the GPU, let the replay settle,
// screenshot it and export the layer at full resolution.
// Usage: node view.mjs <outDir> <roomId> [waitMs]
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, room, waitMs = '8000'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const views = (process.env.WC_VIEW || '').split(',').filter(Boolean)
if (views.length) await page.addInitScript(vs => { for (const v of vs) localStorage.setItem('featureFlag:' + v, 'true') }, views)
await page.goto(`https://localhost:5277/room/${room}`)
await page.waitForTimeout(1500)
const inp = page.locator('input[type="text"]').first()
if (await inp.count()) { await inp.fill('rig'); await page.getByRole('button', { name: /join/i }).first().click() }
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(+waitMs)
const zoom = page.getByRole('button', { name: /^\d+%$/ })
console.log('zoom', await zoom.textContent())
await page.screenshot({ path: join(out, 'room.png') })
const ops = await page.evaluate(() => window.__engine.getOperations().map(o => ({ type: o.type, tool: o.tool, preset: o.preset, wet: o.wet, n: o.dabsPacked ? o.dabsPacked.length : (o.dabs ? o.dabs.length : 0) })))
console.log('ops', JSON.stringify(ops).slice(0, 400))
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

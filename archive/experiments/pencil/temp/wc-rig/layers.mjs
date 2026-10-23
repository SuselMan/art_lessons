// Replay a room, then export each layer alone (setBaseLayers to just it).
// Usage: node layers.mjs <outDir> <roomId> <id=name,id=name,...> [waitMs]
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, room, spec, waitMs = '12000'] = process.argv.slice(2)
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
for (const pair of spec.split(',')) {
  const [id, name] = pair.split('=')
  const png = await page.evaluate(async (id) => {
    const e = window.__engine
    e.setCompositeOrder([{ id, opacity: 1 }])
    const b = await e.exportPNG(false)
    const buf = new Uint8Array(await b.arrayBuffer())
    let str = ''
    for (let i = 0; i < buf.length; i += 8192) str += String.fromCharCode.apply(null, buf.subarray(i, i + 8192))
    return btoa(str)
  }, id)
  writeFileSync(join(out, `layer_${name}.png`), Buffer.from(png, 'base64'))
  console.log('exported', name)
}
await browser.close()

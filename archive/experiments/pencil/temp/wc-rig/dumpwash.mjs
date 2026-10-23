// Open a room on the GPU, let it replay, then dump every cached wash scratch's
// tile channels as PGMs: to SEE which buffer carries an edge.
// Usage: node dumpwash.mjs <outDir> <roomId> [waitMs]
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, room, waitMs = '15000'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(`https://localhost:5277/room/${room}`)
await page.waitForTimeout(1500)
const inp = page.locator('input[type="text"]').first()
if (await inp.count()) { await inp.fill('rig'); await page.getByRole('button', { name: /join/i }).first().click() }
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(+waitMs)
const dump = await page.evaluate(() => {
  const e = window.__engine
  const b64 = (arr) => { let s = ''; for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode.apply(null, arr.subarray(i, i + 8192)); return btoa(s) }
  const out = {}
  const origins = new Map()
  for (const layer of e._layers.values()) for (const t of layer.allResident()) origins.set(t.buffer, [t.originX, t.originY])
  let wi = 0
  for (const chunk of e._replayRibbonChunks.values()) {
    const wash = chunk.strokeId.slice(0, 6)
    for (const [buf, entry] of chunk.scratch._tiles) {
      if (!entry.inkLoad) continue
      const [ox, oy] = origins.get(buf) || [0, 0]; const W = buf.width, H = buf.height
      const chans = { load: entry.inkLoad, dry: entry.inkDry, color: entry.inkColor, colorDry: entry.colorDry, cov: entry.coverage }
      for (const [name, b] of Object.entries(chans)) {
        if (!b) continue
        const px = b.readPixels()
        for (const ch of [0, 1, 2, 3]) { const a = new Uint8Array(W * H); let nz = 0; for (let i = 0; i < W * H; i++) { a[i] = px[i * 4 + ch]; if (a[i]) nz++ } if (nz) out[`w${wi}_${wash}_${ox}_${oy}_${name}_${'rgba'[ch]}`] = { W, H, data: b64(a) } }
      }
    }
    wi++
  }
  return out
})
for (const [name, { W, H, data }] of Object.entries(dump)) writeFileSync(join(out, name + '.pgm'), Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), Buffer.from(data, 'base64')]))
console.log('dumped', Object.keys(dump).length, Object.keys(dump).filter(k => k.endsWith('load_a')).join(' '))
await browser.close()

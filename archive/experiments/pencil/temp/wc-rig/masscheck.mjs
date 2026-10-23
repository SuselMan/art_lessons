// One synthetic stroke of a big brush appended as a remote op; prints the
// wash deposit's total .a (inkLoad and inkDry) and the layer tile's alpha sum.
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const size = +(process.argv[2] || 150)
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })).newPage()
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
await page.evaluate((size) => {
  const e = window.__engine; const layerId = e._activeId
  const dabs = []; let t = 0
  for (let k = 0; k <= 80; k++, t += 12) dabs.push({ x: 300 + k * 6, y: 500, pressure: 1, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t })
  e.appendOperation({ id: 'mc1', userId: 'peer', timestamp: Date.now(), seq: 100001, type: 'stroke', layerId, tool: 'watercolor', preset: 'normal:100:100:PB29:round', color: [0.3, 0.1, 0.6], dabs, strokeId: 'mc1', wet: '' }, 'remote')
}, size)
await page.waitForTimeout(5000)
const r = await page.evaluate(() => {
  const e = window.__engine; const out = { load: 0, dry: 0, color: 0, tile: 0 }
  for (const chunk of e._replayRibbonChunks.values()) for (const [buf, en] of chunk.scratch._tiles) {
    const sum = (b) => { if (!b) return 0; const p = b.readPixels(); let s = 0; for (let i = 3; i < p.length; i += 4) s += p[i]; return s }
    out.load += sum(en.inkLoad); out.dry += sum(en.inkDry); out.color += sum(en.inkColor); out.tile += sum(buf)
  }
  return out
})
console.log('mass', size, JSON.stringify(r))
await browser.close()

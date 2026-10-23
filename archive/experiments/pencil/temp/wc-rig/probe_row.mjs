// Replay a layer up to WC_UNTIL, then read the wash tiles' inkLoad (wet) and inkDry
// (provisional dry) .a along one row: is a feature in the wet state or in the tide?
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [opsFile, layerId, untilPrefix, yStr, x0Str, x1Str] = process.argv.slice(2)
const ops = JSON.parse(readFileSync(opsFile, 'utf8'))
const undone = new Set(ops.filter(o => o.type === 'operation_undo').map(o => o.targetOpId))
let play = ops.filter(o => (o.type === 'layer_add' || o.type === 'stroke') && !undone.has(o.id) && (o.type !== 'stroke' || o.layerId === layerId))
const i = play.findIndex(o => o.type === 'stroke' && o.id.startsWith(untilPrefix)); play = play.slice(0, i + 1)
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
for (const op of play) { await page.evaluate((op) => { window.__engine.appendOperation(op, 'remote') }, op); if (op.type === 'stroke') await page.waitForTimeout(300) }
await page.waitForTimeout(4000)
const rows = await page.evaluate(({ layerId, y, x0, x1 }) => {
  const e = window.__engine
  const layer = e._layers.get(layerId)
  const origins = new Map(); for (const t of layer.allResident()) origins.set(t.buffer, [t.originX, t.originY])
  const out = []
  for (const chunk of e._replayRibbonChunks.values()) {
    for (const [buf, entry] of chunk.scratch._tiles) {
      const o = origins.get(buf); if (!o || !entry.inkLoad) continue
      const [ox, oy] = o; const W = buf.width, H = buf.height
      if (y < oy || y >= oy + H) continue
      const wet = entry.inkLoad.readPixels(), dry = entry.inkDry ? entry.inkDry.readPixels() : null, cov = entry.coverage.readPixels()
      const row = H - 1 - (y - oy)
      const line = []
      for (let x = x0; x < x1; x += 6) { if (x < ox || x >= ox + W) continue; const k = (row * W + (x - ox)) * 4; line.push([x, wet[k + 3], dry ? dry[k + 3] : -1, cov[k + 3], cov[k + 2]]) }
      out.push({ wash: chunk.strokeId.slice(0, 6), tile: [ox, oy], line })
    }
  }
  return out
}, { layerId, y: +yStr, x0: +x0Str, x1: +x1Str })
for (const r of rows) { console.log('wash', r.wash, 'tile', r.tile.join(','), 'x wet.a dry.a cov.a cov.b'); for (const l of r.line) console.log(l.join(' ')) }
await browser.close()

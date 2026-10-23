// Save a room's operation log as JSON (the shape replaylayer.mjs reads).
// Usage: node dumpops.mjs <roomId> <out.json>
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [room, out] = process.argv.slice(2)
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await ctx.newPage()
await page.goto(`https://localhost:5277/room/${room}`)
await page.waitForTimeout(1500)
const inp = page.locator('input[type="text"]').first()
if (await inp.count()) { await inp.fill('rig'); await page.getByRole('button', { name: /join/i }).first().click() }
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(3000)
const ops = await page.evaluate(() => window.__engine.getOperations())
writeFileSync(out, JSON.stringify(ops))
console.log('ops', ops.length, ops.filter(o => o.type === 'stroke').map(o => [o.id.slice(0, 6), o.layerId, o.color.map(c => c.toFixed(2)).join(','), (o.preset || '').slice(0, 14), o.washId?.slice(0, 6), (o.wet || '').slice(0, 4)].join(' ')).join('\n'))
await browser.close()

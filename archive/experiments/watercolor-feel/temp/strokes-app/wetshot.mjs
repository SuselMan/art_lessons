// Replays the first N strokes of a room log and screenshots the room while
// the paper is still wet - the bead and the wet-paper grey (#680, s17.81).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const { chromium } = createRequire(new URL('../../package.json', import.meta.url).pathname)('playwright')
const [opsFile, out, nStr = '4'] = process.argv.slice(2)
const ops = JSON.parse(readFileSync(opsFile, 'utf8')).filter(o => o.type !== 'image_import')
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error' || /shader|compile|link/i.test(m.text())) errs.push(m.text().slice(0, 300)) })
await page.goto('https://localhost:5277/create')
await page.waitForTimeout(2500)
await page.locator('form input[type="text"]').first().fill('wetshot')
await page.getByRole('button', { name: /Medium/ }).first().click()
const a2 = page.getByText('A2', { exact: true }).first(); await a2.click(); await a2.click()
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
let n = 0, box = null
for (const op of ops) {
  if (op.type === 'stroke') { if (n >= +nStr) break; n++ }
  await page.evaluate(op => { window.__engine.appendOperation({ ...op, timestamp: Date.now() }, 'remote') }, op)
  await page.waitForTimeout(300)
}
// frame the strokes: fit view to the laid strokes if the engine offers it
if (process.env.VIEW) await page.evaluate(v => window.__engine.setViewport(...v), JSON.parse(process.env.VIEW))
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
const pools = await page.evaluate(() => {
  const pw = window.__engine._paperWet; const now = performance.now()
  let n = 0, wet = 0, max = 0, over = 0
  for (const m of [...pw._layers.values(), ...pw._pending.values()]) for (const c of m.values()) { n++; if (c.w > 0.05) wet++; const p = c.p || 0; if (p > max) max = p; if (p > 0.3) over++ }
  return { n, wet, max: +max.toFixed(3), over }
})
console.log('pools', JSON.stringify(pools))
console.log(JSON.stringify({ strokes: n, errors: errs.slice(0, 5) }))
await browser.close()

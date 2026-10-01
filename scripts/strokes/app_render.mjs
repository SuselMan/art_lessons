// Ilya's repeats of the archive's strokes, rendered clean by the engine of
// this checkout (#536).
//
//   node scripts/strokes/app_render.mjs <ops.json> <out.png>
//
// <ops.json> is a room's operation log (psql: jsonb_agg(data order by seq)
// from "Operation"). A fresh A2 landscape room is made on the local dev stack
// (https://localhost:5277, dev build - it has window.__engine), the log is
// appended op by op as remote operations - strokes, undo, clear, layers; not
// the reference photo - and once the paint has settled, every layer that
// carries strokes is exported together. Opening the room itself would not do:
// a room comes back from its checkpoint, so the old strokes would keep the
// engine version they were painted with.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const { chromium } = createRequire(new URL('../../package.json', import.meta.url).pathname)('playwright')

const [opsFile, out] = process.argv.slice(2)
const base = process.env.APP_URL || 'https://localhost:5277'
const ops = JSON.parse(readFileSync(opsFile, 'utf8')).filter(o => o.type !== 'image_import')
const strokeLayers = [...new Set(ops.filter(o => o.type === 'stroke').map(o => o.layerId))]

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(`${base}/create`)
await page.waitForTimeout(2500) // the form fills its saved defaults after load
await page.locator('input[type="text"]').first().fill('strokes-app')
await page.getByRole('button', { name: /Medium/ }).first().click()
// A2, then once more to turn it landscape (3508 x 2480, the boards' size).
const a2 = page.getByText('A2', { exact: true }).first()
await a2.click()
await a2.click()
await page.getByRole('button', { name: /Create project|Создать проект/ }).click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
let n = 0
for (const op of ops) {
  await page.evaluate(op => { window.__engine.appendOperation(op, 'remote') }, op)
  if (op.type === 'stroke') n++
  // Every operation, not only strokes, gets its step: an undo landing while
  // the stroke before it is still settling made the same log paint
  // differently run to run (sheet 1, slot 12 - #681).
  await page.waitForTimeout(+(process.env.APP_STEP || 400))
}
await page.waitForTimeout(+(process.env.APP_WAIT || 15000))
// The photographs are of DRY paint, and a wash lays its tideline only when it
// dries (ADR 011 §17.42): dry everything, as the paper_dry operation would,
// and let the settle land before the export.
if (process.env.APP_DRY !== '0') {
  await page.evaluate(() => window.__engine.watercolorDryAll())
  await page.waitForTimeout(+(process.env.APP_DRY_WAIT || 8000))
}
const png = await page.evaluate(async ids => {
  const e = window.__engine
  e.setCompositeOrder(ids.map(id => ({ id, opacity: 1 })))
  const b = await e.exportPNG(false)
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192))
  return btoa(s)
}, strokeLayers)
writeFileSync(out, Buffer.from(png, 'base64'))
console.log(JSON.stringify({ strokes: n, layers: strokeLayers, errors: errors.slice(0, 3) }))
await browser.close()

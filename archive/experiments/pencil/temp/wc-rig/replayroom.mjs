// A CLEAN render of a room's log: a fresh room, the log's layer_add and
// (not-undone) strokes appended one by one as remote ops, then each named
// layer exported alone. Usage: node replayroom.mjs <outDir> <ops.json> <id=name,...>
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [out, opsFile, spec] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const ops = JSON.parse(readFileSync(opsFile, 'utf8'))
const undone = new Set(ops.filter(o => o.type === 'operation_undo').map(o => o.targetOpId))
const play = ops.filter(o => (o.type === 'layer_add' || o.type === 'stroke') && !undone.has(o.id))
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const views = (process.env.WC_VIEW || '').split(',').filter(Boolean)
if (views.length) await page.addInitScript(vs => { for (const v of vs) localStorage.setItem('featureFlag:' + v, 'true') }, views)
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
await page.waitForTimeout(2500)
let n = 0
for (const op of play) {
  await page.evaluate((op) => { window.__engine.appendOperation(op, 'remote') }, op)
  if (op.type === 'stroke') { n++; await page.waitForTimeout(+(process.env.WC_STEP || 350)) }
}
console.log('applied strokes', n, 'errors', JSON.stringify(errors.slice(0, 3)))
await page.waitForTimeout(+(process.env.WC_WAIT || 12000))
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
}
console.log('exported')
await browser.close()

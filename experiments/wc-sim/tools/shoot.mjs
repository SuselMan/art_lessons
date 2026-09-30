// Drives the sandbox in a real, visible Chrome on the real GPU.
//   node shoot.mjs shots <outDir> [size] [extra query]   — scripted strokes, PNG per mark
//   node shoot.mjs bench <outDir> [size]                  — fps idle / drawing, ms per step
// Playwright is borrowed from the main checkout (the sandbox has no node_modules):
//   PW_FROM=/path/to/package.json (default: ~/projects/pencil/package.json)
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { chromium } = createRequire(process.env.PW_FROM || '/home/suselman/projects/pencil/package.json')('playwright')
const [mode = 'shots', out = '.', size = '1024', extra = ''] = process.argv.slice(2)
// Without WC_URL the rig serves the sandbox itself (page.route), no server needed.
const base = process.env.WC_URL || 'http://wc.local/'
const root = new URL('..', import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--window-position=0,0', mode === 'bench' ? '--window-size=1500,1150' : '--window-size=520,420', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
})
const page = await browser.newPage({ viewport: mode === 'bench' ? { width: 1480, height: 1080 } : { width: 500, height: 330 } })
page.setDefaultTimeout(180000)
if (!process.env.WC_URL) {
  const types = { html: 'text/html', js: 'text/javascript', png: 'image/png', json: 'application/json' }
  await page.route('http://wc.local/**', async (route) => {
    let p = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'
    try {
      const body = readFileSync(join(root, p))
      await route.fulfill({ status: 200, body, contentType: types[p.split('.').pop()] || 'application/octet-stream' })
    } catch { await route.fulfill({ status: 404, body: 'not found' }) }
  })
}
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.bringToFront()

async function open(q) {
  await page.goto(`${base}?size=${size}&${q}`)
  await page.waitForFunction(() => window.__wc && (window.__wc.ready || window.__wc.error), null, { timeout: 60000 })
  const err = await page.evaluate(() => window.__wc.error)
  if (err) throw new Error(err)
  const info = await page.evaluate(() => ({
    probe: window.__wc.probe, shaders: window.__wc.shaderSizes, type: window.__wc.stats.type,
    renderer: (() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' })(),
  }))
  return info
}

async function saveCanvas(file) {
  const url = await page.evaluate(() => { window.__wc.renderNow(); return document.getElementById('c').toDataURL('image/png') })
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
}

if (mode === 'watch') {
  // open with arbitrary query, print stats every 2 s, save canvas at the end
  const info = await open(extra)
  console.log(JSON.stringify(info))
  const secs = +(process.env.WC_SECS || 10)
  for (let i = 0; i < secs / 2; i++) {
    await page.waitForTimeout(2000)
    console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__wc.stats, err: window.__wc.error, marks: window.__wc.marks, paused: window.__wc.runner && window.__wc.runner.paused, tot: window.__wc.totals() }))))
    if (process.env.WC_RESUME) await page.evaluate(() => window.__wc.resume())
  }
  await saveCanvas(join(out, 'watch.png'))
} else if (mode === 'shots') {
 // WC_VARIANTS="label:query;label:query" runs the script once per variant, out/<label>/
 const variants = process.env.WC_VARIANTS ? process.env.WC_VARIANTS.split(';').map((v) => v.split(/:(.*)/s)) : [['', '']]
 for (const [label, vq] of variants) {
  const dir = join(out, label)
  mkdirSync(dir, { recursive: true })
  const info = await open(`drive=1&script=${process.env.WC_SCRIPT || "all"}&shots=1&fast=${process.env.WC_FAST || 48}&${extra}&${vq}`)
  console.log(label, JSON.stringify(info).slice(0, 200))
  const t0 = Date.now()
  for (let seen = 0; ; seen++) {
    // the (seen+1)-th mark has fired and the runner is holding for us
    // drive the script ourselves until the next mark holds it
    for (;;) {
      const tq = Date.now()
      const r = await page.evaluate(() => window.__wc.runScriptSteps(1500))
      if (process.env.WC_DEBUG) console.log('chunk', Date.now() - tq, 'ms', JSON.stringify(r), await page.evaluate(() => JSON.stringify(window.__wc.sim.region)))
      if (r.done || r.paused) break
    }
    const nm = await page.evaluate(() => (window.__wc.marks || []).length)
    if (nm <= seen) { console.log('no new mark?', seen, nm, JSON.stringify(await page.evaluate(() => ({ i: window.__wc.runner.i, cur: window.__wc.runner.cur, done: window.__wc.runner.done, paused: window.__wc.runner.paused })))); seen--; continue }
    const { mark, steps, marks } = await page.evaluate((k) => ({ mark: window.__wc.marks[k].name, steps: window.__wc.sim.steps, marks: (window.__wc.marks || []).map((m) => m.name).join(',') }), seen)
    await page.waitForTimeout(100)
    if (mark === 'done') break
    await saveCanvas(join(dir, `${mark}.png`))
    for (const [v, nm] of (process.env.WC_VIEWS ? [[1, 'water'], [2, 'cap'], [4, 'susp']] : [])) {
      await page.evaluate((v) => window.__wc.setView(v), v)
      await saveCanvas(join(dir, `${mark}_${nm}.png`))
    }
    await page.evaluate(() => window.__wc.setView(0))
    console.log(`mark ${mark} at step ${steps}, ${((Date.now() - t0) / 1000).toFixed(1)}s [${marks}]`)
    await page.evaluate(() => window.__wc.resume())
  }
 }
} else if (mode === 'bench') {
  const info = await open('')
  const res = { size: +size, renderer: info.renderer, type: info.type, shaders: info.shaders }
  const readStats = () => page.evaluate(() => ({ ...window.__wc.stats }))
  // raw cost of one substep, GPU-synchronous
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__wc.benchSteps(50)) // warm-up
  res.msPerStepFull = await page.evaluate(() => window.__wc.benchSteps(300))
  res.msRender = await page.evaluate(() => window.__wc.benchRender(60))
  for (const sub of [4, 8, 16]) {
    await page.evaluate((s) => window.__wc.setSub(s), sub)
    await page.waitForTimeout(2200)
    const idle = await readStats()
    // draw: a long wiggly stroke for ~2.5 s with the real pointer path
    const box = await page.locator('#c').boundingBox()
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.3)
    await page.mouse.down()
    const t0 = Date.now()
    let i = 0
    let drawStats = null
    while (Date.now() - t0 < 2600) {
      const t = i++ / 60
      await page.mouse.move(box.x + box.width * (0.1 + 0.8 * ((t * 0.35) % 1)), box.y + box.height * (0.3 + 0.2 * Math.sin(t * 4) + 0.3 * ((t * 0.35) | 0) % 2))
      if (Date.now() - t0 > 1800 && !drawStats) drawStats = await readStats()
    }
    await page.mouse.up()
    await page.waitForTimeout(1500)
    const wetIdle = await readStats()
    res['sub' + sub] = {
      idleFps: +idle.fps.toFixed(1), idleSimMs: +idle.simMs.toFixed(2),
      drawFps: +drawStats.fps.toFixed(1), drawSimMs: +drawStats.simMs.toFixed(2),
      wetIdleFps: +wetIdle.fps.toFixed(1),
    }
    await page.evaluate(() => window.__wc.clear())
  }
  res.msPerStepFullAgain = await page.evaluate(() => window.__wc.benchSteps(300))
  console.log(JSON.stringify(res, null, 1))
  writeFileSync(join(out, `bench_${size}.json`), JSON.stringify(res, null, 1))
}
await browser.close()

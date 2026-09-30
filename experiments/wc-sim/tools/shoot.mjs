// Drives the sandbox in a real, visible Chrome on the real GPU.
//   node shoot.mjs shots <outDir> [size] [extra query]   — scripted strokes, PNG per mark
//   node shoot.mjs bench <outDir> [size]                  — fps idle / drawing, ms per step
// Playwright is borrowed from the main checkout (the sandbox has no node_modules):
//   PW_FROM=/path/to/package.json (default: ~/projects/pencil/package.json)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { chromium } = createRequire(process.env.PW_FROM || '/home/suselman/projects/pencil/package.json')('playwright')
const [mode = 'shots', out = '.', size = '1024', extra = ''] = process.argv.slice(2)
const base = process.env.WC_URL || 'http://localhost:8679/'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--window-position=0,0', '--window-size=1500,1150', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})
const page = await browser.newPage({ viewport: { width: 1480, height: 1080 } })
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
  const url = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'))
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
}

if (mode === 'watch') {
  // open with arbitrary query, print stats every 2 s, save canvas at the end
  const info = await open(extra)
  console.log(JSON.stringify(info))
  const secs = +(process.env.WC_SECS || 10)
  for (let i = 0; i < secs / 2; i++) {
    await page.waitForTimeout(2000)
    console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__wc.stats, err: window.__wc.error, marks: window.__wc.marks }))))
  }
  await saveCanvas(join(out, 'watch.png'))
} else if (mode === 'shots') {
 // WC_VARIANTS="label:query;label:query" runs the script once per variant, out/<label>/
 const variants = process.env.WC_VARIANTS ? process.env.WC_VARIANTS.split(';').map((v) => v.split(/:(.*)/s)) : [['', '']]
 for (const [label, vq] of variants) {
  const dir = join(out, label)
  mkdirSync(dir, { recursive: true })
  const info = await open(`script=${process.env.WC_SCRIPT || 'all'}&shots=1&fast=${process.env.WC_FAST || 48}&${extra}&${vq}`)
  console.log(label, JSON.stringify(info).slice(0, 200))
  const t0 = Date.now()
  for (;;) {
    await page.waitForFunction(() => {
      const w = window.__wc
      return w.stats.mark === 'done' || (w.runner && w.runner.paused)
    }, null, { timeout: 600000, polling: 100 })
    const { mark, steps } = await page.evaluate(() => ({ mark: window.__wc.stats.mark, steps: window.__wc.sim.steps }))
    await page.waitForTimeout(100)
    if (mark === 'done') break
    await saveCanvas(join(dir, `${mark}.png`))
    for (const [v, nm] of (process.env.WC_VIEWS ? [[1, 'water'], [2, 'cap'], [4, 'susp']] : [])) {
      await page.evaluate((v) => window.__wc.setView(v), v)
      await page.waitForTimeout(80)
      await saveCanvas(join(dir, `${mark}_${nm}.png`))
    }
    await page.evaluate(() => window.__wc.setView(0))
    console.log(`mark ${mark} at step ${steps}, ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    await page.evaluate(() => window.__wc.resume())
    await page.waitForFunction((m) => window.__wc.stats.mark !== m || !window.__wc.runner.paused, mark)
  }
 }
} else if (mode === 'bench') {
  const info = await open('')
  const res = { size: +size, renderer: info.renderer, type: info.type, shaders: info.shaders }
  const readStats = () => page.evaluate(() => ({ ...window.__wc.stats }))
  // raw cost of one substep, GPU-synchronous
  await page.waitForTimeout(500)
  res.msPerStepEmpty = await page.evaluate(() => window.__wc.benchSteps(200))
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
  res.msPerStepAfter = await page.evaluate(() => window.__wc.benchSteps(200))
  console.log(JSON.stringify(res, null, 1))
  writeFileSync(join(out, `bench_${size}.json`), JSON.stringify(res, null, 1))
}
await browser.close()

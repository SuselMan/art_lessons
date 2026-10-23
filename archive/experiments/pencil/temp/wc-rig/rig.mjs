// Watercolour rig: drives the dev build at https://localhost:5277 through a
// real Chromium so strokes are real pointer input (which is what paints).
// Usage: node rig.mjs <outDir> <scenario>
//   WC_GPU=1     headed Google Chrome on the real GPU (else headless swiftshader)
//   WC_PROF=1    inject gpuprof.js (per-program GPU timers)
//   WC_VIEW=flag feature flag to set before load (wcViewWater, wcViewPigment, wcPerfHud…)
//   WC_MIX, WC_SIZE, WC_STEPS, WC_WAIT, WC_DAB_Y  scenario knobs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || '.'
const scenario = process.argv[3] || 'mix'
mkdirSync(out, { recursive: true })

const browser = process.env.WC_GPU
  ? await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
  : await chromium.launch({ headless: true, args: ['--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
if (process.env.WC_PROF) await page.addInitScript({ path: join(here, 'gpuprof.js') })
const views = (process.env.WC_VIEW || '').split(',').filter(Boolean)
if (views.length) await page.addInitScript(vs => { for (const v of vs) localStorage.setItem('featureFlag:' + v, 'true') }, views)
const errors = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

const waitEngine = async () => {
  await page.waitForFunction(() => {
    if (!window.__engine) return false
    const c = document.querySelector('canvas')
    return !!c && getComputedStyle(c).pointerEvents !== 'none'
  }, undefined, { timeout: 60_000 })
  await page.waitForTimeout(1500)
  const zoom = page.getByRole('button', { name: /^\d+%$/ })
  if ((await zoom.textContent()) !== '100%') await zoom.click()
  await page.waitForTimeout(500)
}
await page.goto('https://localhost:5277/create')
await page.locator('form input[type="text"]').first().fill('rig')
await page.locator('form button[type="submit"]').click()
await page.waitForURL(/\/room\/[^/]+$/)
await waitEngine()

const engine = (fn, arg) => page.evaluate(([f, a]) => {
  const e = window.__engine
  // eslint-disable-next-line no-new-func
  return new Function('e', 'a', f)(e, a)
}, [fn, arg])
const setup = async ({ preset, color, size }) => {
  await engine(`e.setTool('watercolor'); e.setPencil(a.preset); e.setColor(a.color); e.setSize(a.size)`, { preset, color, size })
}
const box = await page.locator('canvas').first().boundingBox()
const cdp = process.env.WC_FAST ? await ctx.newCDPSession(page) : null
const stroke = async (pts, stepsPer = 12) => {
  if (cdp) {
    // Fire the samples without waiting for each ack, the way a 240 Hz pen
    // arrives: several per frame. The renderer still handles them in order.
    const ev = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: box.x + x, y: box.y + y, button: 'left', buttons: 1, ...extra })
    await ev('mouseMoved', pts[0][0], pts[0][1], { buttons: 0 })
    await ev('mousePressed', pts[0][0], pts[0][1], { clickCount: 1 })
    const sends = []
    let [px, py] = pts[0]
    for (const [x, y] of pts.slice(1)) {
      for (let i = 1; i <= stepsPer; i++) sends.push(ev('mouseMoved', px + (x - px) * i / stepsPer, py + (y - py) * i / stepsPer))
      ;[px, py] = [x, y]
    }
    await Promise.all(sends)
    await ev('mouseReleased', px, py, { clickCount: 1, buttons: 0 })
    return
  }
  await page.mouse.move(box.x + pts[0][0], box.y + pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: stepsPer })
  await page.mouse.up()
}
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name) }
const wait = (ms) => page.waitForTimeout(ms)
const readLayer = async () => page.evaluate(() => {
  const e = window.__engine
  const layer = e._layers.get(e._activeId)
  const outp = {}
  for (const t of layer.allResident()) {
    const px = t.buffer.readPixels()
    let sum = 0, nz = 0
    for (let i = 3; i < px.length; i += 4) { sum += px[i]; if (px[i]) nz++ }
    if (!nz) continue
    const samples = []
    for (let i = 0; i < px.length; i += 61) samples.push(px[i])
    outp[t.originX + ',' + t.originY] = { sumA: sum, nzA: nz, samples }
  }
  return outp
})
const dumpFields = async (sub = '') => {
  // Every field buffer's channel as a PGM, plus the tiles' deposit .b and
  // coverage .a: to SEE the domain, the band and the moved paint.
  const dump = await page.evaluate(() => {
    const e = window.__engine
    const f = e._diffuseField
    const out = {}
    const b64 = (arr) => { let str = ''; for (let i = 0; i < arr.length; i += 8192) str += String.fromCharCode.apply(null, arr.subarray(i, i + 8192)); return btoa(str) }
    if (f) {
      for (const name of ['band', 'pressure', 'mask', 'a', 'b', 'c', 'coverage']) {
        const buf = f[name]; if (!buf) continue
        const px = buf.readPixels(); const W = f.w, H = f.h
        for (const ch of [0, 1, 2, 3]) { const arr = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) arr[i] = px[i * 4 + ch]; out[`field_${name}_${'rgba'[ch]}`] = { W, H, data: b64(arr) } }
      }
    }
    {
      // The layer's own tiles, whatever the wash's state (a replay's wash is
      // closed by the time we look): to see WHERE live and replay differ.
      const layer = e._layers.get(e._activeId)
      for (const t of layer.allResident()) {
        const px = t.buffer.readPixels(); const W = t.buffer.width, H = t.buffer.height
        const a = new Uint8Array(W * H); let nz = 0
        for (let i = 0; i < W * H; i++) { a[i] = px[i * 4 + 3]; if (a[i]) nz++ }
        if (nz) out[`layer_${t.originX}_${t.originY}_a`] = { W, H, data: b64(a) }
      }
    }
    const w = e._wash
    if (w) {
      const layer = e._layers.get(e._activeId)
      const origins = new Map()
      for (const t of layer.allResident()) origins.set(t.buffer, [t.originX, t.originY])
      for (const [buf, entry] of w.scratch._tiles) {
        if (!entry.inkLoad) continue
        const W = buf.width, H = buf.height; const [ox, oy] = origins.get(buf) || [0, 0]
        const load = entry.inkLoad.readPixels(), cov = entry.coverage.readPixels()
        const b = new Uint8Array(W * H), a = new Uint8Array(W * H), c = new Uint8Array(W * H), t = new Uint8Array(W * H), o = new Uint8Array(W * H)
        const tile = buf.readPixels(), orig = entry.original ? entry.original.readPixels() : null
        for (let i = 0; i < W * H; i++) { b[i] = load[i * 4 + 2]; a[i] = load[i * 4 + 3]; c[i] = cov[i * 4 + 3]; t[i] = tile[i * 4 + 3]; o[i] = orig ? orig[i * 4 + 3] : 0 }
        out[`tile_${ox}_${oy}_tile_a`] = { W, H, data: b64(t) }
        out[`tile_${ox}_${oy}_orig_a`] = { W, H, data: b64(o) }
        out[`tile_${ox}_${oy}_load_b`] = { W, H, data: b64(b) }
        out[`tile_${ox}_${oy}_load_a`] = { W, H, data: b64(a) }
        out[`tile_${ox}_${oy}_cov_a`] = { W, H, data: b64(c) }
      }
    }
    return out
  })
  const fs = await import('node:fs')
  fs.mkdirSync(join(out, 'field' + sub), { recursive: true })
  for (const [name, { W, H, data }] of Object.entries(dump)) {
    fs.writeFileSync(join(out, 'field' + sub, name + '.pgm'), Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), Buffer.from(data, 'base64')]))
  }
  console.log('field dump', Object.keys(dump).length)
}
const rejoin = async () => {
  await page.reload()
  await wait(1500)
  const inp = page.locator('input[type="text"]').first()
  if (await inp.count()) {
    await inp.fill('rig')
    await page.getByRole('button', { name: /join/i }).first().click()
  }
  await waitEngine()
  await wait(2000)
}

const mixOf = (def) => 'normal:' + (process.env.WC_MIX || def) + ':PB29:round'
const WATER = 'normal:100:0:PB29:round'
const PAINT = 'normal:100:100:PB29:round'
const BLUE = [0.165, 0.231, 0.592]
const YELLOW = [1.0, 0.878, 0.0]
const size = +(process.env.WC_SIZE || 60)
const steps = +(process.env.WC_STEPS || 60)

if (scenario === 'mix') {
  await setup({ preset: WATER, color: BLUE, size: 70 })
  for (let i = 0; i < 4; i++) { await stroke([[400, 300 + i * 55], [720, 300 + i * 55]]); await wait(150) }
  await wait(600); await shot('a1_puddle')
  await setup({ preset: PAINT, color: BLUE, size: 44 })
  await stroke([[440, 400], [600, 400]], 40); await wait(2300); await shot('a3_blue_settled')
  await setup({ preset: PAINT, color: YELLOW, size: 44 })
  await stroke([[520, 420], [690, 420]], 40); await wait(2800); await shot('a5_both_settled')
  await wait(32000); await shot('a6_dry')
}
if (scenario === 'own') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[300, 700], [900, 720]], 20)
  await wait(300); await shot('b1_own_live'); await wait(2500); await shot('b2_own_settled')
  if (process.env.WC_WAIT) { await wait(+process.env.WC_WAIT); await shot('b3_own_later') }
}
if (scenario === 'colours') {
  // A blue blob, then (after WC_WAIT ms - damp by default) a loaded yellow
  // stroke across it: Ilya's "печеньки в печеньке" and the rainbow fringe.
  await setup({ preset: mixOf('100:100'), color: BLUE, size: 80 })
  await stroke([[520, 480], [700, 480], [700, 520], [520, 520]], 14)
  await wait(+(process.env.WC_WAIT || 6000)); await shot('c1_blue')
  await setup({ preset: mixOf('100:100'), color: YELLOW, size: 60 })
  await stroke([[560, 420], [640, 580]], 14)
  await wait(3000); await shot('c2_yellow_settled')
  await wait(+(process.env.WC_WAIT2 || 15000)); await shot('c3_later')
}
if (scenario === 'graded') {
  // A graded wash: five passes, pigment falling 100 -> 0, each laid into the
  // previous while wet - the classic sky.
  for (const [i, p] of [100, 70, 45, 20, 0].entries()) {
    await setup({ preset: mixOf('100:' + p), color: BLUE, size: 96 })
    await stroke([[400, 300 + i * 40], [800, 300 + i * 40]], 14); await wait(400)
    console.log('settle', i, JSON.stringify(await page.evaluate(() => globalThis.__wcSettle || null)))
  }
  await wait(+(process.env.WC_WAIT || 20000)); await shot('gr1_graded')
}
if (scenario === 'dry') {
  await setup({ preset: mixOf('22:100'), color: BLUE, size: 56 })
  await stroke([[150, 650], [400, 600], [700, 700], [1000, 620], [1350, 690]], 16)
  await wait(2500); await shot('d1_dry_line')
}
if (scenario === 'backrun') {
  // Series 2 of Ilya's photos: much water, little pigment, one stroke - the
  // puddle at the start dries with a ragged boundary against the paler body.
  await setup({ preset: mixOf('100:35'), color: BLUE, size })
  await stroke([[300, 500], [1000, 510]], 24)
  await wait(3500); await shot('k1_settled')
  await wait(+(process.env.WC_WAIT || 15000)); await shot('k2_later')
}
if (scenario === 'long') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size: 40 })
  await stroke([[200, 500], [1400, 500]], steps)
  await wait(2500); await shot('g1_long')
  if (process.env.WC_WAIT) { await wait(+process.env.WC_WAIT); await shot('g2_long_later') }
}
if (scenario === 'puddle-dab') {
  // A clean puddle laid in one gesture, then (after WC_WAIT ms) one loaded dab into it.
  await setup({ preset: WATER, color: BLUE, size: 64 })
  await stroke([[400, 300], [800, 300], [400, 360], [800, 360], [400, 420], [800, 420], [400, 480], [800, 480]], 14)
  await wait(+(process.env.WC_WAIT || 400)); await shot('e1_puddle')
  await setup({ preset: mixOf('100:100'), color: BLUE, size: 44 })
  const dy = +(process.env.WC_DAB_Y || 390)
  await stroke([[600, dy], [612, dy + 2]], 6)
  await wait(3000); await shot('e2_dab_settled')
  if (process.env.WC_WAIT2) { await wait(+process.env.WC_WAIT2); await shot('e3_dab_later') }
}
if (scenario === 'wash-dab') {
  // A pigmented wash, left to dry for WC_WAIT ms, then a wet dab into it:
  // the bloom scenario (reference bloom_sf_2629/2630, bloom_wa_drop).
  // Overlapping passes (nib ~ size/1.6 under the mouse's pressure): four
  // 64 px strokes 50 px apart left 10 px gaps that read as white holes.
  await setup({ preset: mixOf('100:60'), color: BLUE, size: +(process.env.WC_WASH_SIZE || 96) })
  for (const y of [300, 340, 380, 420, 460]) { await stroke([[400, y], [800, y]], 14); await wait(120) }
  for (let coat = 1; coat < +(process.env.WC_WASH_COATS || 1); coat++) {
    await wait(+(process.env.WC_WAIT || 12000))
    for (const y of [300, 340, 380, 420, 460]) { await stroke([[400, y], [800, y]], 14); await wait(120) }
  }
  await wait(+(process.env.WC_WAIT || 12000)); await shot('h1_wash')
  console.log('wet before drop', JSON.stringify(await page.evaluate(() => {
    const e = window.__engine, now = performance.now()
    const cells = e._paperWet.cellsOf(e._activeId, now)
    let mx = 0; for (const c of cells) if (c.w > mx) mx = c.w
    const hist = [0, 0, 0, 0, 0]; for (const c of cells) hist[Math.min(4, Math.floor(c.w * 5))]++
    return { cells: cells.length, max: +mx.toFixed(3), hist, peak: +e._paperWet.peak(now).toFixed(3) }
  })))
  await setup({ preset: process.env.WC_DAB || WATER, color: BLUE, size: +(process.env.WC_DAB_SIZE || 60) })
  await stroke([[600, 400], [612, 402]], 6)
  console.log('drop op', JSON.stringify(await page.evaluate(() => { const op = window.__engine.getOperations().at(-1); return { wet: op.wet, dabs: op.dabs ? op.dabs.length : (op.packed ? op.packed.length : null), keys: Object.keys(op) } })))
  await wait(3000); await shot('h2_dab_settled')
  await wait(+(process.env.WC_WAIT2 || 20000)); await shot('h3_dab_later')
}
if (scenario === 'wash-water-timeline') {
  // (s17.30) What Ilya SEES while drawing: a pigmented wash, then clean
  // water dabs into it, screenshots on a timeline after each dab and one
  // mid-gesture of a slow water stroke across the wash.
  await setup({ preset: mixOf('100:70'), color: BLUE, size: 96 })
  const probe = async (tag) => console.log(tag, JSON.stringify(await page.evaluate(() => { const s = globalThis.__wcSettle; return s ? { bloom: +s.bloom.toFixed(2), landedWet: +s.landedWet.toFixed(2), wetPeak: +s.wetPeak.toFixed(2), merge: +s.merge.toFixed(2) } : null })))
  for (const y of [300, 340, 380, 420, 460].slice(0, +(process.env.WC_PASSES || 5))) { await stroke([[400, y], [800, y]], 14); await wait(+(process.env.WC_PASS_WAIT || 120)); await probe('pass ' + y) }
  await wait(+(process.env.WC_WAIT || 4000)); await shot('w0_wash')
  if (!process.env.WC_STOP_AFTER_WASH) {
  await setup({ preset: WATER, color: BLUE, size: 56 })
  await stroke([[520, 380], [530, 384]], 6)
  await wait(200); await probe('dab1')
  let t = 200
  for (const at of [150, 500, 1000, 1800, 3000]) { await wait(at - t); t = at; await shot('w1_dab_' + at) }
  await stroke([[680, 380], [690, 384]], 6)
  await wait(3000); await shot('w2_second_dab')
  // A slow water stroke across the wash: screenshot while the pen is still down.
  const box2 = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box2.x + 420, box2.y + 440); await page.mouse.down()
  for (let i = 1; i <= 20; i++) { await page.mouse.move(box2.x + 420 + i * 18, box2.y + 440 + Math.sin(i / 3) * 6); await wait(60) }
  await shot('w3_mid_gesture'); await page.mouse.up()
  await wait(3000); await shot('w4_after_gesture')
  }
}
if (scenario === 'section') {
  // The long stroke, then straight to the deposit cross-section (no
  // screenshot: the field is released 8 s after the settle).
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[200, 500], [1400, 500]], steps)
  await wait(600)
}
if (scenario === 'blot') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[500, 500], [760, 500]], 30)
  await wait(700)
  if (process.env.WC_SHOT) { await shot('blot') }
  if (process.env.WC_SHOTS) { let t = 0; for (const at of process.env.WC_SHOTS.split(',').map(Number)) { await wait(at - t); t = at; await shot('blot_' + at) } }
}
if (scenario === 'perf') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await page.evaluate(() => window.__gpuProf && window.__gpuProf.reset())
  const t0 = Date.now()
  await stroke([[300, 500], [1300, 520]], steps)
  const strokeMs = Date.now() - t0
  await wait(400)
  const live = await page.evaluate(() => window.__gpuProf && window.__gpuProf.report())
  const hud = await engine('return e.getWatercolorPerf ? e.getWatercolorPerf() : null')
  console.log('perf live', JSON.stringify({ size, steps, strokeMs, hud, ...live }))
  await page.evaluate(() => window.__gpuProf && window.__gpuProf.reset())
  await wait(2500)
  const after = await page.evaluate(() => window.__gpuProf && window.__gpuProf.report())
  console.log('perf after (2.5 s)', JSON.stringify(after))
}
if (scenario === 'parity') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[300, 500], [1300, 520]], steps)
  await wait(3500)
  const live = await readLayer()
  await shot('parity_live')
  if (process.env.WC_FIELD_DUMP) await dumpFields('_live')
  await rejoin()
  await wait(3500)
  const replay = await readLayer()
  await shot('parity_replay')
  if (process.env.WC_FIELD_DUMP) await dumpFields('_replay')
  const report = {}
  for (const key of new Set([...Object.keys(live), ...Object.keys(replay)])) {
    const a = live[key], b = replay[key]
    if (!a || !b) { report[key] = { missing: !a ? 'live' : 'replay' }; continue }
    let diff = 0, maxd = 0
    for (let i = 0; i < a.samples.length; i++) { const d = Math.abs(a.samples[i] - b.samples[i]); if (d) diff++; if (d > maxd) maxd = d }
    report[key] = { liveSumA: a.sumA, replaySumA: b.sumA, nzA: a.nzA, samples: a.samples.length, differing: diff, maxDiff: maxd }
  }
  console.log('parity', JSON.stringify({ size, tiles: report }))
}
// Live vs reload for one V-shaped stroke (WC_PTS overrides the points).
if (scenario === 'parityv') {
  await setup({ preset: mixOf(process.env.WC_MIX || '100:70'), color: BLUE, size })
  await stroke(JSON.parse(process.env.WC_PTS || '[[100,900],[750,150],[1500,850]]'), steps)
  await wait(4500)
  const live = await readLayer()
  await shot('pv_live')
  if (process.env.WC_FIELD_DUMP) await dumpFields('_live')
  await rejoin()
  await wait(4500)
  const replay = await readLayer()
  await shot('pv_replay')
  if (process.env.WC_FIELD_DUMP) await dumpFields('_replay')
  const report = {}
  for (const key of new Set([...Object.keys(live), ...Object.keys(replay)])) {
    const a = live[key], b = replay[key]
    if (!a || !b) { report[key] = { missing: !a ? 'live' : 'replay' }; continue }
    let diff = 0, maxd = 0
    for (let i = 0; i < a.samples.length; i++) { const d = Math.abs(a.samples[i] - b.samples[i]); if (d > 2) diff++; if (d > maxd) maxd = d }
    report[key] = { liveSumA: a.sumA, replaySumA: b.sumA, differingOver2: diff, maxDiff: maxd }
  }
  console.log('parityv', JSON.stringify({ size, tiles: report }))
}
// Live vs reload for a zigzag, a second stroke laid straight into it
// (WC_JOIN=0 dries everything between them, so the second opens its own wash).
if (scenario === 'parityzz') {
  await setup({ preset: mixOf('100:60'), color: BLUE, size })
  await stroke([[300, 400], [500, 1200], [700, 400], [900, 1200]], steps)
  if (process.env.WC_JOIN === '0') await page.evaluate(() => window.__engine.watercolorDryAll())
  await wait(300)
  await stroke([[400, 800], [1100, 700], [1300, 1100]], steps)
  await wait(4500)
  const live = await readLayer()
  await shot('pzz_live')
  await rejoin()
  await wait(4500)
  const replay = await readLayer()
  await shot('pzz_replay')
  const report = {}
  for (const key of new Set([...Object.keys(live), ...Object.keys(replay)])) {
    const a = live[key], b = replay[key]
    if (!a || !b) { report[key] = { missing: !a ? 'live' : 'replay' }; continue }
    let diff = 0, maxd = 0
    for (let i = 0; i < a.samples.length; i++) { const d = Math.abs(a.samples[i] - b.samples[i]); if (d > 2) diff++; if (d > maxd) maxd = d }
    report[key] = { samples: a.samples.length, differingOver2: diff, maxDiff: maxd }
  }
  console.log('parityzz', JSON.stringify({ size, join: process.env.WC_JOIN !== '0', tiles: report }))
}
if (scenario === 'black') {
  // Full water, full pigment: how dark a black stroke's body comes out against
  // a blue one (Ilya: "чёрный получается слишком серым"). Mean alpha over the
  // painted texels, per stroke, read straight off the layer.
  const mean = async () => { const r = await readLayer(); let s = 0, n = 0; for (const t of Object.values(r)) { s += t.sumA; n += t.nzA }; return n ? +(s / n).toFixed(1) : 0 }
  await setup({ preset: mixOf('100:100'), color: [0.02, 0.02, 0.02], size })
  await stroke([[300, 300], [1300, 320]], steps); await wait(4000)
  const black = await mean(); await shot('black')
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[300, 600], [1300, 620]], steps); await wait(4000)
  const both = await mean()
  console.log('black', JSON.stringify({ blackMeanA: black, bothMeanA: both }))
}
if (scenario === 'undo') {
  // How long one Ctrl+Z takes on a layer of a few washes (Ilya: "undo виснет,
  // тормозит, иногда не срабатывает"). Wall time around the key press, which
  // returns after the synchronous rebuild.
  const n = +(process.env.WC_UNDO_N || 6)
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  for (let i = 0; i < n; i++) { await stroke([[300, 200 + i * 110], [1300, 220 + i * 110]], steps); await wait(2500) }
  await wait(3000)
  const before = await readLayer()
  const times = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    await page.keyboard.press('Control+z')
    const t1 = Date.now()
    await wait(300)
    times.push(t1 - t0)
  }
  const after = await readLayer()
  const sum = (r) => Object.values(r).reduce((a, t) => a + t.sumA, 0)
  console.log('undo', JSON.stringify({ strokes: n, pressMs: times, sumBefore: sum(before), sumAfter3: sum(after), perf: await page.evaluate(() => window.__engine.getWatercolorPerf()) }))
}
if (scenario === 'hud') {
  await setup({ preset: mixOf('100:100'), color: BLUE, size })
  await stroke([[300, 500], [1300, 520]], steps)
  await wait(500); await shot('hud_live')
  const hud = await engine('return e.getWatercolorPerf ? e.getWatercolorPerf() : null')
  console.log('hud', JSON.stringify(hud))
}
if (process.env.WC_SECTION) {
  // Deposit cross-section through the wettest column of the wash: inkLoad .a
  // (deposit) and .b (pigment) and coverage .b (water), 1 px steps.
  const sec = await page.evaluate(() => {
    const e = window.__engine
    const w = e._wash
    if (!w) return 'no wash'
    const out = []
    for (const [buf, entry] of w.scratch._tiles) {
      if (!entry.inkLoad) continue
      const W = buf.width, H = buf.height
      const load = entry.inkLoad.readPixels(), cov = entry.coverage.readPixels()
      let best = -1, bi = 0
      for (let i = 0; i < W * H; i++) { const a = load[i * 4 + 3]; if (a > best) { best = a; bi = i } }
      const x = bi % W, y0 = Math.floor(bi / W)
      const col = []
      for (let dy = -36; dy <= 36; dy++) { const y = y0 + dy; if (y < 0 || y >= H) continue; const i = (y * W + x) * 4; col.push([dy, load[i + 3], load[i + 2], cov[i + 2]]) }
      const row = []
      for (let dx = -60; dx <= 60; dx += 2) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const i = (y0 * W + xx) * 4; row.push([dx, load[i + 3], load[i + 2], cov[i + 2]]) }
      // Averaged cross-section over the body: columns x+20..x+80 (to the
      // right of the peak, along the stroke), deposit .a per dy.
      const avg = []
      for (let dy = -40; dy <= 40; dy++) { const y = y0 + dy; if (y < 0 || y >= H) continue; let sum = 0, n = 0; for (let dx = 20; dx <= 80; dx++) { const xx = x + dx; if (xx >= W) continue; sum += load[(y * W + xx) * 4 + 3]; n++ } avg.push([dy, +(sum / n).toFixed(1)]) }
      out.push({ tile: [W, H], at: [x, y0], peak: best, col, row, avg })
    }
    return out
  })
  console.log('section', JSON.stringify(sec))
  const fld = await page.evaluate(() => {
    const f = window.__engine._diffuseField
    if (!f) return 'no field'
    const stats = (buf, ch) => { const px = buf.readPixels(); let n = 0, mx = 0, sum = 0; for (let i = ch; i < px.length; i += 4) { if (px[i]) { n++; sum += px[i] }; if (px[i] > mx) mx = px[i] } return { nonzero: n, max: mx, mean: n ? +(sum / n).toFixed(1) : 0 } }
    const W = f.w, H = f.h
    // Centre the profiles on the band texture (the operation's footprint).
    const bpx = f.band.readPixels()
    let sx = 0, sy = 0, n = 0
    for (let i = 0; i < W * H; i++) if (bpx[i * 4 + 1]) { sx += i % W; sy += Math.floor(i / W); n++ }
    const x = n ? Math.round(sx / n) : Math.floor(W / 2), cy = n ? Math.round(sy / n) : Math.floor(H / 2)
    const insideN = n
    const prof = (buf, ch) => { const px = buf.readPixels(); const rows = []; for (let y = Math.max(0, cy - 40); y < Math.min(H, cy + 40); y++) { rows.push([y - cy, px[(y * W + x) * 4 + ch]]) } return rows }
    return { w: W, h: H, centre: [x, cy], insideN, mask_r: stats(f.mask, 0), band_r: stats(f.band, 0), inside_g: stats(f.band, 1), cost_r: stats(f.pressure, 0), a_a: stats(f.a, 3), b_a: stats(f.b, 3),
      col_cost: prof(f.pressure, 0), col_band: prof(f.band, 0), col_inside: prof(f.band, 1), col_blurband: prof(f.mask, 0), col_cov_a: prof(f.coverage, 3), col_cov_b: prof(f.coverage, 2), col_a: prof(f.a, 3), col_b: prof(f.b, 3) }
  })
  console.log('field', JSON.stringify(fld))
  console.log('settle', JSON.stringify(await page.evaluate(() => globalThis.__wcSettle || null)))
}
if (process.env.WC_COL) {
  // A full-height column of every record at world x = WC_COL (tile-local
  // once the tile's origin is taken off): inkLoad .a .b, inkColor .a,
  // coverage .r .b .a, composited tile .a - to find where a wash goes white.
  const X = +process.env.WC_COL
  const col = await page.evaluate((X) => {
    const e = window.__engine
    const w = e._wash
    if (!w) return 'no wash'
    const out = []
    const layer = e._layers.get(e._activeId)
    const origins = new Map()
    for (const t of layer.allResident()) origins.set(t.buffer, [t.originX, t.originY])
    for (const [buf, entry] of w.scratch._tiles) {
      if (!entry.inkLoad) continue
      const W = buf.width, H = buf.height
      const [ox, oy] = origins.get(buf) || [0, 0]
      const load = entry.inkLoad.readPixels(), cov = entry.coverage.readPixels(), colr = entry.inkColor ? entry.inkColor.readPixels() : null, tile = buf.readPixels()
      // X < 0: the column with the most deposit (a drop's centre).
      let x = X - ox
      if (X < 0) { let best = -1; for (let cx = 0; cx < W; cx++) { let sum = 0; for (let y = 0; y < H; y++) sum += load[(y * W + cx) * 4 + 3]; if (sum > best) { best = sum; x = cx } } }
      if (x < 0 || x >= W) continue
      const rows = []
      for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; rows.push([y + oy, load[i + 3], load[i + 2], colr ? colr[i + 3] : -1, cov[i], cov[i + 2], cov[i + 3], tile[i + 3]]) }
      out.push({ origin: [ox, oy], size: [W, H], x: x + ox, rows })
    }
    return out
  }, X)
  console.log('column', JSON.stringify(col))
}
if (process.env.WC_FIELD_DUMP && scenario !== 'parity') await dumpFields('')
console.log('errors', JSON.stringify(errors.slice(0, 8)))
await browser.close()

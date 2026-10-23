// A/B pixel rig for #494. Usage: node temp/ab494/rig.mjs <label> [goldenDir]
// Writes temp/ab494/out/<label>/*. With goldenDir, also replays the op logs
// recorded in <goldenDir>/ops_{bounded,infinite}.json into fresh rooms.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const B = 'https://localhost:5651'
const label = process.argv[2]
const golden = process.argv[3]
const OUT = path.join('temp/ab494/out', label)
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

// Deterministic pointer timestamps: stroke speed is derived from
// PointerEvent.timeStamp, which otherwise follows the wall clock of the run.
await ctx.addInitScript(() => {
  const desc = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp')
  const seen = new WeakMap()
  let n = 0
  Object.defineProperty(Event.prototype, 'timeStamp', {
    configurable: true,
    get() {
      if (!(this instanceof MouseEvent)) return desc.get.call(this)
      let v = seen.get(this)
      if (v === undefined) { v = 1000 + 8 * (++n); seen.set(this, v) }
      return v
    },
  })
})

const log = (...a) => console.log(`[${label}]`, ...a)

async function idle(page, ms = 2500) {
  await page.bringToFront()
  await page.waitForTimeout(ms)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.waitForTimeout(300)
}

async function newPage() {
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') log('CONSOLE', m.text().slice(0, 200)) })
  page.on('pageerror', e => log('PAGEERROR', String(e).slice(0, 300)))
  return page
}

async function waitEngine(page) {
  await page.waitForFunction(() => globalThis.__engine && globalThis.__roomStore && globalThis.__roomStore.getState().room, null, { timeout: 90000 })
  await page.evaluate(() => globalThis.__engine.paperReady())
  await idle(page, 4000)
}

async function openBounded(page) {
  await page.goto(B + '/create')
  await page.waitForSelector('input[type=text]')
  await page.fill('input[type=text]', 'ab-bounded')
  await page.click('button[type=submit]')
  await waitEngine(page)
}

async function openInfinite(page) {
  await page.goto(B + '/create')
  await page.waitForSelector('input[type=text]')
  await page.evaluate(() => {
    const id = 'inf' + Math.random().toString(36).slice(2, 7)
    const state = { usr: { room: { id, name: 'ab-inf', paper: 'fine', paperColor: '#fdfdfc', infinite: true, classVisibility: 'teacher_only' } }, key: 'abk', idx: (history.state?.idx ?? 0) + 1 }
    history.pushState(state, '', '/room/' + id)
    dispatchEvent(new PopStateEvent('popstate', { state }))
  })
  await waitEngine(page)
}

async function stroke(page, pts, steps = 40) {
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    for (let s = 1; s <= steps; s++) {
      await page.mouse.move(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps)
    }
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

async function setTool(page, t) {
  await page.evaluate(t => globalThis.__roomStore.getState().setTool(t), t)
  await page.waitForTimeout(400)
}

async function setVp(page, vp) {
  await page.evaluate(vp => globalThis.__roomStore.getState().setViewport(vp), vp)
}

function saveDataUrl(name, url) {
  if (!url) { log('NULL', name); fs.writeFileSync(path.join(OUT, name + '.null'), ''); return }
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'))
}

async function capView(page, name) {
  await idle(page)
  const url = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)
    return cs[0] ? cs[0].toDataURL('image/png') : null
  })
  saveDataUrl(name + '.canvas', url)
  // Canvas area of the room page (left toolbar .. right panel).
  await page.screenshot({ path: path.join(OUT, name + '.screen.png'), clip: { x: 124, y: 52, width: 855, height: 748 } })
}

async function capExports(page, prefix) {
  await idle(page)
  const r = await page.evaluate(async () => {
    const toUrl = b => b ? new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b) }) : null
    const e = globalThis.__engine
    return {
      png: await toUrl(await e.exportPNG()),
      pngT: await toUrl(await e.exportPNG(true)),
      prev: await toUrl(await e.bakePreview()),
      prev800: await toUrl(await e.bakePreview(800)),
    }
  })
  saveDataUrl(prefix + '.exportPNG', r.png)
  saveDataUrl(prefix + '.exportPNG_transparent', r.pngT)
  saveDataUrl(prefix + '.bakePreview320', r.prev)
  saveDataUrl(prefix + '.bakePreview800', r.prev800)
}

// Image as a data URL, generated deterministically in-page.
async function makeImage(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 160
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 240, 160); grd.addColorStop(0, '#ff3300'); grd.addColorStop(1, '#0044ff')
    g.fillStyle = grd; g.fillRect(0, 0, 240, 160)
    g.fillStyle = 'rgba(0,160,0,0.7)'; g.fillRect(60, 40, 120, 80)
    return c.toDataURL('image/png')
  })
}

async function appendOps(page, ops, source) {
  await page.evaluate(async ({ ops, source }) => {
    const e = globalThis.__engine
    await e.preloadImages(ops)
    for (const op of ops) e.appendOperation(op, source)
  }, { ops, source })
}

function syntheticOps(userId, layerId, img, base) {
  const t = 1790000000000
  const b = base // {x,y} world origin for the shapes
  return {
    image: [{ id: 'ab-img', userId, timestamp: t, type: 'image_import', layerId, image: img, width: 240, height: 160, ...(b.infinite ? { x: b.x + 300, y: b.y - 200 } : {}) }],
    shapes: [
      { id: 'ab-rect', userId, timestamp: t + 1, type: 'shape', layerId, geometry: { kind: 'rectangle', cornerRadius: 12 },
        frame: { x: b.x, y: b.y, width: 300, height: 180, angle: 0.3 }, stroke: { color: [0.8, 0.1, 0.2], width: 8, align: 'center', join: 'round' }, fill: { color: [0.2, 0.6, 0.9] } },
      { id: 'ab-ell', userId, timestamp: t + 2, type: 'shape', layerId, geometry: { kind: 'ellipse', startAngle: 0, endAngle: Math.PI * 2, innerRadius: 0, closePath: true },
        frame: { x: b.x + 150, y: b.y + 120, width: 260, height: 160, angle: 0 }, stroke: { color: [0.1, 0.5, 0.1], width: 6, align: 'inside', join: 'miter' }, fill: null },
      { id: 'ab-star', userId, timestamp: t + 3, type: 'shape', layerId, geometry: { kind: 'polystar', points: 5, innerRadius: 0.45, rotation: 0.2 },
        frame: { x: b.x - 200, y: b.y + 250, width: 200, height: 200, angle: 0 }, stroke: null, fill: { color: [0.9, 0.7, 0.1] } },
    ],
    filter: [{ id: 'ab-filter', userId, timestamp: t + 4, type: 'layer_filter', layerId, filter: { kind: 'hsl', hue: 40, saturation: -20, lightness: 5 } }],
    blur: [{ id: 'ab-blur', userId, timestamp: t + 5, type: 'layer_filter', layerId, filter: { kind: 'gaussian_blur', radius: 3 } }],
  }
}

// ---------- bounded, live ----------
async function boundedLive() {
  const page = await newPage()
  await openBounded(page)
  const st = await page.evaluate(() => { const s = globalThis.__roomStore.getState(); return { vp: s.viewport, room: s.room, userId: s.userId, layers: Object.keys(s.layerState.items) } })
  log('bounded', JSON.stringify(st))
  const fitted = st.vp
  const img = await makeImage(page)
  const ops = syntheticOps(st.userId, 'layer-1', img, { x: 500, y: 700 })
  await appendOps(page, ops.image, 'local')
  await idle(page)

  // canvas area on screen at fitted zoom ~ x 391..889, y 52..752
  await setTool(page, 'pencil')
  for (let i = 0; i < 6; i++) await stroke(page, [[430, 150 + i * 30], [560, 180 + i * 30], [700, 140 + i * 30], [840, 200 + i * 30]])
  await stroke(page, [[450, 120], [500, 400], [620, 600], [800, 700]])
  await setTool(page, 'smudge')
  await stroke(page, [[420, 250], [600, 230], [860, 260]])
  await stroke(page, [[640, 110], [650, 450]])
  await setTool(page, 'marker')
  await stroke(page, [[420, 480], [600, 520], [860, 470]])
  await setTool(page, 'liner')
  await stroke(page, [[420, 560], [620, 640], [860, 580]])
  await setTool(page, 'charcoal')
  await stroke(page, [[430, 700], [860, 690]])
  // (494-stamp) the eraser is a stamp tool too — cut across pencil and charcoal.
  await setTool(page, 'eraser')
  await stroke(page, [[700, 120], [720, 720]])
  await setTool(page, 'pencil')
  await capView(page, 'b1_strokes_fitted')

  await appendOps(page, ops.shapes, 'local')
  await capView(page, 'b2_shapes_fitted')
  await appendOps(page, ops.filter, 'local')
  await capView(page, 'b3_filter_fitted')

  // zoom 1 on a stroke: world ~ (600, 700)
  await setVp(page, { cx: 640 - (600 - st.room.width / 2), cy: 400 - (700 - st.room.height / 2), zoom: 1, angle: 0 })
  await capView(page, 'b4_zoom1')
  await setVp(page, { cx: fitted.cx + 120, cy: fitted.cy - 60, zoom: 0.55, angle: 0.5 })
  await capView(page, 'b5_rot_pan')
  await setVp(page, fitted)
  await capExports(page, 'b6')
  const all = await page.evaluate(() => globalThis.__engine.getOperations())
  fs.writeFileSync(path.join(OUT, 'ops_bounded.json'), JSON.stringify(all))
  await page.close()
}

// ---------- infinite, live ----------
async function infiniteLive() {
  const page = await newPage()
  await openInfinite(page)
  const st = await page.evaluate(() => { const s = globalThis.__roomStore.getState(); return { vp: s.viewport, room: s.room, userId: s.userId, layers: Object.keys(s.layerState.items) } })
  log('infinite', JSON.stringify(st))
  const v0 = st.vp
  const img = await makeImage(page)

  await setTool(page, 'pencil')
  // long strokes across the whole screen at zoom as opened, then zoomed out
  for (let i = 0; i < 4; i++) await stroke(page, [[160, 120 + i * 60], [560, 300 + i * 40], [940, 160 + i * 60]])
  await stroke(page, [[550, 70], [540, 780]])
  await setVp(page, { ...v0, zoom: v0.zoom * 0.4 })
  await idle(page)
  await stroke(page, [[140, 400], [960, 420]])
  await stroke(page, [[300, 60], [320, 790]])
  await stroke(page, [[800, 60], [780, 790]])
  await setTool(page, 'smudge')
  await stroke(page, [[200, 300], [900, 330]])
  await setTool(page, 'marker')
  await stroke(page, [[200, 600], [900, 560]])
  await setTool(page, 'pencil')
  await idle(page)
  const cb = await page.evaluate(() => globalThis.__engine.getContentBounds('layer-1'))
  log('infinite content bounds', JSON.stringify(cb))
  const ops = syntheticOps(st.userId, 'layer-1', img, { x: Math.round(cb.x + cb.width / 2 - 150), y: Math.round(cb.y + cb.height / 2 - 90), infinite: true })
  await appendOps(page, [...ops.image, ...ops.shapes], 'local')
  await capView(page, 'i1_zoomout')
  await appendOps(page, ops.filter, 'local')
  await capView(page, 'i2_filter_zoomout')
  await setVp(page, v0)
  await capView(page, 'i3_initial')
  await setVp(page, { ...v0, cx: v0.cx - 300, cy: v0.cy + 200, zoom: v0.zoom * 1.7, angle: -0.4 })
  await capView(page, 'i4_rot_pan_zoom')
  await capExports(page, 'i5')
  const all = await page.evaluate(() => globalThis.__engine.getOperations())
  fs.writeFileSync(path.join(OUT, 'ops_infinite.json'), JSON.stringify(all))
  await page.close()
}

// ---------- replay of a recorded log ----------
async function replay(kind) {
  const ops = JSON.parse(fs.readFileSync(path.join(golden, `ops_${kind}.json`), 'utf8'))
  const page = await newPage()
  if (kind === 'bounded') await openBounded(page); else await openInfinite(page)
  const v0 = await page.evaluate(() => globalThis.__roomStore.getState().viewport)
  // strokes first, then the rest, each as a remote op (a peer's history)
  await appendOps(page, ops, 'remote')
  await idle(page, 6000)
  const p = kind === 'bounded' ? 'rb' : 'ri'
  await capView(page, p + '1_fitted')
  if (kind === 'bounded') {
    await setVp(page, { cx: v0.cx + 120, cy: v0.cy - 60, zoom: 0.55, angle: 0.5 })
  } else {
    await setVp(page, { ...v0, cx: v0.cx - 300, cy: v0.cy + 200, zoom: v0.zoom * 0.5, angle: -0.4 })
  }
  await capView(page, p + '2_rot_pan')
  await setVp(page, v0)
  await capExports(page, p + '3')
  await page.close()
}


// ---------- rejoin from a stored snapshot (494-snapshot-io) ----------
async function fillAndSubmit(page) {
  const input = page.locator('form input[type="text"]').first()
  await input.waitFor({ timeout: 30000 })
  if (!(await input.inputValue())) await input.fill('Rejoiner')
  await page.locator('form button[type="submit"]').click()
}

async function snapshotState(page, roomId) {
  return page.evaluate(async (roomId) => {
    const r = await fetch(`/api/rooms/${roomId}/snapshots/index`)
    if (r.status !== 200) return { status: r.status }
    const idx = await r.json()
    const blobs = {}
    for (const l of idx.layers) {
      const b = new Uint8Array(await (await fetch(`/api/rooms/${roomId}/snapshots/${l.layerId}/${l.seq}`)).arrayBuffer())
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b))
      blobs[l.layerId] = { bytes: b.length, sha: [...h].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16) }
    }
    return { status: 200, idx, blobs }
  }, roomId)
}

async function engineState(page) {
  return page.evaluate(() => {
    const e = globalThis.__engine
    const ops = e.getOperations(), since = e.getOperationsSinceRestore()
    return {
      ops: ops.length, strokes: ops.filter(o => o.type === 'stroke').length, sinceRestore: since.length,
      dirty: e.liveLayerIds().map(id => [id, e.isLayerDirty(id)]),
    }
  })
}

async function rejoin() {
  const page = await newPage()
  await openBounded(page)
  const roomId = new URL(page.url()).pathname.split('/').pop()
  await setTool(page, 'pencil')
  // 100 strokes past the boundary, then a tail of 6 more (pencil + charcoal)
  for (let i = 0; i < 100; i++) {
    const y = 150 + (i % 20) * 28
    const x = 420 + Math.floor(i / 20) * 90
    await stroke(page, [[x, y], [x + 60, y + 8]], 6)
  }
  let snap
  for (let t = 0; t < 120; t++) {
    snap = await snapshotState(page, roomId)
    if (snap.status === 200 && snap.idx.layers.length) break
    await page.waitForTimeout(1000)
  }
  log('snapshot', JSON.stringify(snap))
  await setTool(page, 'charcoal')
  for (let i = 0; i < 3; i++) await stroke(page, [[430, 650 + i * 25], [860, 640 + i * 25]], 20)
  await setTool(page, 'pencil')
  for (let i = 0; i < 3; i++) await stroke(page, [[450 + i * 120, 110], [480 + i * 120, 730]], 20)
  await page.waitForTimeout(1500)
  fs.writeFileSync(path.join(OUT, 'rj_snapshot.json'), JSON.stringify(snap, null, 1))
  const pre = await engineState(page)
  log('pre-reload', JSON.stringify(pre))
  await capView(page, 'rj0_before_reload')
  await capExports(page, 'rj0')

  // the same participant reloads: join prompt, click, restore
  await page.reload()
  await fillAndSubmit(page)
  await waitEngine(page)
  await idle(page, 6000)
  const post = await engineState(page)
  log('post-reload', JSON.stringify(post))
  await capView(page, 'rj1_after_reload')
  await capExports(page, 'rj1')

  // a fresh participant joins through the gate
  const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const p2 = await ctx2.newPage()
  p2.on('pageerror', e => log('PAGEERROR2', String(e).slice(0, 300)))
  await p2.goto(B + '/room/' + roomId)
  await fillAndSubmit(p2)
  await waitEngine(p2)
  await idle(p2, 6000)
  const joiner = await engineState(p2)
  log('joiner', JSON.stringify(joiner))
  // same viewport as the teacher's fitted view
  const OUT2 = OUT
  await idle(p2)
  const url = await p2.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)
    return cs[0] ? cs[0].toDataURL('image/png') : null
  })
  saveDataUrl('rj2_joiner.canvas', url)
  const r = await p2.evaluate(async () => {
    const b = await globalThis.__engine.exportPNG()
    return b ? new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b) }) : null
  })
  saveDataUrl('rj2.exportPNG', r)
  fs.writeFileSync(path.join(OUT2, 'rj_state.json'), JSON.stringify({ pre, post, joiner }, null, 1))
  await ctx2.close()
  await page.close()
}

const only = process.env.ONLY
if (!only || only === 'live' || only === 'all') { await boundedLive(); await infiniteLive() }
if (golden && only !== 'rejoin') { await replay('bounded'); await replay('infinite') }
if (only === 'rejoin' || only === 'all') await rejoin()
await browser.close()
log('done')

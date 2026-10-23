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
const onlyLayer = process.env.WC_LAYER
let play = ops.filter(o => (o.type === 'layer_add' || o.type === 'stroke') && !undone.has(o.id) && (!onlyLayer || o.type !== 'stroke' || o.layerId === onlyLayer))
// WC_UNTIL=<op id prefix>: stop right after that stroke (its settle is the one dumped).
if (process.env.WC_UNTIL) { const i = play.findIndex(o => o.type === 'stroke' && o.id.startsWith(process.env.WC_UNTIL)); if (i >= 0) play = play.slice(0, i + 1) }
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
  if (op.type === 'stroke') {
    n++; await page.waitForTimeout(+(process.env.WC_STEP || 350))
    const probe = await page.evaluate(() => { const s = globalThis.__wcSettle; const pf = globalThis.__engine.getWatercolorPerf(); return s ? { bloom: +s.bloom.toFixed(2), radiusPx: Math.round(s.radiusPx), landedWet: +s.landedWet.toFixed(2), wetPeak: +s.wetPeak.toFixed(2), merge: +s.merge.toFixed(2), settleMs: Math.round(pf.settleMs), settleOps: pf.settleOps, fieldMB: pf.fieldMB } : null })
    console.log('stroke', op.id.slice(0, 6), op.color.map(v => v.toFixed(1)).join(','), JSON.stringify(probe))
    if (process.env.WC_PROBE_ROWS) {
      const [px0, px1, py0, py1] = process.env.WC_PROBE_ROWS.split(',').map(Number)
      const rows = await page.evaluate(({ px0, px1, py0, py1, layerId }) => {
        const e = window.__engine; const layer = e._layers.get(layerId)
        const t = layer.allResident().find(t => t.originX <= px0 && px0 < t.originX + t.buffer.width && t.originY <= py0 && py0 < t.originY + t.buffer.height)
        if (!t) return null
        const px = t.buffer.readPixels(); const W = t.buffer.width, H = t.buffer.height
        const out = []
        for (let y = py0; y < py1; y++) { let sum = 0; for (let x = px0; x < px1; x++) sum += px[((H - 1 - (y - t.originY)) * W + (x - t.originX)) * 4 + 3]; out.push(Math.round(sum / (px1 - px0))) }
        return out.join(' ')
      }, { px0, px1, py0, py1, layerId: op.layerId })
      console.log('   rows', rows)
    }
  }
}
console.log('applied strokes', n, 'errors', JSON.stringify(errors.slice(0, 3)))
await page.waitForTimeout(+(process.env.WC_WAIT || 12000))
const dumpFields = async (sub = '') => {
  await page.evaluate(() => { const e = window.__engine; e._activeId = e._activeId || [...e._layers.keys()].pop() })
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
if (process.env.WC_FIELD_DUMP) await dumpFields('')
// WC_WASH_DUMP=1: every cached wash scratch's tile channels (load/dry/color/cov), as dumpwash.mjs.
if (process.env.WC_WASH_DUMP) {
  const dump = await page.evaluate(() => {
    const e = window.__engine
    const b64 = (arr) => { let s = ''; for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode.apply(null, arr.subarray(i, i + 8192)); return btoa(s) }
    const out = {}; const origins = new Map()
    for (const layer of e._layers.values()) for (const t of layer.allResident()) origins.set(t.buffer, [t.originX, t.originY])
    let wi = 0
    for (const chunk of e._replayRibbonChunks.values()) {
      const wash = chunk.strokeId.slice(0, 6)
      for (const [buf, entry] of chunk.scratch._tiles) {
        if (!entry.inkLoad) continue
        const [ox, oy] = origins.get(buf) || [0, 0]; const W = buf.width, H = buf.height
        const chans = { load: entry.inkLoad, dry: entry.inkDry, color: entry.inkColor, cov: entry.coverage }
        for (const [name, b] of Object.entries(chans)) {
          if (!b) continue
          const px = b.readPixels()
          for (const ch of [0, 1, 2, 3]) { const a = new Uint8Array(W * H); let nz = 0; for (let i = 0; i < W * H; i++) { a[i] = px[i * 4 + ch]; if (a[i]) nz++ } if (nz) out[`w${wi}_${wash}_${ox}_${oy}_${name}_${'rgba'[ch]}`] = { W, H, data: b64(a) } }
        }
      }
      wi++
    }
    return out
  })
  const fs = await import('node:fs')
  fs.mkdirSync(join(out, 'wash'), { recursive: true })
  for (const [name, { W, H, data }] of Object.entries(dump)) fs.writeFileSync(join(out, 'wash', name + '.pgm'), Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), Buffer.from(data, 'base64')]))
  console.log('wash dump', Object.keys(dump).length)
}
await page.screenshot({ path: join(out, 'room.png') })
const exportLayers = async (suffix = '') => {
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
    writeFileSync(join(out, `layer_${name}${suffix}.png`), Buffer.from(png, 'base64'))
  }
}
// WC_DRY=1: export the layer as it stands (the provisional dry target of every
// open wash), then dry every open wash explicitly (watercolorDryWash) and
// export again; WC_VIEW=wcOpDry gives the r17 per-operation drying instead.
if (process.env.WC_DRY) {
  await exportLayers('_wet')
  const dried = await page.evaluate(() => window.__engine.watercolorDryWash())
  console.log('dried washes', dried)
  await page.waitForTimeout(1500)
  if (process.env.WC_FIELD_DUMP) await dumpFields('_dry')
}
await exportLayers('')
console.log('exported')
await browser.close()

// Author parity, stroke by stroke: a fresh layer, round B's strokes one at a
// time, and after each a replay of that layer into a scratch buffer (empty
// chunk cache swapped in) compared with the live layer at full resolution.
// Usage: node authorbisect.mjs <page> [strokes=3] [gapMs=200] [seed=7]
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, nArg = '3', gapArg = '200', seedArg = '7', presetArg = ''] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const PRESETS = ['normal:100:0:PB29:round', 'normal:100:70:PB29:round', 'normal:60:100:PB29:round', 'normal:100:100:PB29:flex']
const pathRand = (r, n, box = [0.1, 0.1, 0.9, 0.9]) => Array.from({ length: n }, () => [box[0] + (box[2] - box[0]) * r(), box[1] + (box[3] - box[1]) * r()])

await ev(page, window_install())
const keys = async () => { const v = await ev(page, 'return [...window.__engine._layers.keys()].join(",")'); return String(v).split(',') }
const before = await keys()
await ev(page, `const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); b.click(); await new Promise(r => setTimeout(r, 2500)); return 'ok'`)
const lid = (await keys()).find(id => !before.includes(id))
console.log('layer', lid)

const r = rng(Number(seedArg))
for (let i = 0; i < Number(nArg); i++) {
  const s = { pts: pathRand(r, 5), ms: 1000 + 1000 * r(), size: Math.max(8, Math.round((80 + 300 * r()) * 0.4)), preset: (x => presetArg || x)(PRESETS[Math.floor(r() * PRESETS.length)]) }
  if (process.env.ONLY && Number(process.env.ONLY) !== i + 1) continue
  console.log('pts', JSON.stringify(s.pts))
  await ev(page, `return window.__mt.setup(${JSON.stringify({ preset: s.preset, color: [0.2, 0.55, 0.3], size: s.size, layerId: lid })})`)
  await ev(page, `return await window.__mt.stroke(${JSON.stringify({ pts: s.pts, ms: s.ms })})`, 60000)
  await sleep(Number(gapArg))
  if (process.env.DRY) await ev(page, 'window.__engine.watercolorDryAll(); return 1')
  const res = await ev(page, compareCode(lid), 600000)
  console.log(`stroke ${i + 1} ${s.preset} size ${s.size} ms ${Math.round(s.ms)}:`, res)
}

function window_install() { return `return 'noop'` }
function compareCode(lid) {
  return `
const e = window.__engine, lid = ${JSON.stringify(lid)}
await new Promise(r => setTimeout(r, 6000))
if (e._settle) e._completeSettle()
const keep = e._layers.get(lid)
const read = b => new Map(b.allResident().map(t => [t.originX + ',' + t.originY, t.buffer.readPixels()]))
const A = read(keep)
const buf = e._makeLayerBuffer(lid); buf.clear()
const liveChunks = e._replayRibbonChunks; e._replayRibbonChunks = new Map()
const liveAuthors = e._chunkAuthors; e._chunkAuthors = new Map()
for (const entry of e._log.entries) {
  const op = entry.op
  if (op.type !== 'stroke') continue
  if (entry.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op)
  else e._retireWashesOf(op)
}
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = liveChunks; e._chunkAuthors = liveAuthors
const B = read(buf); buf.destroy()
let n = 0, mx = 0, painted = 0
const pw = e._opts.pageWidth || Infinity, ph = e._opts.pageHeight || Infinity
const origins = new Map(keep.allResident().map(t => [t.originX + ',' + t.originY, t]))
for (const [k, a] of A) { const b = B.get(k); if (!b) continue; const T = origins.get(k); const w = T.buffer.width, h = T.buffer.height; for (let i = 0; i < a.length; i++) { const q = i >> 2; if (T.originX + q % w >= pw || T.originY + h - 1 - Math.floor(q / w) >= ph) continue; const d = Math.abs(a[i] - b[i]); if (d > 2) n++; if (d > mx) mx = d; if ((i & 3) === 3 && a[i] > 2) painted++ } }
return 'diff>2 ' + n + ' max ' + mx + ' painted ' + painted + ' ops ' + e._log.layerPixelOps(lid).length`
}

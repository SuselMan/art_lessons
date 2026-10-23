// Live layer vs clean replay, per tile: bytes differing by > 2, max, and
// the bounding box of the differing texels (world coords).
// Usage: node tilediff.mjs <page> [layer=last]
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const lid = ${JSON.stringify(layer ?? null)} ?? [...e._layers.keys()].pop()
const keep = e._layers.get(lid)
const read = b => new Map(b.allResident().map(t => [t.originX + ',' + t.originY, { t, px: t.buffer.readPixels() }]))
if (e._settle) e._completeSettle()
const A = read(keep)
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
const B = read(buf); buf.destroy()
const out = []
for (const [k, a] of A) { const b = B.get(k); if (!b) { out.push(k + ' only live'); continue }
  const w = a.t.buffer.width, h = a.t.buffer.height; let n = 0, mx = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  const pw = e._opts.pageWidth || Infinity, ph = e._opts.pageHeight || Infinity
  for (let i = 0; i < a.px.length; i++) { const q = i >> 2, qx = a.t.originX + q % w, qy = a.t.originY + h - 1 - Math.floor(q / w); if (qx >= pw || qy >= ph) continue; const d = Math.abs(a.px[i] - b.px[i]); if (d > 2) { n++; const p = i >> 2, x = p % w, y = h - 1 - Math.floor(p / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } if (d > mx) mx = d }
  out.push(k + ' ' + n + '/' + mx + (n ? ' box ' + (a.t.originX + x0) + ',' + (a.t.originY + y0) + '..' + (a.t.originX + x1) + ',' + (a.t.originY + y1) : '')) }
return lid + ' ops ' + e._log.layerPixelOps(lid).length + '\\n' + out.join('\\n')`, 600000))

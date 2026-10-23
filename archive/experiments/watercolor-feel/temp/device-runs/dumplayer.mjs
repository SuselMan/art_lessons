// Live layer vs clean replay, whole layer as two PNGs (alpha as grey), 1/4 scale.
// Usage: node dumplayer.mjs <page> <layer> <outprefix>
import { writeFileSync } from 'node:fs'
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, lid, out] = process.argv.slice(2)
const r = await ev(page, `
const e = window.__engine, lid = ${JSON.stringify(lid)}
const pw = e._opts.pageWidth || 2048, ph = e._opts.pageHeight || 3072, S = 4
const png = (b) => { const c = document.createElement('canvas'); c.width = pw / S; c.height = ph / S; const g = c.getContext('2d'); const id = g.createImageData(c.width, c.height); id.data.fill(255)
  for (const t of b.allResident()) { const w = t.buffer.width, h = t.buffer.height, px = t.buffer.readPixels()
    for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) { const wx = (t.originX + x) / S, wy = (t.originY + (h - 1 - y)) / S | 0; if (wx >= c.width || wy >= c.height || wx < 0 || wy < 0) continue; const d = (wy * c.width + wx) * 4; const a = px[(y * w + x) * 4 + 3]; id.data[d] = id.data[d+1] = id.data[d+2] = 255 - Math.min(255, a * 3) } }
  g.putImageData(id, 0, 0); return c.toDataURL('image/png') }
const A = png(e._layers.get(lid))
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
const B = png(buf); buf.destroy()
return JSON.stringify({ A, B })`, 600000)
const o = typeof r === 'string' ? JSON.parse(r) : r
for (const k of ['A', 'B']) writeFileSync(`${out}_${k}.png`, Buffer.from(o[k].split(',')[1], 'base64'))
console.log('ok')

// Chunked gesture, live vs clean replay, with the chunk-boundary settle made
// synchronous in the page (SYNC=1) or left as shipped (SYNC=0).
// Usage: node chunksync.mjs <page> <sync 0|1> '<pts>' <size> <ms>
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, sync, pts, size, ms] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const sum = (buf) => { const o = {}; for (const t of buf.allResident()) { const p = t.buffer.readPixels(); let s = 0; for (let i = 3; i < p.length; i += 16) s += p[i]; if (s) o[t.originX + ',' + t.originY] = s } return o }
const orig = e._finishRibbonStroke
let chunkSettles = 0
if (${Number(sync)}) e._finishRibbonStroke = function (sc, reveal, fade, spread) { if (reveal && fade === false) { chunkSettles++; return orig.call(this, sc, false, false, false) } return orig.call(this, sc, reveal, fade, spread) }
await window.__mt.setup({ preset: 'normal:100:70:PB29:round', color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
e._finishRibbonStroke = orig
await new Promise(r => setTimeout(r, 3000))
if (e._settle) e._completeSettle()
const L = sum(e._layers.get(lid))
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
const R = sum(buf); buf.destroy()
return 'sync ${sync} chunkSettles ' + chunkSettles + ' ops ' + e._log.layerPixelOps(lid).length + ' live ' + JSON.stringify(L) + ' replay ' + JSON.stringify(R)`, 300000))

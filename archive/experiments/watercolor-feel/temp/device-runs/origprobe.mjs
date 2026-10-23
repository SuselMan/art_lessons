// Fresh layer, one stroke; then per tile of the open wash's scratch: alpha sum
// of the tile's `original` (must be 0 on a fresh layer), of the live tile, and
// of a clean replay. Usage: node origprobe.mjs <page> '<pts>' <size> <ms>
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const asum = (buf) => { const p = buf.readPixels(); let s = 0; for (let i = 3; i < p.length; i += 16) s += p[i]; return s }
await window.__mt.setup({ preset: 'normal:100:70:PB29:round', color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
await new Promise(r => setTimeout(r, 3000))
const out = []
const sc = e._wash && e._wash.scratch
const live = new Map(e._layers.get(lid).allResident().map(t => [t.buffer, t]))
if (sc) for (const [tb, en] of sc._tiles) { const t = live.get(tb); out.push((t ? t.originX + ',' + t.originY : '?') + ' orig ' + asum(en.original) + ' live ' + (t ? asum(t.buffer) : '?') + ' cov ' + asum(en.coverage)) }
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
for (const t of buf.allResident()) out.push('replay ' + t.originX + ',' + t.originY + ' ' + asum(t.buffer))
buf.destroy()
return lid + ' ops ' + e._log.layerPixelOps(lid).length + '\\n' + out.join('\\n')`, 300000))

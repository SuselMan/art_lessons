// One stroke on a fresh layer: live alpha sum over time vs a clean replay.
// Usage: node timelapse.mjs <page> '<pts json>' <size> <ms> [preset]
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms, preset = 'normal:100:70:PB29:round'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const sum = (buf) => { const o = {}; for (const t of buf.allResident()) { const p = t.buffer.readPixels(); let s = 0; for (let i = 3; i < p.length; i += 16) s += p[i]; if (s) o[t.originX + ',' + t.originY] = s } return o }
await window.__mt.setup({ preset: ${JSON.stringify(preset)}, color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
const t0 = performance.now()
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
const out = []
for (const at of [0, 10000]) { while (performance.now() - t0 < at + 2500) await new Promise(r => setTimeout(r, 50)); out.push(Math.round((performance.now()-t0)/1000) + 's:' + JSON.stringify(sum(e._layers.get(lid)))) }
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
out.push('replay:' + JSON.stringify(sum(buf))); buf.destroy()
const op = e._log.layerPixelOps(lid)[0]
return lid + ' dabs ' + (op.dabs ? op.dabs.length : '?') + ' | ' + out.join(' | ')`, 300000))

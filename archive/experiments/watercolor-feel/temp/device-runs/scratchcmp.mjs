// Fresh layer, one stroke; live wash scratch vs the replay's scratch, buffer by
// buffer per tile (sum of all channels, sampled). Usage as origprobe.mjs.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms, preset = 'normal:100:70:PB29:round'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const sums = (buf) => { if (!buf) return '-'; const p = buf.readPixels(); const s = [0,0,0,0]; for (let i = 0; i < p.length; i += 16) for (let c = 0; c < 4; c++) s[c] += p[i+c]; return s.join('/') }
const KEYS = ['coverage','inkLoad','inkSettled','inkDry','inkColor','colorSettled','colorDry','strokeInk','inkBase']
const dump = (sc, tiles) => { const o = {}; for (const [tb, en] of sc._tiles) { const t = tiles.get(tb); const k = t ? t.originX + ',' + t.originY : '?'; o[k] = {}; for (const key of KEYS) o[k][key] = sums(en[key]) } return o }
await window.__mt.setup({ preset: ${JSON.stringify(preset)}, color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
await new Promise(r => setTimeout(r, 3000))
const L = dump(e._wash.scratch, new Map(e._layers.get(lid).allResident().map(t => [t.buffer, t])))
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const en of e._log.entries) { const op = en.op; if (op.type !== 'stroke') continue; if (en.state === 'done' && op.layerId === lid) e._applyPixelOp(buf, lid, op); else e._retireWashesOf(op) }
if (e._settle) e._completeSettle()
const tiles = new Map(buf.allResident().map(t => [t.buffer, t]))
const R = {}; for (const c of e._replayRibbonChunks.values()) Object.assign(R, dump(c.scratch, tiles))
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la; buf.destroy()
const lines = []
for (const k of Object.keys(L)) for (const key of KEYS) { const a = L[k][key], r = R[k] ? R[k][key] : '?'; lines.push(k + ' ' + key + (a === r ? ' same ' + a : ' LIVE ' + a + ' REPLAY ' + r)) }
return lines.join('\\n')`, 300000))

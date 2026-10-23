// Chunked gesture: live scratch after EACH chunk flush vs a replay of ops[0..k].
// Usage: node chunkNcmp.mjs <page> '<pts>' <size> <ms> <preset>
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms, preset] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const KEYS = ['coverage', 'inkLoad', 'inkDry']
const sums = (buf) => { if (!buf) return '-'; const p = buf.readPixels(); const s = [0,0,0,0]; for (let i = 0; i < p.length; i += 16) for (let c = 0; c < 4; c++) s[c] += p[i+c]; return s.join('/') }
const dump = (sc, tiles) => { const o = {}; for (const [tb, en] of sc._tiles) { const t = tiles.get(tb); const k = t ? t.originX + ',' + t.originY : '?'; o[k] = {}; for (const key of KEYS) o[k][key] = sums(en[key]) } return o }
const L = []
const of = e._flushStrokeChunk
e._flushStrokeChunk = function () { const r = of.call(this); if (this._settle) this._completeSettle(); L.push(dump(this._ribbonStrokeScratch, new Map(this._layers.get(lid).allResident().map(t => [t.buffer, t])))); return r }
await window.__mt.setup({ preset: ${JSON.stringify(preset)}, color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
e._flushStrokeChunk = of
await new Promise(r => setTimeout(r, 3000))
if (e._settle) e._completeSettle()
const ops = e._log.layerPixelOps(lid)
const lines = ['ops ' + ops.length + ' flushes ' + L.length]
for (let k = 0; k < L.length; k++) {
  const buf = e._makeLayerBuffer(lid); buf.clear()
  const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
  for (let j = 0; j <= k; j++) e._applyPixelOp(buf, lid, ops[j])
  if (e._settle) e._completeSettle()
  const tiles = new Map(buf.allResident().map(t => [t.buffer, t]))
  const R = {}; for (const c of e._replayRibbonChunks.values()) Object.assign(R, dump(c.scratch, tiles))
  for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
  e._replayRibbonChunks = lc; e._chunkAuthors = la; buf.destroy()
  for (const t of new Set([...Object.keys(L[k]), ...Object.keys(R)])) for (const key of KEYS) { const a = L[k][t] ? L[k][t][key] : '?', r = R[t] ? R[t][key] : '?'; if (a !== r) lines.push('chunk ' + k + ' ' + t + ' ' + key + ' LIVE ' + a + ' REPLAY ' + r) }
}
return lines.join('\\n')`, 600000))

// Draws two washes on the laptop (dry between), undoes, and checks each
// page: did a wash-boundary checkpoint exist, where did the rebuild start,
// and does the rebuilt layer match a replay from the snapshot floor.
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [drawer, ...watchers] = process.argv.slice(2)
const pages = [drawer, ...watchers]
for (const p of pages) { await joinAndInstall(p); console.log(p, await ev(p, `return !!window.__engine._washBoundaries`)) }
const stroke = (pts) => ev(drawer, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 900 })})`, 60000)
await ev(drawer, `window.__mt.setup({ preset: 'normal:100:70:PB29:round', color: [0.2, 0.4, 0.7], size: 60, layerId: 'layer-1' }); return 1`)
for (const y of [0.3, 0.35, 0.4]) { await stroke([[0.2, y], [0.5, y]]); await sleep(600) }
await ev(drawer, `window.__engine.watercolorDryAll(); return 1`)
await sleep(1500)
for (const y of [0.6, 0.65, 0.7]) { await stroke([[0.3, y], [0.6, y]]); await sleep(600) }
await sleep(3000)
const state = `const e = window.__engine; const ops = e._log.layerPixelOps('layer-1'); const b = e._checkpoints.best('layer-1', ops); return JSON.stringify({ ops: ops.length, cps: e._checkpoints.all().filter(c => c.layerId === 'layer-1').map(c => (c.fromSnapshot ? 'S' : '') + c.opIds.length), bestStart: b?.start ?? null })`
for (const p of pages) console.log('before undo', p, await ev(p, state))
const armed = watchers.map(p => ev(p, `const e = window.__engine; window.__rbStart = null; const o = e._startRebuildJob; e._startRebuildJob = function (l) { const r = o.apply(this, arguments); const j = this._rebuildJobs.get(l); if (j && window.__rbStart === null) window.__rbStart = j.start; return r }; return 1`))
await Promise.all(armed)
await ev(drawer, `window.__engine.undo(); return 1`)
await sleep(2000)
for (const p of watchers) console.log('watcher rebuild started at', p, await ev(p, 'return window.__rbStart'))
const check = `const e = window.__engine, lid = 'layer-1'
for (let i = 0; i < 600 && e._rebuildJobs.size; i++) await new Promise(r => setTimeout(r, 100))
const mine = e._layers.get(lid).allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => t.buffer.readPixels())
const store = e._checkpoints, keep = store.list
store.list = keep.filter(c => c.fromSnapshot)
const buf = e._makeLayerBuffer(lid); buf.clear(); const t = performance.now(); e._replayInto(buf, lid, e._log.layerPixelOps(lid)); const fullMs = Math.round(performance.now() - t)
store.list = keep
const full = buf.allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => t.buffer.readPixels()); buf.destroy()
let max = 0, n = 0; for (let k = 0; k < full.length; k++) { const a = full[k], b = mine[k]; if (!b || a.length !== b.length) { max = 999; continue } for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d) n++ } }
return JSON.stringify({ tiles: [mine.length, full.length], maxDiff: max, differing: n, fullReplayMs: fullMs, lost: e.gl.isContextLost() })`
const watch = `const e = window.__engine; const t0 = performance.now(); let maxGap = 0, last = t0
const tick = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; if (n - t0 < 15000) requestAnimationFrame(tick) }; requestAnimationFrame(tick)
await new Promise(r => setTimeout(r, 15500))
return JSON.stringify({ jobs: e._rebuildJobs.size, maxFrameGap: Math.round(maxGap), lost: e.gl.isContextLost() })`
console.log('drawer after undo', drawer, await ev(drawer, check, 600000))
for (const p of watchers) console.log('watcher after undo', p, await ev(p, watch, 120000))

// Two authors paint into one place of layer-1 in turn (both washes open),
// one undo, then: where each page's rebuild started and whether it matches a
// replay from the snapshot floor (full check skipped on pages in `watchOnly`).
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [a, b, ...watchOnly] = process.argv.slice(2)
const pages = [a, b, ...watchOnly]
for (const p of pages) { await joinAndInstall(p); console.log(p, await ev(p, `return !!window.__engine._carryWashes`)) }
const stroke = (p, pts) => ev(p, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 800 })})`, 60000)
await ev(a, `window.__mt.setup({ preset: 'normal:100:70:PB29:round', color: [0.2, 0.4, 0.7], size: 70, layerId: 'layer-1' }); return 1`)
await ev(b, `window.__mt.setup({ preset: 'normal:100:70:PB29:round', color: [0.8, 0.5, 0.1], size: 70, layerId: 'layer-1' }); return 1`)
for (let i = 0; i < 6; i++) {
  await stroke(a, [[0.25, 0.3 + i * 0.02], [0.6, 0.32 + i * 0.02]]); await sleep(500)
  await stroke(b, [[0.3, 0.36 + i * 0.02], [0.65, 0.34 + i * 0.02]]); await sleep(500)
}
await sleep(4000)
const state = `const e = window.__engine; const ops = e._log.layerPixelOps('layer-1'); const b = e._checkpoints.best('layer-1', ops); return JSON.stringify({ ops: ops.length, cps: e._checkpoints.all().filter(c => c.layerId === 'layer-1').map(c => (c.fromSnapshot ? 'S' : '') + c.opIds.length + (c.washIds ? 'w' + c.washIds.length : '')), bestStart: b?.start ?? null })`
for (const p of pages) console.log('before undo', p, await ev(p, state))
for (const p of pages) await ev(p, `const e = window.__engine; window.__rbStart = null; const o = e._startRebuildJob; e._startRebuildJob = function (l) { const r = o.apply(this, arguments); const j = this._rebuildJobs.get(l); if (j && window.__rbStart === null) window.__rbStart = { start: j.start, seeded: j.chunks.size }; return r }; return 1`)
await ev(b, `window.__engine.undo(); return 1`)
await sleep(2000)
for (const p of pages) console.log('rebuild', p, await ev(p, 'return JSON.stringify(window.__rbStart)'))
const check = `const e = window.__engine, lid = 'layer-1'
for (let i = 0; i < 600 && e._rebuildJobs.size; i++) await new Promise(r => setTimeout(r, 100))
const mine = e._layers.get(lid).allResident().sort((x, y) => x.originX - y.originX || x.originY - y.originY).map(t => t.buffer.readPixels())
const store = e._checkpoints, keep = store.list
store.list = keep.filter(c => c.fromSnapshot)
const buf = e._makeLayerBuffer(lid); buf.clear(); e._replayInto(buf, lid, e._log.layerPixelOps(lid))
store.list = keep
const full = buf.allResident().sort((x, y) => x.originX - y.originX || x.originY - y.originY).map(t => t.buffer.readPixels()); buf.destroy()
let max = 0, n = 0; for (let k = 0; k < full.length; k++) { const p = full[k], q = mine[k]; for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - q[i]); if (d > max) max = d; if (d) n++ } }
return JSON.stringify({ maxDiff: max, differing: n, lost: e.gl.isContextLost() })`
const watch = `const e = window.__engine; for (let i = 0; i < 300 && e._rebuildJobs.size; i++) await new Promise(r => setTimeout(r, 100)); return JSON.stringify({ jobs: e._rebuildJobs.size, lost: e.gl.isContextLost() })`
for (const p of [a, b]) console.log('after undo', p, await ev(p, check, 600000))
for (const p of watchOnly) console.log('after undo', p, await ev(p, watch, 120000))

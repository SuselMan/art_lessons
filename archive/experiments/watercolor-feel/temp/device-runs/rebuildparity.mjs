import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1'] = process.argv.slice(2)
await ev(page, `window.__rp = null; const e = window.__engine; const lid = ${JSON.stringify(layer)}
const ob = e._checkpoints.best; e._checkpoints.best = () => null
e._startRebuildJob(lid); e._checkpoints.best = ob
const c = () => { if (e._rebuildJobs.size) return setTimeout(c, 100)
  const a = JSON.parse(window.__mt.sample(lid, 48))
  e._checkpoints.best = () => null
  e._replayInto(e._layers.get(lid), lid, e._log.layerPixelOps(lid))
  e._checkpoints.best = ob
  const b = JSON.parse(window.__mt.sample(lid, 48))
  const A = a.cells ?? a, B = b.cells ?? b
  let max = 0, n = 0; const fa = A.flat(3), fb = B.flat(3)
  for (let i = 0; i < fa.length; i++) { const d = Math.abs(fa[i] - fb[i]); if (d > max) max = d; if (d > 2) n++ }
  window.__rp = JSON.stringify({ len: fa.length, max, over2: n, sumA: fa.reduce((x, y) => x + y, 0) })
}
c(); return 1`)
for (;;) { await new Promise(r => setTimeout(r, 3000)); const r = await ev(page, 'return window.__rp'); if (r) { console.log(r); break } }

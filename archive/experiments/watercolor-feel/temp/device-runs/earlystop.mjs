// Replays the first N ops of a layer with the front's early stop off and on,
// compares every byte and times both. Usage: node earlystop.mjs <page> [N] [layer]
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, N = '40', layer = 'layer-1'] = process.argv.slice(2)
await joinAndInstall(page)
console.log(await ev(page, `
const e = window.__engine, gl = e.gl, lid = ${JSON.stringify(layer)}
if (!('frontEarlyStop' in e)) return 'old code'
const ops = e._log.layerPixelOps(lid).slice(0, ${+N})
const buf = e._makeLayerBuffer(lid)
const ob = e._checkpoints.best; e._checkpoints.best = () => null
const read = () => buf.allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => t.buffer.readPixels())
const run = (on) => { e.frontEarlyStop = on; buf.clear(); read(); const t = performance.now(); e._replayInto(buf, lid, ops); const px = read(); return { ms: Math.round(performance.now() - t), px } }
const off1 = run(false), on1 = run(true), off2 = run(false), on2 = run(true)
e.frontEarlyStop = true; e._checkpoints.best = ob; buf.destroy()
const cmp = (X, Y) => { let mx = 0, c = 0; for (let k = 0; k < X.length; k++) { const a = X[k], b = Y[k]; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; if (d) c++ } } return [mx, c] }
const offOff = cmp(off1.px, off2.px), onOn = cmp(on1.px, on2.px), off2On2 = cmp(off2.px, on2.px)
let max = 0, n = 0, tot = 0
for (let k = 0; k < off1.px.length; k++) { const a = off1.px[k], b = on1.px[k]; if (!b || a.length !== b.length) { max = 999; continue } for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); tot++; if (d > max) max = d; if (d) n++ } }
return JSON.stringify({ offOff, onOn, off2On2, ops: ops.length, off: [off1.ms, off2.ms], on: [on1.ms, on2.ms], maxDiff: max, differing: n, of: tot, lost: gl.isContextLost() })`, 900000))

// Local-only full-history rebuild of a layer (checkpoints ignored), frame gaps
// and total time. Usage: node rebuildbench.mjs <page> [layer]
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1'] = process.argv.slice(2)
await ev(page, `
const e = window.__engine
window.__rb = null
const ob = e._checkpoints.best; e._checkpoints.best = () => null
const gaps = []; let last = performance.now(), run = true
const f = () => { const n = performance.now(); gaps.push(n - last); last = n; if (run) requestAnimationFrame(f) }; requestAnimationFrame(f)
let settles = 0; const os = e._startSettle; e._startSettle = function () { settles++; return os.apply(this, arguments) }
const t0 = performance.now()
e._startRebuildJob(${JSON.stringify(layer)})
e._checkpoints.best = ob
const c = () => { if (e._rebuildJobs.size) return setTimeout(c, 100); run = false; e._startSettle = os; gaps.sort((a, b) => b - a)
  window.__rb = JSON.stringify({ total: Math.round(performance.now() - t0), settles, frames: gaps.length, top: gaps.slice(0, 8).map(Math.round), over50: gaps.filter(g => g > 50).length, over100: gaps.filter(g => g > 100).length, lost: e.gl.isContextLost() }) }
c(); return 1`)
for (;;) {
  await new Promise(r => setTimeout(r, 3000))
  const r = await ev(page, 'return window.__rb')
  if (r) { console.log(page, r); break }
}

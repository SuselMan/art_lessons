// Replays the first N ops of a layer at several RIBBON_BODY_TURN thresholds
// and diffs every pixel against the always-body reference.
// Usage: node bodyturn.mjs <page> [N] [layer]
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, N = '30', layer = 'layer-1'] = process.argv.slice(2)
await joinAndInstall(page)
const r = await ev(page, `
const mod = { RIBBON_BODY_TURN: globalThis.__ribbonBodyTurn }
const e = window.__engine, gl = e.gl, lid = ${JSON.stringify(layer)}
const ops = e._log.layerPixelOps(lid).slice(0, ${+N})
const buf = e._makeLayerBuffer(lid)
const ob = e._checkpoints.best; e._checkpoints.best = () => null
const run = (cos) => { mod.RIBBON_BODY_TURN.cos = cos; buf.clear(); gl.finish(); const t = performance.now(); e._replayInto(buf, lid, ops); gl.finish(); const ms = performance.now() - t
  const px = buf.allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => t.buffer.readPixels()); return { ms, px } }
const ref = run(2)
const out = [{ cos: 'always', ms: Math.round(ref.ms) }]
for (const cos of [0.99999, 0.9995, 0.998, 0.99, -2]) {
  const r = run(cos); let max = 0, n1 = 0, n4 = 0, tot = 0
  for (let k = 0; k < ref.px.length; k++) { const a = ref.px[k], b = r.px[k]; if (!b || a.length !== b.length) { max = 999; continue } for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); tot++; if (d > max) max = d; if (d > 1) n1++; if (d > 4) n4++ } }
  out.push({ cos, ms: Math.round(r.ms), max, over1: n1, over4: n4, of: tot })
}
mod.RIBBON_BODY_TURN.cos = 0.9995
e._checkpoints.best = ob; buf.destroy()
return JSON.stringify(out)`, 600000)
console.log(r)

import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, N = '40'] = process.argv.slice(2)
await joinAndInstall(page)
console.log(await ev(page, `
const e = window.__engine, gl = e.gl, lid = "layer-1"
const ops = e._log.layerPixelOps(lid).slice(0, ${+N})
const buf = e._makeLayerBuffer(lid)
const ob = e._checkpoints.best; e._checkpoints.best = () => null
const sync = () => buf.allResident()[0]?.buffer.readPixels()
const run = () => { buf.clear(); sync(); const t = performance.now(); e._replayInto(buf, lid, ops); sync(); return Math.round(performance.now() - t) }
const read = () => buf.allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => t.buffer.readPixels())
const base1 = run(); const px0 = read()
const orig = e._diffuseFieldFor
const cache = new Map(); let allocs = 0
e._diffuseFieldFor = function (w, h) {
  if (this._settle) this._completeSettle()
  const need = n => Math.ceil(n / 256) * 256; const k = need(w) + "x" + need(h)
  let f = cache.get(k)
  if (!f) { this._fieldCache = []; f = orig.call(this, w, h); this._fieldCache = []; cache.set(k, f); allocs++ }
  else for (const b of [f.a, f.b, f.c, f.coverage, f.ca, f.cb, f.cc, f.mask, f.pressure, f.band]) b.clear()
  this._fieldCache = [f]
  return f
}
const cached1 = run(); const cached2 = run(); const px1 = read()
e._diffuseFieldFor = orig; e._fieldCache = []
const base2 = run()
e._checkpoints.best = ob; buf.destroy()
let d = 0; for (let k = 0; k < px0.length; k++) for (let i = 0; i < px0[k].length; i++) if (px0[k][i] !== px1[k][i]) d++
return JSON.stringify({ base: [base1, base2], cached: [cached1, cached2], sizes: cache.size, allocs, diffBytes: d })`, 900000))

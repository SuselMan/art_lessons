(async () => {
  const e = window.__engine, gl = e.gl, id = 'layer-1'
  const wait = async () => { while (e._rebuildJobs.size) await new Promise(r => setTimeout(r, 200)) }
  const snap = () => { const out = new Map(); for (const t of e._layers.get(id).allResident()) out.set(t.originX + ',' + t.originY, t.buffer.readPixels().slice()); return out }
  const AB = [...e._layers.get(id).allResident()][0].buffer.constructor
  const P = Object.getPrototypeOf(e)
  const oldFF = function (w, h) {
    if (this._settle) this._completeSettle()
    const need = n => Math.ceil(n / 256) * 256
    const W = need(w), H = need(h)
    const cur = this._fieldCache[0]
    const names = ['a', 'b', 'c', 'coverage', 'ca', 'cb', 'cc', 'mask', 'pressure', 'band']
    if (cur && cur.w === W && cur.h === H) { for (const n of names) cur[n].clear(); return cur }
    if (cur) for (const n of names) cur[n].destroy()
    const f = { w: W, h: H }
    for (const n of names) f[n] = new AB(gl, W, H, n === 'mask' || n === 'pressure' ? 'linear' : 'nearest')
    this._fieldCache = [f]
    return f
  }
  await wait()
  e._diffuseFieldFor = oldFF
  e._rebuildLayer(id); await wait(); const A = snap()
  e._diffuseFieldFor = P._diffuseFieldFor
  e._rebuildLayer(id); await wait(); const B = snap()
  const res = []
  for (const [k, a] of A) {
    const b = B.get(k); let mx = 0, n = 0, n8 = 0
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) n++; if (d > 8) n8++; if (d > mx) mx = d }
    res.push(`${k} diff=${n} over8=${n8} max=${mx}`)
  }
  return res
})()

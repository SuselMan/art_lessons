(async () => {
  const e = window.__engine, gl = e.gl
  const id = 'layer-1'
  const wait = async () => { while (e._rebuildJobs.size) await new Promise(r => setTimeout(r, 200)) }
  const snap = () => {
    const buf = e._layers.get(id); const out = new Map()
    for (const t of buf.allResident()) out.set(t.originX + ',' + t.originY, t.buffer.readPixels().slice())
    return out
  }
  const orig = Object.getPrototypeOf(e)._replaysInSlices
  await wait()
  e._replaysInSlices = () => false; e._nibTouchesTile = () => true
  let t = performance.now(); e._rebuildLayer(id); await wait(); const tA = performance.now() - t
  const A = snap()
  e._replaysInSlices = orig; delete e._nibTouchesTile
  t = performance.now(); e._rebuildLayer(id); await wait(); const tB = performance.now() - t
  const B = snap()
  const res = []
  for (const [k, a] of A) {
    const b = B.get(k); if (!b) { res.push(k + ' missing'); continue }
    let mx = 0, n = 0
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) n++; if (d > mx) mx = d }
    res.push(`${k} diff=${n} max=${mx.toFixed(6)}`)
  }
  return { tA: Math.round(tA), tB: Math.round(tB), tiles: res, extraB: [...B.keys()].filter(k => !A.has(k)) }
})()

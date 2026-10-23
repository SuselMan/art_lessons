(async () => {
  const e = window.__engine, gl = e.gl, P = Object.getPrototypeOf(e)
  if (e.__leaf2) return 'already'; e.__leaf2 = true
  const agg = window.__leaf2 = {}
  const add = (k, d) => { const s = agg[k] || (agg[k] = [0, 0, 0]); s[0] += d; s[1]++; s[2] = Math.max(s[2], d) }
  const wrap = (obj, n, label) => { const o = obj[n]; if (typeof o !== 'function') return; obj[n] = function (...a) { gl.finish(); const t = performance.now(); const r = o.apply(this, a); gl.finish(); add(label || n, performance.now() - t); return r } }
  for (const n of ['_wcResample', '_fieldOp', '_drawRibbonCompositeRect', '_drawRibbonBands', '_drawRibbonNibPass', '_waterFrontStep', '_diffuseFieldFor', '_revealAfterBatch', '_revealBeforeBatch', '_revealWash']) wrap(e, n)
  const AB = (await import('/src/engine/src/buffers/AccumulationBuffer.ts')).AccumulationBuffer.prototype
  for (const n of ['copyRegionInto', 'copyTo', 'clear', 'readPixels', 'writePixels', 'restorePixelsRect']) wrap(AB, n, 'AB.' + n)
  const pool = e._ribbonScratchPool; wrap(pool, 'acquire', 'pool.acquire')
  window.__leaf2Dump = () => Object.entries(agg).sort((a, b) => b[1][2] - a[1][2]).map(([k, s]) => `${k} max=${Math.round(s[2])} total=${Math.round(s[0])} n=${s[1]}`)
  return 'leaf2'
})()

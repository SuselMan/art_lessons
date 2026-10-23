(async () => {
  const e = window.__engine, gl = e.gl, P = Object.getPrototypeOf(e)
  if (e.__fp) return 'already'; e.__fp = true
  const rec = window.__finishRec = []
  let cur = null
  const leaf = (obj, n, label) => { const o = obj[n]; if (typeof o !== 'function') return; obj[n] = function (...a) { if (!cur) return o.apply(this, a); gl.finish(); const t = performance.now(); const r = o.apply(this, a); gl.finish(); const k = label || n; cur[k] = (cur[k] || 0) + performance.now() - t; return r } }
  for (const n of ['_flushLiveComposite', '_revealWash', '_drawRibbonCompositeRect', '_diffuseWashOps', '_startSettle', '_diffuseFieldFor', '_fieldOp', '_wcResample', '_waterFrontStep', '_resolveWithinSheet', '_markPaperDamage', '_enforceGpuBudget', '_displayIfNotSuspended', '_display']) leaf(e, n)
  const AB = (await import('/src/engine/src/buffers/AccumulationBuffer.ts')).AccumulationBuffer.prototype
  for (const n of ['copyRegionInto', 'copyTo', 'clear']) leaf(AB, n, 'AB.' + n)
  leaf(e._ribbonScratchPool, 'acquire', 'pool.acquire')
  const of = P._finishRibbonStroke
  e._finishRibbonStroke = function (...a) {
    gl.finish(); const t = performance.now(); const outer = cur; cur = {}
    const r = of.apply(this, a)
    gl.finish(); const d = performance.now() - t
    if (d > 150) rec.push([Math.round(d), a.slice(1).map(String).join(','), Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Math.round(v)]))])
    cur = outer
    return r
  }
  return 'finishprof'
})()

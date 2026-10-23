(() => {
  const e = window.__engine; if (!e) return 'no engine'
  if (e.__gp3) return 'already'; e.__gp3 = true
  const gl = e.gl; const rec = window.__gpuRec || (window.__gpuRec = [])
  const wrap = (name, tag) => {
    const o = e[name]; if (typeof o !== 'function') return
    e[name] = function (...a) {
      gl.finish(); const t = performance.now()
      const r = o.apply(this, a)
      gl.finish(); const d = performance.now() - t
      if (d > 20) rec.push([Math.round(d), name + (tag ? ':' + tag.call(this, a) : '')])
      return r
    }
  }
  for (const n of ['_startRebuildJob', '_swapRebuiltLayer', '_seedWashes', '_rebuildLayer', '_takeCheckpoint', '_evictChunk', '_trimChunkCache', '_enforceGpuBudget']) wrap(n)
  wrap('_applyPixelOp', a => a[2] && ((a[2].tool || a[2].type) + ' ' + ((a[2].dabs && a[2].dabs.length) || '') + (a[3] ? ' replay' : '')))
  window.__gpuWorst = () => rec.slice().sort((x, y) => y[0] - x[0]).slice(0, 25).map(r => r[0] + 'ms ' + r[1]).join('\n')
  return 'gp3'
})()

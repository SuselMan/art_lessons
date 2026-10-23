(() => {
  const e = window.__engine, P = Object.getPrototypeOf(e)
  e._gpuBudget = 300 * 1024 * 1024; e._dbgHardKeepRecent = true
  const c = window.__bc = {}
  const inc = k => { c[k] = (c[k] || 0) + 1 }
  const wrap = (n, tag) => { const o = P[n]; e[n] = function (...a) { inc(n + (tag ? ':' + tag.apply(this, a) : '')); return o.apply(this, a) } }
  wrap('_evictChunk', (k, keep) => keep ? 'keep' : 'drop')
  wrap('_rebuildLostWash'); wrap('_startRebuildJob'); wrap('_startSpill'); wrap('_swapRebuiltLayer')
  wrap('_enforceGpuBudget', function () { return this._overHardCeiling() ? 'hard' : 'soft' })
  const oR = P._replayChunkScratch
  e._replayChunkScratch = function (t, s, w, d, p) { const key = w ?? s; if (this._spilledWashes.has(key)) inc('unspill'); if (this._lostWashes.get(key) === t) inc('lostHit'); return oR.call(this, t, s, w, d, p) }
  const oS = e._startSpill ? null : null
  return 'counting'
})()

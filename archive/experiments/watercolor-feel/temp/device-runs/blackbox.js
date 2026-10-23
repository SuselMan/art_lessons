// Flight recorder for a tab that dies without a word (Safari's jetsam, a GPU
// watchdog): engine events and a memory sample every 250 ms go to a ring in
// localStorage, which survives the reload. Read after with
//   JSON.parse(localStorage.__bb)
(() => {
  const e = window.__engine; if (!e) return 'no engine'
  if (window.__bbOn) return 'already'
  window.__bbOn = true
  const ring = []; const t0 = performance.timeOrigin
  const push = (what) => { ring.push([Math.round(performance.now()), what]); if (ring.length > 400) ring.shift() }
  const wrap = (name, tag) => {
    const o = e[name]; if (typeof o !== 'function') return
    e[name] = function (...a) {
      const s = performance.now(); let r
      try { r = o.apply(this, a) } finally { const d = performance.now() - s; if (d > 30 || tag) push(name + (tag ? ':' + tag(a) : '') + ' ' + Math.round(d) + 'ms') }
      return r
    }
  }
  wrap('_evictChunk', a => a[0].slice(0, 5) + (a[1] ? ':keep' : ''))
  wrap('_enforceGpuBudget', () => '')
  wrap('_advanceSettle'); wrap('_completeSettle'); wrap('_display'); wrap('_rebuildLayer', a => a[0])
  wrap('appendOperation', a => (a[0] && a[0].type) + '/' + (a[0] && a[0].userId || '').slice(0, 4))
  wrap('_flushOpQueue'); wrap('_stepRebuildJob')
  const oU = e._replayChunkScratch
  e._replayChunkScratch = function (...a) { const had = e._spilledWashes.has(a[2] ?? a[1]); const r = oU.apply(this, a); if (had) push('unspill ' + String(a[2] ?? a[1]).slice(0, 5)); return r }
  const cv = e.gl.canvas
  cv.addEventListener('webglcontextlost', () => { push('CONTEXT LOST'); flush() })
  const mem = () => { const p = e.getWatercolorPerf(); return 'mem live ' + p.scratchLiveMB + ' free ' + p.scratchFreeMB + ' field ' + Math.round(p.fieldMB) + ' chunks ' + e._replayRibbonChunks.size + ' spilled ' + e._spilledWashes.size + (window.__gpuBytes ? ' tex ' + window.__gpuBytes().texMB : '') }
  const flush = () => { try { localStorage.__bb = JSON.stringify({ origin: t0, at: Date.now(), ring }) } catch (err) {} }
  let last = performance.now()
  setInterval(() => { const now = performance.now(); const gap = now - last; last = now; if (gap > 600) push('TIMER LATE ' + Math.round(gap) + 'ms'); push(mem()); flush() }, 250)
  push('armed'); flush()
  return 'recording'
})()

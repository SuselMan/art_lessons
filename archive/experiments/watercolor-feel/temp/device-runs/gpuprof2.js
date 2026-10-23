// GPU time per engine step: each wrapped call ends with gl.finish(), and the
// wall time (CPU + GPU drain) is recorded. Measurement mode only - finish()
// changes pacing. window.__gpuWorst() -> top 25 as text.
(() => {
  const e = window.__engine; if (!e) return 'no engine'
  if (e.__gp) return 'already'; e.__gp = true
  const gl = e.gl; const rec = []
  window.__gpuRec = rec
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
  wrap('_advanceSettle', function () { return (this._settle ? this._settle.next + '/' + this._settle.ops.length : '') })
  wrap('_completeSettle', function () { return (this._settle ? (this._settle.ops.length - this._settle.next) + ' left' : '') })
  wrap('_display'); wrap('_stepRebuildJob'); wrap('_flushOpQueue')
  wrap('appendOperation', a => (a[0] && a[0].type))
  wrap('appendPeerLiveDabs', a => ((a[1] && a[1].dabs && a[1].dabs.length) || 0) + 'dabs')
  wrap('_evictChunk'); wrap('_startRebuildJob'); wrap('_swapRebuiltLayer'); wrap('_seedWashes'); wrap('_rebuildLayer'); wrap('_takeCheckpoint');
  wrap('_applyPixelOp', a => (a[2] && (a[2].tool || a[2].type) + ' ' + ((a[2].dabs && a[2].dabs.length) || (a[2].points && a[2].points.length) || '') + (a[3] ? ' replay' : '')));
  wrap('_paintRibbonStroke', a => (a.length)); wrap('_flushStrokeChunk'); wrap('_onEnd')
  window.__gpuWorst = () => rec.slice().sort((x, y) => y[0] - x[0]).slice(0, 25).map(r => r[0] + 'ms ' + r[1]).join('\n')
  return 'gpu profiling'
})()

(() => {
  const e = window.__engine, gl = e.gl, P = Object.getPrototypeOf(e)
  const rec = window.__hv = []
  let depth = 0
  for (const n of ['_advanceSettle', '_replayStrokeSlice', '_finishRibbonStroke', '_evictChunk', '_enforceGpuBudget', '_trimChunkCache', '_replayChunkScratch', '_diffuseWashOps', '_startSettle', '_completeSettle', '_swapRebuiltLayer', '_startRebuildJob', '_applyPixelOp', '_drawRibbonCompositeRect', '_seedWashes', '_display', 'appendPeerLiveDabs', '_flushOpQueue', 'appendOperation', '_paintDabs', '_rebuildLayer', '_tickSettle', '_flushLiveComposite', '_takeCheckpoint', '_startSpill']) {
    const o = P[n]; if (!o) continue
    e[n] = function (...a) {
      gl.finish(); const t = performance.now(); depth++
      let r; try { r = o.apply(this, a) } finally { depth-- }
      gl.finish(); const d = performance.now() - t
      if (d > 60) rec.push([Math.round(d), '  '.repeat(depth) + n])
      return r
    }
  }
  // settle completions separately
  const os = P._startSettle
  e._startSettle = function (scratch, ops, complete) {
    const c2 = () => { gl.finish(); const t = performance.now(); complete(); gl.finish(); const d = performance.now() - t; if (d > 60) rec.push([Math.round(d), '  '.repeat(depth) + '(settle complete)']) }
    const ops2 = ops.map(op => () => { gl.finish(); const t = performance.now(); op(); gl.finish(); const d = performance.now() - t; if (d > 60) rec.push([Math.round(d), '  '.repeat(depth) + '(settle op) ' + String(op).replace(/\s+/g, ' ').slice(6, 70)]) })
    return os.call(this, scratch, ops2, c2)
  }
  e._rebuildLayer('layer-1')
  return 1
})()

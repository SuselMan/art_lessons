(() => {
  const engine = window.__engine
  if (!engine) throw new Error('First-deposit probe requires actual Room engine')
  const rows = [], restore = [], limit = 3
  let active = false, starts = 0, current = null
  const wrap = (object, key, label) => {
    const original = object[key]
    if (typeof original !== 'function') throw new Error('Missing actual method ' + label)
    const replacement = function (...args) {
      if (!active) return original.apply(this, args)
      const t0 = performance.now()
      if (current.first[label] === undefined) current.first[label] = t0
      try { return original.apply(this, args) }
      finally {
        const elapsed = performance.now() - t0
        current.counts[label] = (current.counts[label] || 0) + 1
        current.ms[label] = (current.ms[label] || 0) + elapsed
      }
    }
    object[key] = replacement
    restore.push(() => { if (object[key] === replacement) object[key] = original })
  }
  for (const key of ['_completeSettle', '_checkpointBeforeWash', '_paintStrokeDabs', '_flushLiveComposite', '_display']) wrap(engine, key, key)
  wrap(engine._ribbonScratchPool, 'acquire', 'scratchAcquire')
  const gl = engine.gl
  wrap(gl, 'texImage2D', 'textureAllocate')
  wrap(gl, 'clear', 'clear')
  wrap(gl, 'drawArrays', 'drawArrays')
  const original = engine._onStart
  const replacement = function (...args) {
    if (starts >= limit || active) return original.apply(this, args)
    starts++
    current = { start: performance.now(), eventTimeStamp: args[0]?.timeStamp ?? null, first: {}, counts: {}, ms: {}, before: {
      settleSteps: engine._settle?.steps ?? null, scratch: engine._ribbonScratchPool.bytes,
      async: engine._wcAsyncFinish, material: engine._wcMaterialPresentation,
    } }
    active = true
    try { return original.apply(this, args) }
    finally {
      current.end = performance.now()
      current.after = { strokeLayer: engine._strokeLayerId, scratch: engine._ribbonScratchPool.bytes }
      rows.push(current); active = false; current = null
    }
  }
  engine._onStart = replacement
  restore.push(() => { if (engine._onStart === replacement) engine._onStart = original })
  window.__firstDepositProbe = { rows, stop: () => { for (const cleanup of restore.reverse()) cleanup() } }
  return { installed: true, maxStarts: limit, scope: 'CPU submission counts only; not first visible pixel/GPU duration' }
})()

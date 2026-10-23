(engine) => {
  const queue = engine._settleQueue, original = {}, jobs = [], ids = new WeakMap()
  const stats = { jobs, ticks: 0, units: 0, tickMaxMs: 0, unitMaxMs: 0, syncCalls: 0, syncMaxMs: 0, overflow: false }
  let serial = 0
  const wrap = (object, key, callback) => {
    const fn = object[key]; if (typeof fn !== 'function') throw Error('missing method ' + key)
    original[key] = fn
    object[key] = function(...args) { return callback.call(this, fn, args) }
  }
  wrap(queue, 'start', function(fn, args) {
    const row = { id: ++serial, start: performance.now(), initialOps: args[1].length, units: 0, maxOps: args[1].length, unitCpuMs: 0, maxUnitCpuMs: 0, finished: null }
    const complete = args[2]
    args[2] = function(...rest) { row.finished = performance.now(); return complete.apply(this, rest) }
    const result = fn.apply(this, args)
    if (this.current) ids.set(this.current, row)
    if (jobs.length < 512) jobs.push(row); else stats.overflow = true
    return result
  })
  wrap(queue, 'advance', function(fn, args) {
    const job = this.current, row = job && ids.get(job), begin = performance.now()
    try { return fn.apply(this, args) } finally {
      const elapsed = performance.now() - begin
      stats.units++; stats.unitMaxMs = Math.max(stats.unitMaxMs, elapsed)
      if (row) { row.units++; row.maxOps = Math.max(row.maxOps, job.ops.length); row.unitCpuMs += elapsed; row.maxUnitCpuMs = Math.max(row.maxUnitCpuMs, elapsed) }
    }
  })
  wrap(queue, 'tick', function(fn, args) {
    const begin = performance.now(); stats.ticks++
    try { return fn.apply(this, args) } finally { stats.tickMaxMs = Math.max(stats.tickMaxMs, performance.now() - begin) }
  })
  // Existing synchronization only; do not add any GL barrier or readback.
  const sync = queue.ctx.syncGpu
  if (sync) queue.ctx.syncGpu = function(...args) {
    const begin = performance.now(); stats.syncCalls++
    try { return sync.apply(this, args) } finally { stats.syncMaxMs = Math.max(stats.syncMaxMs, performance.now() - begin) }
  }
  return { stats, restore() { for (const key of ['start', 'advance', 'tick']) queue[key] = original[key]; queue.ctx.syncGpu = sync } }
}

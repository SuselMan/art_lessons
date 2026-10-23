window.__queueFixedFixture = async function (enabled) {
  const e = window.__engine
  e._settleQueue.idleBatch = enabled
  const layerId = window.__roomStore.getState().layerState.activeId
  const dabs = Array.from({ length: 65 }, (_, n) => {
    const leg = Math.min(7, Math.floor(n / 8)), f = Math.min(1, (n - leg * 8) / 8)
    const y0 = leg % 2 ? 1400 : 1080, y1 = leg % 2 ? 1080 : 1400
    return { x: 1626 + n * 4, y: y0 + (y1 - y0) * f, size: 40, pressure: 0.8, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 0.5, t: n * 20 }
  })
  const events = []
  const original = e._settleQueue.advance
  e._settleQueue.advance = function () {
    const job = this.current, op = job?.ops[job.next], cost = op?.smallCost?.() ?? null
    events.push({ t: performance.now(), index: job?.next, total: job?.ops.length, tagged: !!op?.smallCost, cost })
    return original.call(this)
  }
  const start = performance.now()
  try {
    const id='68000000-0000-4000-8000-000000000001';e.appendOperation({ id, type: 'stroke', strokeId: id, washId: 'fixed-queue-wash', userId: 'fixed-queue-author', layerId, timestamp: Date.now(), tool: 'watercolor', preset: 'normal:100:100:PB29:round', color: [0.3, 0.15, 0.55], dabs }, 'remote')
    let stable = 0
    while (performance.now() - start < 90000) {
      if (e.gl.isContextLost()) throw Error('Context lost')
      if (!e._settle && !e._opQueue.length && !e._rebuildJobs.size && !e._washReveals.size) {
        stable ||= performance.now()
        if (performance.now() - stable > 500) return { enabled, wallMs: performance.now() - start, events }
      } else stable = 0
      await new Promise(r => setTimeout(r, 50))
    }
    throw Error('Fixed source settle exceeded90s')
  } finally { e._settleQueue.advance = original }
}

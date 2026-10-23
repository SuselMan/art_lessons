window.__queueFixedFixture = async function (enabled) {
  const e = window.__engine
  e._settleQueue.idleBatch = enabled
  const layerId = window.__roomStore.getState().layerState.activeId
  const dabs = Array.from({ length: 65 }, (_, n) => {
    const leg = Math.min(7, Math.floor(n / 8)), f = Math.min(1, (n - leg * 8) / 8)
    const y0 = leg % 2 ? 1400 : 1080, y1 = leg % 2 ? 1080 : 1400
    return { x: 1626 + n * 4, y: y0 + (y1 - y0) * f, size: 40, pressure: 0.8, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 0.5, t: n * 20 }
  })
  const gl=e.gl, syncFramebuffer=gl.createFramebuffer(), syncTexture=gl.createTexture(), syncPixel=new Uint8Array(4)
  const previousFramebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING), previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D)
  gl.bindTexture(gl.TEXTURE_2D,syncTexture)
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4))
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST)
  gl.bindFramebuffer(gl.FRAMEBUFFER,syncFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,syncTexture,0)
  const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER,previousFramebuffer);gl.bindTexture(gl.TEXTURE_2D,previousTexture)
  if(!complete){gl.deleteFramebuffer(syncFramebuffer);gl.deleteTexture(syncTexture);throw Error('Diagnostic1px framebuffer incomplete')}
  const events = []
  const original = e._settleQueue.advance
  e._settleQueue.advance = function () {
    const job = this.current, op = job?.ops[job.next], cost = op?.smallCost?.() ?? null
    events.push({ t: performance.now(), index: job?.next, total: job?.ops.length, tagged: !!op?.smallCost, cost })
    const started = performance.now()
    const result = original.call(this)
    // Separate diagnostic only: both variants synchronise the same known
    // contact callback. Native timing never installs this wrapper.
    if (cost && op && job && job.next < job.ops.length) {
      const binding=gl.getParameter(gl.FRAMEBUFFER_BINDING)
      try {gl.bindFramebuffer(gl.FRAMEBUFFER,syncFramebuffer);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,syncPixel)}
      finally {gl.bindFramebuffer(gl.FRAMEBUFFER,binding)}
      events.at(-1).readbackCallbackWallMs = performance.now() - started
    }
    return result
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
  } finally { e._settleQueue.advance = original;gl.deleteFramebuffer(syncFramebuffer);gl.deleteTexture(syncTexture) }
}

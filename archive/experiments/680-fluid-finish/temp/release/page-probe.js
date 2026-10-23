(() => {
  if (!window.__engine) throw Error('No real room engine')
  window.__wcRelease?.dispose()
  const E = window.__engine, pointerRelease = window.__engine.canvas.releasePointerCapture, original = new Map(), events = [], frames = []
  let running = true, raf, previous, phase = 'installed'
  const emit = (kind, data = {}) => { events.push({ kind, at: performance.now(), phase, ...data }); if (events.length > 2000) events.shift() }
  const wrap = (name, data) => {
    if (typeof E[name] !== 'function') return
    const fn = E[name]; original.set(name, fn)
    E[name] = function (...args) {
      const start = performance.now(); emit(name + ':enter', data(args))
      try { return fn.apply(this, args) }
      finally { emit(name + ':return', { ms: performance.now() - start }) }
    }
  }
  const opInfo = op => ({ id: op?.id, type: op?.type, seq: op?.seq, author: op?.userId, stroke: op?.strokeId })
  wrap('appendOperation', args => ({ ...opInfo(args[0]), source: args[1] ?? 'local', pendingBefore: !!E._settle, queuedBefore: E._opQueue.length }))
  wrap('confirmOperation', args => ({ id: args[0], seq: args[1] }))
  wrap('appendPeerLiveDabs', args => ({ author: args[0], stroke: args[1]?.strokeId, dabs: args[1]?.dabs?.length }))
  for (const name of ['undo', 'redo', 'restoreLayerFromSnapshot']) wrap(name, () => ({ pendingBefore: !!E._settle, queue: E._opQueue.length, peerLive: E._peerLiveStrokes.size }))
  const local = E._onLocalOperation
  E._onLocalOperation = function (op) { emit('local-emission', opInfo(op)); return local?.call(this, op) }
  function tick(now) {
    if (!running) return
    if (previous !== undefined) { frames.push({ phase, gap: now - previous }); if (frames.length > 12000) frames.shift() }
    previous = now; raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) emit('longtask', { ms: entry.duration }) })
  try { observer.observe({ type: 'longtask', buffered: false }) } catch {}
  const idle = () => !E._pointer._active && !E._peerLiveStrokes.size && !E._settle && !E._opQueue.length && !E._rebuildJobs.size && !E._pendingRebuilds.size
  const state = () => ({
    userId: window.__roomStore?.getState().userId, activeLayer: E._activeId,
    log: E.getOperations().map(opInfo), entries: E._log.entries.map(entry => ({ ...opInfo(entry.op), state: entry.state, pending: !!entry.pending, serverSeq: entry.serverSeq })), peerLive: E._peerLiveStrokes.size, idle: idle(), lost: E.gl.isContextLost(), timeOrigin: performance.timeOrigin,
    peers: window.__roomStore?.getState().participants.map(p => p.id ?? p.userId), visibility: document.visibilityState,
    renderer: E.gpuInfo(), latency: window.__liveLatency?.stats() ?? null,
    flags: Object.fromEntries(['diagnosticSegmentDelivery','diagnosticSharedFluid','diagnosticSolventField','diagnosticForeignSolvent','diagnosticWaterPolicy','diagnosticPigmentFluidDose'].map(k => [k,E._ribbonPainter[k]])),
  })
  const probe = {
    phase(label) { phase = label; window.__liveLatency?.reset(); emit('phase'); return state() },
    state,
    async waitIdle(timeout = 90000) {
      const started = performance.now(); let stable = 0
      while (stable < 3) {
        if (E.gl.isContextLost()) throw Error('Context lost')
        if (performance.now() - started > timeout) throw Error('Engine idle timeout')
        stable = idle() ? stable + 1 : 0
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      return state()
    },
    async canonical() {
      await probe.waitIdle()
      // Public export in the accepted source excludes the presentation reveal.
      const blob = await E.exportPNG(false), bytes = new Uint8Array(await blob.arrayBuffer())
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i,i+8192))
      return { ...state(), png: btoa(data), pngSha256: Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''), gl: E.gl.getError() }
    },
    report() {
      const byPhase = {}
      for (const sample of frames) (byPhase[sample.phase] ??= []).push(sample.gap)
      const frameStats = Object.fromEntries(Object.entries(byPhase).map(([label,values]) => {
        const sorted = [...values].sort((a,b)=>a-b)
        return [label,{ n: values.length, p95: sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)], max: Math.max(...values), over33: values.filter(v=>v>33).length, over100: values.filter(v=>v>100).length }]
      }))
      return { ...state(), events, frameStats }
    },
    dispose() { running = false; cancelAnimationFrame(raf); observer.disconnect(); for (const [name,fn] of original) E[name] = fn; E._onLocalOperation = local; E.canvas.releasePointerCapture = pointerRelease; delete window.__wcRelease },
  }
  window.__wcRelease = probe
  return JSON.stringify(state())
})()

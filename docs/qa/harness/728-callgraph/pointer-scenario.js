// In-page multi-device test library, installed through the dev bridge:
//   window.__mt.setup({ tool, preset, color, size, layerId })
//   window.__mt.stroke({ pts: [[fx, fy], ...] (fractions of the canvas rect), ms, perFrame })
//   window.__mt.sample(layerId, grid) -> per-cell mean RGBA over the layer's world extent
//   window.__mt.info()
// Returns JSON strings so the bridge answer is compact.
(() => {
  if (window.__mt) return 'already'
  const e = () => window.__engine
  const canvas = () => [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const mt = {}
  mt.info = () => {
    const E = e()
    const layers = [...E._layers.keys()].map(id => ({ id, ops: E._log.layerPixelOps(id).length }))
    return JSON.stringify({ href: location.pathname, ops: E.getOperations().length, layers, perf: E.getWatercolorPerf(), active: E._activeId })
  }
  mt.setup = ({ tool = 'watercolor', preset = 'normal:100:70:PB29:round', color = [0.2, 0.3, 0.6], size = 120, layerId = null }) => {
    const E = e()
    if (layerId) E.setActiveLayer(layerId)
    E.setTool(tool); E.setPencil(preset); E.setColor(color); E.setSize(size)
    return JSON.stringify({ active: E._activeId, tool })
  }
  mt.stroke = ({ pts, ms = 1500, perFrame = 2 }) => new Promise((resolve, reject) => {
    const E = e(); const p = E._pointer; const c = canvas(); const r = c.getBoundingClientRect()
    // A blocked or lost engine can otherwise report perfect idle rAF timing.
    // Selecting a tool only on E does not unlock Room's store-driven gate.
    if (E._locked || !E._paper.loaded || E.gl.isContextLost()
      || !E._activeId || !E._layers.has(E._activeId)) {
      throw new Error('Pen benchmark requires loaded paper, a drawable layer and a drawing tool selected in roomStore')
    }
    const origCapture = c.setPointerCapture; c.setPointerCapture = () => {}; c.releasePointerCapture = () => {}
    const P = pts.map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
    const seg = []; let L = 0
    for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); L += d }
    const at = (f) => { let s = f * L; for (let i = 0; i < seg.length; i++) { if (s <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, s / seg[i]) : 0; return [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k] } s -= seg[i] } return P[P.length - 1] }
    const mk = (x, y, ts, buttons) => { const ev = { clientX: x, clientY: y, pressure: 0.8, tiltX: 0, tiltY: 0, twist: 0, width: 1, height: 1, pointerType: 'pen', pointerId: 7, isPrimary: true, button: 0, buttons, timeStamp: ts, target: c, currentTarget: c, preventDefault() {}, stopPropagation() {}, getCoalescedEvents() { return [ev] }, getPredictedEvents() { return [] } }; return ev }
    const t0 = performance.now(); const frames = [t0]; let last = t0, penUpAt = t0, newTouch = null, tailFrames = 0
    p._handleDown(mk(P[0][0], P[0][1], t0, 1))
    const gestureId = E._strokeId
    if (!gestureId) {
      p._handleUp(mk(P[0][0], P[0][1], t0, 0)); c.setPointerCapture = origCapture
      throw new Error('Pen benchmark pointerdown did not start a stroke')
    }
    const tick = (now) => {
      frames.push(now)
      const samples = []
      for (let k = 1; k <= perFrame; k++) { const ts = last + (now - last) * k / perFrame; const [x, y] = at(Math.min(1, (ts - t0) / ms)); samples.push(mk(x, y, ts, 1)) }
      const ev = samples[samples.length - 1]; ev.getCoalescedEvents = () => samples
      window.__lastNativePenEvent=ev; p._handleMove(ev); last = now
      if (now - t0 < ms) { requestAnimationFrame(tick); return }
      const [x, y] = at(1); penUpAt = now; p._handleUp(mk(x, y, now, 0));
      const tail = (t) => { frames.push(t); if (++tailFrames === 2) { const start=performance.now();p._handleDown(mk(r.left+r.width*.5,r.top+r.height*.75,t,1));const id=E._strokeId;for(let j=1;j<=4;j++)p._handleMove(mk(r.left+r.width*(.5+j*.02),r.top+r.height*.75,t+j,1));p._handleUp(mk(r.left+r.width*.58,r.top+r.height*.75,t+5,0));newTouch={id,afterLift:t-penUpAt,handlerMs:performance.now()-start}; } if (!newTouch || t - now < 1500) requestAnimationFrame(tail); else done() }
      requestAnimationFrame(tail)
    }
    const done = () => {
      c.setPointerCapture = origCapture; const drawnOperations = E.getOperations().filter(op => op.type === 'stroke' && op.strokeId === gestureId).length
      if (E.gl.isContextLost() || drawnOperations <= 0) {
        reject(new Error('Pen benchmark did not record a stroke; discard idle frame timings'))
        return
      }
      const d = [], active = [], tail = []
      for (let i = 1; i < frames.length; i++) {
        const gap = frames[i] - frames[i - 1]
        d.push(gap); (frames[i] <= penUpAt ? active : tail).push(gap)
      }
      resolve(JSON.stringify({ newTouch, drawnOperations, n: d.length, over33: d.filter(v => v > 33).length, over100: d.filter(v => v > 100).length, max: Math.round(Math.max(0, ...d)),
        rawFrameTimes:frames, penUpAt,t0, activeMs: Math.round(penUpAt - t0), activeN: active.length, activeMax: Math.round(Math.max(0, ...active)),
        activeOver33: active.filter(v => v > 33).length, activeOver100: active.filter(v => v > 100).length,
        tailMax: Math.round(Math.max(0, ...tail)),
      }))
    }
    requestAnimationFrame(tick)
  })
  mt.sample = (layerId, grid = 48) => {
    const E = e(); const buf = E._layers.get(layerId)
    if (!buf) return JSON.stringify({ missing: true })
    const tiles = buf.allResident()
    if (!tiles.length) return JSON.stringify({ empty: true })
    // The same world rect on every device: the page, when the room has one.
    // (The resident tiles differ between devices, and a grid over their
    // union compared nothing with nothing.)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const pw = E._opts.pageWidth, ph = E._opts.pageHeight
    if (pw && ph) { minX = 0; minY = 0; maxX = pw; maxY = ph }
    else for (const t of tiles) { minX = Math.min(minX, t.originX); minY = Math.min(minY, t.originY); maxX = Math.max(maxX, t.originX + t.buffer.width); maxY = Math.max(maxY, t.originY + t.buffer.height) }
    const cw = (maxX - minX) / grid, ch = (maxY - minY) / grid
    const sum = new Float64Array(grid * grid * 4), cnt = new Float64Array(grid * grid)
    for (const t of tiles) {
      const w = t.buffer.width, h = t.buffer.height, px = t.buffer.readPixels()
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        const wx = t.originX + x, wy = t.originY + (h - 1 - y)
        if (wx < minX || wy < minY || wx >= maxX || wy >= maxY) continue
        const gx = Math.min(grid - 1, Math.floor((wx - minX) / cw)), gy = Math.min(grid - 1, Math.floor((wy - minY) / ch))
        const i = (y * w + x) * 4, g = gy * grid + gx
        sum[g * 4] += px[i]; sum[g * 4 + 1] += px[i + 1]; sum[g * 4 + 2] += px[i + 2]; sum[g * 4 + 3] += px[i + 3]; cnt[g]++
      }
    }
    const cells = []
    for (let g = 0; g < grid * grid; g++) for (let c = 0; c < 4; c++) cells.push(cnt[g] ? Math.round(sum[g * 4 + c] / cnt[g]) : 0)
    return JSON.stringify({ extent: [minX, minY, maxX, maxY], tiles: tiles.map(t => t.originX + ',' + t.originY).sort().join(' '), grid, ops: E._log.layerPixelOps(layerId).length, cells })
  }
  // Stall watch: every engine entry point that can take long, timed, plus the
  // browser's own long-animation-frame entries - to say WHAT a multi-second
  // frame was, not only that it happened.
  mt.watch = () => {
    const E = e()
    if (E.__watched) { window.__mtStalls.length = 0; return 'reset' }
    E.__watched = true
    const S = window.__mtStalls = []
    const wrap = (name, tag = (a) => '') => {
      const o = E[name]; if (typeof o !== 'function') return
      E[name] = function (...a) {
        const t = performance.now(); const r = o.apply(this, a); const d = performance.now() - t
        if (d > 150) S.push({ at: Math.round(t), ms: Math.round(d), what: name + tag(a) })
        return r
      }
    }
    wrap('appendOperation', a => ':' + (a[0] && a[0].type) + (a[0] && a[0].tool ? '/' + a[0].tool : '') + ':' + (a[1] || 'local'))
    wrap('appendPeerLiveDabs', a => ':' + ((a[1] && a[1].dabs && a[1].dabs.length) || 0) + 'dabs')
    for (const n of ['_rebuildLayer', '_flushPendingRebuilds', '_completeSettle', '_tickSettle', '_display', '_onEnd', '_takeCheckpoint', 'restoreLayerFromSnapshot', '_syncBuffersToLog']) wrap(n)
    try {
      new PerformanceObserver(l => { for (const x of l.getEntries()) if (x.duration > 300) S.push({ at: Math.round(x.startTime), ms: Math.round(x.duration), what: 'LoAF', scripts: (x.scripts || []).map(z => (z.sourceFunctionName || z.invoker || '?') + ':' + Math.round(z.duration)).slice(0, 5).join(' | '), renderStart: Math.round(x.renderStart - x.startTime) }) }).observe({ type: 'long-animation-frame', buffered: false })
    } catch (err) { S.push({ what: 'no LoAF: ' + String(err).slice(0, 60) }) }
    return 'watching'
  }
  mt.stalls = () => JSON.stringify((window.__mtStalls || []).slice(-40))
  window.__mt = mt
  return 'installed'
})()

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
  mt.stroke = ({ pts, ms = 1500, perFrame = 2 }) => new Promise(resolve => {
    const E = e(); const p = E._pointer; const c = canvas(); const r = c.getBoundingClientRect()
    const origCapture = c.setPointerCapture; c.setPointerCapture = () => {}; c.releasePointerCapture = () => {}
    const P = pts.map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
    const seg = []; let L = 0
    for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); L += d }
    const at = (f) => { let s = f * L; for (let i = 0; i < seg.length; i++) { if (s <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, s / seg[i]) : 0; return [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k] } s -= seg[i] } return P[P.length - 1] }
    const mk = (x, y, ts, buttons) => { const ev = { clientX: x, clientY: y, pressure: 0.8, tiltX: 0, tiltY: 0, twist: 0, width: 1, height: 1, pointerType: 'pen', pointerId: 7, isPrimary: true, button: 0, buttons, timeStamp: ts, target: c, currentTarget: c, preventDefault() {}, stopPropagation() {}, getCoalescedEvents() { return [ev] }, getPredictedEvents() { return [] } }; return ev }
    const frames = []; const t0 = performance.now(); let last = t0
    p._handleDown(mk(P[0][0], P[0][1], t0, 1))
    const tick = (now) => {
      frames.push(now)
      const samples = []
      for (let k = 1; k <= perFrame; k++) { const ts = last + (now - last) * k / perFrame; const [x, y] = at(Math.min(1, (ts - t0) / ms)); samples.push(mk(x, y, ts, 1)) }
      const ev = samples[samples.length - 1]; ev.getCoalescedEvents = () => samples
      p._handleMove(ev); last = now
      if (now - t0 < ms) { requestAnimationFrame(tick); return }
      const [x, y] = at(1); p._handleUp(mk(x, y, now, 0)); c.setPointerCapture = origCapture
      const tail = (t) => { frames.push(t); if (t - now < 1500) requestAnimationFrame(tail); else done() }
      requestAnimationFrame(tail)
    }
    const done = () => {
      const d = []; for (let i = 1; i < frames.length; i++) d.push(frames[i] - frames[i - 1])
      resolve(JSON.stringify({ n: d.length, over33: d.filter(v => v > 33).length, over100: d.filter(v => v > 100).length, max: Math.round(Math.max(0, ...d)) }))
    }
    requestAnimationFrame(tick)
  })
  mt.sample = (layerId, grid = 48) => {
    const E = e(); const buf = E._layers.get(layerId)
    if (!buf) return JSON.stringify({ missing: true })
    const tiles = buf.allResident()
    if (!tiles.length) return JSON.stringify({ empty: true })
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tiles) { minX = Math.min(minX, t.originX); minY = Math.min(minY, t.originY); maxX = Math.max(maxX, t.originX + t.buffer.width); maxY = Math.max(maxY, t.originY + t.buffer.height) }
    const cw = (maxX - minX) / grid, ch = (maxY - minY) / grid
    const sum = new Float64Array(grid * grid * 4), cnt = new Float64Array(grid * grid)
    for (const t of tiles) {
      const w = t.buffer.width, h = t.buffer.height, px = t.buffer.readPixels()
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        const wx = t.originX + x, wy = t.originY + (h - 1 - y)
        const gx = Math.min(grid - 1, Math.floor((wx - minX) / cw)), gy = Math.min(grid - 1, Math.floor((wy - minY) / ch))
        const i = (y * w + x) * 4, g = gy * grid + gx
        sum[g * 4] += px[i]; sum[g * 4 + 1] += px[i + 1]; sum[g * 4 + 2] += px[i + 2]; sum[g * 4 + 3] += px[i + 3]; cnt[g]++
      }
    }
    const cells = []
    for (let g = 0; g < grid * grid; g++) for (let c = 0; c < 4; c++) cells.push(cnt[g] ? Math.round(sum[g * 4 + c] / cnt[g]) : 0)
    return JSON.stringify({ extent: [minX, minY, maxX, maxY], grid, ops: E._log.layerPixelOps(layerId).length, cells })
  }
  window.__mt = mt
  return 'installed'
})()

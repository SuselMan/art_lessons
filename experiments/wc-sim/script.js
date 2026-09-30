// Scripted test strokes: the same six exercises every time, laid out on a
// 3×2 grid, driven by sim steps (not wall-clock), so a run is comparable
// across parameter changes and machines. Coordinates are normalized, y down.
//
//  ┌──────────────┬──────────────┬──────────────┐
//  │ 1 одиночный  │ 2 по-мокрому │ 3 блюм       │
//  │   залив      │ жёлт.+ультр. │ вода в       │
//  │              │              │ полусухой    │
//  ├──────────────┼──────────────┼──────────────┤
//  │ 4 лессировка │ 5 сухая      │ 6 гранулянция│
//  │   по сухому  │   кисть      │ ультр./инд.  │
//  └──────────────┴──────────────┴──────────────┘

const PANEL_W = 1 / 3, PANEL_H = 1 / 2

function panel(col, row) {
  const m = 0.05
  return { x0: col * PANEL_W + m, y0: row * PANEL_H + m, x1: (col + 1) * PANEL_W - m, y1: (row + 1) * PANEL_H - m }
}

// zig-zag fill of a rectangle, rows `gap` apart, slight pressure wobble
function washPath(x0, y0, x1, y1, gap, p = 0.85) {
  const pts = []
  let row = 0
  for (let y = y0; y <= y1 + 1e-6; y += gap, row++) {
    const l = [x0, y, p], r = [x1, y, p]
    if (row % 2 === 0) pts.push(l, r)
    else pts.push(r, l)
  }
  return pts
}

function blobPath(cx, cy, rad, turns = 3) {
  const pts = []
  const n = 60 * turns
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = t * turns * Math.PI * 2
    const r = rad * (1 - t * 0.85)
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.05, 0.85])
  }
  return pts
}

export function buildScript(opts = {}) {
  const bloomAt = opts.bloomAt ?? 3200
  const A = []
  const stroke = (brush, pts, speed = 1.2) => A.push({ type: 'stroke', brush, pts, speed })
  const wait = (steps) => A.push({ type: 'wait', steps })
  const mark = (name) => A.push({ type: 'mark', name })

  if (opts.name === 'puddle') {
    // quick edge-darkening check: three round puddles, let them dry on their own
    stroke({ slot: 0, water: 0.95, pigment: 0.35, size: 26 }, blobPath(0.22, 0.3, 0.1))
    stroke({ slot: 1, water: 0.8, pigment: 0.4, size: 26 }, blobPath(0.62, 0.3, 0.1))
    stroke({ slot: 3, water: 0.95, pigment: 0.3, size: 26 }, blobPath(0.4, 0.72, 0.1))
    wait(300)
    mark('wet')
    wait(25000)
    mark('final')
    return A
  }

  // 1. single wash left to dry on its own — a very wet rose puddle (tideline)
  {
    const p = panel(0, 0)
    stroke({ slot: 1, water: 0.9, pigment: 0.4, size: 26 }, blobPath((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.1))
  }
  // 2. wet-in-wet — yellow wash, ultramarine charged in right away, overlapping
  {
    const p = panel(1, 0)
    const mx = (p.x0 + p.x1) / 2
    stroke({ slot: 2, water: 0.75, pigment: 0.55, size: 26 }, washPath(p.x0 + 0.03, p.y0 + 0.04, mx + 0.03, p.y1 - 0.06, 0.04))
    stroke({ slot: 0, water: 0.75, pigment: 0.45, size: 26 }, washPath(mx - 0.01, p.y0 + 0.04, p.x1 - 0.03, p.y1 - 0.06, 0.04))
  }
  // 3. backrun base — ultramarine wash; the water drop comes later
  const p3 = panel(2, 0)
  stroke({ slot: 0, water: 0.7, pigment: 0.5, size: 26 }, washPath(p3.x0 + 0.03, p3.y0 + 0.04, p3.x1 - 0.03, p3.y1 - 0.06, 0.04))
  // 4. glaze base — hansa yellow band
  const p4 = panel(0, 1)
  stroke({ slot: 2, water: 0.65, pigment: 0.55, size: 24 }, washPath(p4.x0 + 0.03, p4.y0 + 0.05, p4.x1 - 0.03, p4.y0 + 0.17, 0.035))
  // 5. dry brush — fast strokes with a starving brush, indian red and ultramarine
  {
    const p = panel(1, 1)
    for (let i = 0; i < 4; i++) {
      const y = p.y0 + 0.06 + i * 0.09
      stroke({ slot: i % 2 ? 0 : 3, water: 0.04 + 0.035 * i, pigment: 0.9, size: 22 },
        [[p.x0 + 0.02, y, 0.5], [p.x1 - 0.02, y + 0.015, 0.8]], 3.0)
    }
  }
  // 6. granulation — ultramarine blob and indian red blob, separate
  {
    const p = panel(2, 1)
    const cx1 = p.x0 + 0.075, cx2 = p.x1 - 0.075, cy1 = p.y0 + 0.09, cy2 = p.y1 - 0.09
    stroke({ slot: 0, water: 0.8, pigment: 0.55, size: 26 }, blobPath(cx1, cy1, 0.045))
    stroke({ slot: 3, water: 0.8, pigment: 0.55, size: 26 }, blobPath(cx2, cy2, 0.045))
  }
  wait(300)
  mark('wet')
  wait(Math.max(0, bloomAt - 300))
  // 3. clean water dropped into the half-dry wash
  {
    const cx = (p3.x0 + p3.x1) / 2, cy = (p3.y0 + p3.y1) / 2 - 0.02
    stroke({ slot: 0, water: 0.95, pigment: 0.0, size: 20 }, blobPath(cx, cy, 0.025, 2), 0.6)
  }
  wait(1500)
  mark('bloom')
  wait(20000)
  mark('dry1')
  A.push({ type: 'dry' })
  // 4. glaze — rose and ultramarine bands across the dried yellow and each other
  {
    const x = (p4.x0 + p4.x1) / 2
    const vert = washPath(p4.y0 + 0.03, p4.x0 + 0.04, p4.y1 - 0.04, p4.x0 + 0.13, 0.03).map(([a, b, c]) => [b, a, c])
    stroke({ slot: 1, water: 0.6, pigment: 0.35, size: 20 }, vert)
    wait(20000)
    A.push({ type: 'dry' })
    stroke({ slot: 0, water: 0.6, pigment: 0.3, size: 20 }, washPath(x + 0.01, p4.y0 + 0.13, p4.x1 - 0.03, p4.y1 - 0.05, 0.035))
  }
  wait(20000)
  A.push({ type: 'dry' })
  mark('final')
  return A
}

export class ScriptRunner {
  constructor(sim, brush, actions, onMark) {
    this.sim = sim
    this.brush = brush
    this.actions = actions
    this.onMark = onMark
    this.i = 0
    this.cur = null
    this.done = false
    this.paused = false
  }

  // returns the brush segment for this substep (or null)
  tick() {
    while (!this.done && !this.paused) {
      if (!this.cur) {
        if (this.i >= this.actions.length) { this.done = true; this.onMark('done'); return null }
        this.cur = this._start(this.actions[this.i++])
      }
      const c = this.cur
      if (c.type === 'wait') {
        if (c.left-- > 0) return null
        this.cur = null
        continue
      }
      if (c.type === 'mark') { this.cur = null; this.onMark(c.name); continue }
      if (c.type === 'dry') { this.sim.dryAll(); this.cur = null; continue }
      if (c.type === 'stroke') {
        if (c.k >= c.samples.length - 1) { this.cur = null; continue }
        const a = c.samples[c.k], b = c.samples[c.k + 1]
        c.k++
        return this.brush.segment(a, b)
      }
    }
    return null
  }

  _start(act) {
    if (act.type === 'wait') return { type: 'wait', left: act.steps }
    if (act.type !== 'stroke') return { ...act }
    const n = this.sim.n, s = n / 1024
    Object.assign(this.brush, act.brush)
    this.brush.reservoir = 1
    this.brush.seed = (this.i * 13.7) % 100
    // resample the polyline at `speed` px (of a 1024 canvas) per step
    const pts = act.pts.map(([x, y, p]) => ({ x: x * n, y: (1 - y) * n, p }))
    const samples = [pts[0]]
    const step = act.speed * s
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const k = Math.max(1, Math.round(len / step))
      for (let j = 1; j <= k; j++) {
        const f = j / k
        samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, p: a.p + (b.p - a.p) * f })
      }
    }
    return { type: 'stroke', samples, k: 0 }
  }
}

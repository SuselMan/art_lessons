// Brush: turns pointer samples into one short capsule per sim substep, and
// keeps a reservoir so a long stroke runs out of water (and turns into dry brush).

export class Brush {
  constructor(n) {
    this.n = n
    this.size = 28     // radius at full pressure, in px of a 1024 canvas
    this.water = 0.65  // 0..1
    this.pigment = 0.5 // 0..1
    this.slot = 0
    this.reservoir = 1
    this.seed = 0
    this.down = false
    this.queue = []
    this.last = null
    this.path = null
  }

  get scale() { return this.n / 1024 }

  pointerDown(x, y, p) {
    this.down = true
    this.reservoir = 1
    this.seed = Math.random() * 100
    this.last = { x, y, p }
    this.queue = []
  }
  pointerMove(x, y, p) { if (this.down) this.queue.push({ x, y, p }) }
  pointerUp() { this.down = false }

  // Called once per frame: lay the samples of this frame out along arc length
  // so each of the frame's substeps gets its own piece of the path.
  beginFrame() {
    if (!this.last) { this.path = null; return }
    const pts = [this.last, ...this.queue]
    this.queue = []
    const cum = [0]
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    }
    this.path = { pts, cum, len: cum[cum.length - 1] }
    this.last = pts[pts.length - 1]
    this.wasDown = this.down
  }

  _at(t) {
    const { pts, cum, len } = this.path
    if (pts.length === 1 || len === 0) return pts[pts.length - 1]
    const s = t * len
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const a = pts[i - 1], b = pts[i]
    const f = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 1
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, p: a.p + (b.p - a.p) * f }
  }

  // Brush for substep k of n in this frame (or null when the pen is up).
  substep(k, n) {
    if (!this.path || (!this.down && !this.wasDown)) return null
    if (!this.down && this.path.len === 0) return null
    const a = this._at(k / n), b = this._at((k + 1) / n)
    return this.segment(a, b)
  }

  // Shared with the scripted strokes.
  segment(a, b) {
    const p = Math.max(0.05, b.p)
    const radius = Math.max(1.5, this.size * this.scale * (0.35 + 0.65 * p))
    const lvl = (0.02 + 0.98 * Math.pow(this.water, 1.5)) * (0.6 + 0.4 * p) * (0.25 + 0.75 * this.reservoir)
    // a starving brush only touches the tops of the grain; ramps in below lvl≈0.25
    const tt = Math.min(1, Math.max(0, (0.25 - lvl) / 0.19))
    const dryness = tt * tt * (3 - 2 * tt)
    const segLen = Math.hypot(b.x - a.x, b.y - a.y) / this.scale
    // drain: moving lays down a band of water, standing still keeps soaking
    const r1024 = radius / this.scale
    this.reservoir = Math.max(0, this.reservoir - (segLen * r1024 * 2 * lvl) / 400000 - (r1024 * r1024 * lvl) / 4e6)
    const pig = [0, 0, 0, 0]
    pig[this.slot] = this.pigment * 0.9 * (1 + 4 * dryness) // dry brush = thick paint
    return { a: [a.x, a.y], b: [b.x, b.y], radius, level: lvl, dryness, pressure: p, pig, seed: this.seed }
  }
}

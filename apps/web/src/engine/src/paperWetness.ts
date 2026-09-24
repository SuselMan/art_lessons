// #536, ADR 011 §17: where the paper is still wet.
//
// The one thing to understand before reading a line of this: **this field is
// never replayed and never shared.** It is live, local and ephemeral, it decays
// on a wall clock, and two participants' copies of it are allowed to disagree
// wildly — one of them may have joined ten seconds ago and have no copy at all.
//
// That is not a compromise, it is the design. A stroke must stay a pure
// function of its own operation (ADR 011 §2), so a thirty-second physical model
// of water sitting on paper cannot be part of replay state. What *is* recorded
// is the interaction: a stroke samples this field as it is drawn, quantizes
// what it saw, and writes that down (StrokeOperation.wet). Replay reads the
// answer instead of re-deriving it, so clocks stay entirely on the side of the
// live decision — the same trick washId already plays for wash grouping.
//
// Consequence, accepted deliberately (ADR 011 §17): the interaction is baked
// into dependent strokes when they are made, and undo does not go back and
// recompute it. Remove the puddle and the stroke that ran into it stays spread.
// The alternative is recomputing every later stroke on every undo, which is the
// live water model this whole design exists to avoid, and the frozen backdrop
// under a glaze already has exactly this shape.

/** Cell size of the grid, world px. Wetness has no fine structure — it is a
 *  region of paper, not a texture — so the grid only has to be finer than the
 *  smallest puddle anyone would lay, and coarse enough that a long stroke does
 *  not touch thousands of cells. */
//  #536 — 8 px, from 16. The rim bands are one to two px wide, so at a 16 px
//  cell the grid was an order of magnitude coarser than the thing drawn on it
//  and the meniscus came out a visible octagon following the cells: "почему она
//  так квадратится? Мы её квадратами рисуем?" — yes, and this is the square.
//  Four times the cells, which is still only a few thousand for a large wash,
//  against a display map capped at 160 texels a side either way.
export const WET_CELL_PX = 8

/** How long a patch of paper takes to go from flooded to bone dry, ms.
 *
 *  Far shorter than real paper, and on purpose: this is the window in which the
 *  *next* stroke can still work into what is there, and a window measured in
 *  real minutes would mean a mark laid at the start of a session still altering
 *  one laid much later, with nothing on screen to explain why. */
//  #536 — 60 s, from 25. Twenty-five seconds is shorter than it takes to lay
//  water, reach for the pigment slider and come back, so the technique the
//  whole field exists for kept failing on the clock rather than on the model:
//  "возможно правда что я пока переключал кисть оно уже подсыхало". The field
//  is ephemeral and display-only besides the interaction it hands each stroke,
//  so a longer window costs nothing but a sheen that lingers.
//  #536 — 30 s, from 60. Ilya, timing it against a real brush: drying should be
//  about twice as fast. The 60 s was reached from the other side, when the
//  window kept expiring before he could swap brushes, and that problem is now
//  solved by the field being right rather than by it being slow.
export const WET_DRY_MS = 30000

interface WetCell { w: number; at: number }

function key(cx: number, cy: number): string {
  return `${cx},${cy}`
}

export class PaperWetness {
  private readonly _layers = new Map<string, Map<string, WetCell>>()
  /** (#536) Water the gesture in progress has laid but not yet committed.
   *
   *  Two maps rather than one because the two readers want different answers.
   *  The *model* must not see it: a gesture that read its own water back
   *  believed every mark was painted into a puddle, which made a real puddle
   *  mean nothing. The *screen* must see it, and immediately — water appearing
   *  only when the pen lifts is not what wetting paper looks like.
   *
   *  Merged into the committed map at pen-up (commitPending). */
  private readonly _pending = new Map<string, Map<string, WetCell>>()
  /** (#536) Cells the gesture in progress has already drunk from, so a stroke
   *  drinks from each patch of paper once. See drain() for why once matters. */
  private readonly _drained = new Set<string>()
  /** The wettest thing on the paper and when it got that way, tracked as it is
   *  written rather than searched for.
   *
   *  It exists so "is anything still wet, and how wet" is O(1). The display
   *  side asks that question on a timer for as long as the paper takes to dry,
   *  and answering it by walking every cell turned an idle sheet into real
   *  work — which showed up first as unrelated tests timing out. */
  private _peak = 0
  private _peakAt = 0

  /** Linear rather than exponential decay, and it matters: an exponential never
   *  reaches zero, so cells would accumulate forever and "is this dry?" would
   *  never be quite true. */
  private static _decayed(cell: WetCell, now: number): number {
    // Clamped at zero, because a cell can legitimately be stamped *ahead* of
    // the moment being asked about: a stroke arriving from a peer carries the
    // clock it was drawn on, and the two need not agree. Without the clamp a
    // negative age read the cell as wetter than it was ever laid down — the
    // same sign error that made the tracked peak collapse (see _notePeak), one
    // level further down.
    const age = Math.max(now - cell.at, 0)
    if (age >= WET_DRY_MS) return 0
    return cell.w * (1 - age / WET_DRY_MS)
  }

  /** Water laid down by one dab. `amount` is how wet the brush was, 0..1.
   *
   *  Takes the max rather than adding: wetness is a state of the paper, not a
   *  quantity that piles up, and a brush passed over the same spot twice leaves
   *  it wet, not twice as wet. */
  deposit(
    layerId: string, x: number, y: number, radiusPx: number, amount: number, now: number,
    /** True while the gesture is still down: visible at once, invisible to
     *  sample() until commitPending. See _pending. */
    pending = false,
  ): void {
    if (amount <= 0) return
    const into = pending ? this._pending : this._layers
    let cells = into.get(layerId)
    if (!cells) { cells = new Map(); into.set(layerId, cells) }
    const r = Math.max(radiusPx, WET_CELL_PX * 0.5)
    const x0 = Math.floor((x - r) / WET_CELL_PX), x1 = Math.floor((x + r) / WET_CELL_PX)
    const y0 = Math.floor((y - r) / WET_CELL_PX), y1 = Math.floor((y + r) / WET_CELL_PX)
    const r2 = r * r
    // The cell the brush is actually standing in always counts, whatever the
    // geometry says: a dab smaller than a cell and sitting near its corner is
    // further from the centre than its own radius, and would otherwise wet
    // nothing at all.
    const homeX = Math.floor(x / WET_CELL_PX), homeY = Math.floor(y / WET_CELL_PX)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // (#536) The dab's own disc, not its bounding square. The square was
        // marking the corners too, which at this cell size put wetness a good
        // half-brush outside the mark on the diagonals — read, correctly, as
        // "why does the wetness lie so much wider than the brush".
        const dx = (cx + 0.5) * WET_CELL_PX - x
        const dy = (cy + 0.5) * WET_CELL_PX - y
        if (dx * dx + dy * dy > r2 && !(cx === homeX && cy === homeY)) continue
        const k = key(cx, cy)
        const prev = cells.get(k)
        const held = prev ? PaperWetness._decayed(prev, now) : 0
        cells.set(k, { w: Math.max(held, amount), at: now })
      }
    }
    this._notePeak(amount, now)
  }

  /** Folds one deposit into the O(1) peak.
   *
   *  Both values are carried forward to the *later* of the two clocks before
   *  they are compared, and that is the whole content of this method. Comparing
   *  them at `now` alone was correct only while every writer used the present:
   *  once a stroke could be laid down with the timestamp it was actually made
   *  at (a peer's operation, a replay — see _wetFromForeignStroke), `now` could
   *  be in the past, the age came out negative, and `peak()` returned a value
   *  *above* the stored one. Adopting that inflated value with the old
   *  timestamp then made the tracked peak collapse: one operation stamped 25 s
   *  ago dropped a peak of 1.0 to 0.3 at the same instant.
   *
   *  Which matters because everything that decides "is any of this still wet"
   *  is O(1) off this number and nothing walks the cells. Under-estimate it and
   *  the drying watcher stops with wet paper on screen, and the display then
   *  freezes on whatever it drew last — a puddle that never dries and cannot be
   *  made to. The invariant is that this may only ever over-estimate. */
  private _notePeak(amount: number, at: number): void {
    const t = Math.max(at, this._peakAt)
    const held = this.peak(t)
    const decay = Math.min(Math.max((t - at) / WET_DRY_MS, 0), 1)
    const mine = amount * (1 - decay)
    this._peak = Math.max(held, mine)
    this._peakAt = t
  }

  /** (#536) Water a brush passing over took *off* the paper — the other half of
   *  the exchange in watercolorWaterClock.
   *
   *  Scales the cell down and leaves `at` alone, which is the whole subtlety
   *  here. Writing the reduced value with a fresh timestamp would restart a
   *  full drying window from a lower level, so drinking from a puddle would
   *  make it last *longer*; keeping the original timestamp means the patch
   *  still reaches bone dry exactly when it always would, but sits lower the
   *  whole way there and so crosses the "wet enough to work into" threshold
   *  sooner. That is what "brush drags water off, puddle dries faster" is, in
   *  a field whose decay is a straight line.
   *
   *  Which is also why it takes no clock, unlike every other writer here: it
   *  scales the cell's stored amplitude, and the whole decay line moves down
   *  with it.
   *
   *  Committed cells only, never `_pending`: a stroke may not drink the water
   *  it is laying itself, for the same reason it may not read it (see
   *  _pending's own note, and the bug it was written for). */
  drain(layerId: string, x: number, y: number, radiusPx: number, fraction: number): void {
    if (fraction <= 0) return
    const cells = this._layers.get(layerId)
    if (!cells) return
    const keep = Math.max(0, 1 - fraction)
    // Once per cell per gesture. This runs once per pointer batch, and a dot
    // scribbled inside a puddle crosses the same few cells on every batch —
    // compounding even a small fraction forty times over drained the paper to
    // nothing under a stroke that never left the water (0.955^40 is 0.16).
    // Ilya's own operation log showed it: a stroke lying wholly in a puddle
    // recorded e,a,7,6,5,4,3,2,1,0… The physics agrees with the cap: a brush
    // drinks until it is full and then carries water, it does not keep
    // pumping a patch dry by passing over it.
    const r = Math.max(radiusPx, WET_CELL_PX * 0.5)
    const x0 = Math.floor((x - r) / WET_CELL_PX), x1 = Math.floor((x + r) / WET_CELL_PX)
    const y0 = Math.floor((y - r) / WET_CELL_PX), y1 = Math.floor((y + r) / WET_CELL_PX)
    const r2 = r * r
    const homeX = Math.floor(x / WET_CELL_PX), homeY = Math.floor(y / WET_CELL_PX)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * WET_CELL_PX - x
        const dy = (cy + 0.5) * WET_CELL_PX - y
        if (dx * dx + dy * dy > r2 && !(cx === homeX && cy === homeY)) continue
        const k = key(cx, cy)
        const cell = cells.get(k)
        if (!cell) continue
        const once = `${layerId}|${k}`
        if (this._drained.has(once)) continue
        this._drained.add(once)
        cell.w *= keep
      }
    }
    // _peak is deliberately not lowered. It is an over-estimate by design (see
    // its own note): too high only means the drying watcher runs a little
    // longer than it needs to, while too low would stop it over paper that is
    // still visibly wet — and this method cannot know whether the cell it just
    // drained was the peak one without walking the whole field.
  }

  /** Moves the gesture's own water into the committed field. Called at pen-up:
   *  from here on the next stroke may read it, which is the whole point. */
  commitPending(now: number): void {
    for (const [layerId, cells] of this._pending) {
      let dst = this._layers.get(layerId)
      if (!dst) { dst = new Map(); this._layers.set(layerId, dst) }
      for (const [k, cell] of cells) {
        const prev = dst.get(k)
        const held = prev ? PaperWetness._decayed(prev, now) : 0
        const w = Math.max(held, cell.w)
        dst.set(k, { w, at: cell.at })
        // The committed cell can be *wetter than it was* on a clock that has
        // just been restarted — a stroke laid inside a standing puddle carries
        // the puddle's own level forward with a fresh drying window. The peak
        // has to learn about that here, or it goes on decaying from before the
        // gesture and reaches zero while these cells are still wet. That is the
        // "мокрая линия осталась навсегда" shape: the surrounding puddle dries
        // on schedule and the stroke inside it is left on screen by a watcher
        // that has already given up.
        this._notePeak(w, cell.at)
      }
    }
    this._pending.clear()
    this._drained.clear()
  }

  /** Throws away the gesture's own water without committing it — the stroke was
   *  abandoned, or its own operation never happened. */
  dropPending(): void {
    this._pending.clear()
    this._drained.clear()
  }

  /** The wettest the paper is anywhere, right now. O(1). */
  peak(now: number): number {
    const age = Math.max(now - this._peakAt, 0)
    if (age >= WET_DRY_MS) return 0
    return this._peak * (1 - age / WET_DRY_MS)
  }

  /** How wet the paper is at a world point, 0..1. */
  sample(layerId: string, x: number, y: number, now: number): number {
    const cells = this._layers.get(layerId)
    if (!cells) return 0
    const cell = cells.get(key(Math.floor(x / WET_CELL_PX), Math.floor(y / WET_CELL_PX)))
    return cell ? PaperWetness._decayed(cell, now) : 0
  }

  /** (#536, s17.25) The wettest cell under a nib of `radiusPx` about the
   *  point - what a dab's profile digit records. At the centre alone a pass
   *  laid half a nib over the previous one read as landing on dry paper,
   *  because the centre line ran along the earlier nib's edge; the two
   *  waters had joined all the same, and the rig showed a ladder of inner
   *  tidelines where a flat wash has none. */
  sampleUnderNib(layerId: string, x: number, y: number, radiusPx: number, now: number): number {
    const cells = this._layers.get(layerId)
    if (!cells) return 0
    const r = Math.max(radiusPx, WET_CELL_PX * 0.5)
    const x0 = Math.floor((x - r) / WET_CELL_PX), x1 = Math.floor((x + r) / WET_CELL_PX)
    const y0 = Math.floor((y - r) / WET_CELL_PX), y1 = Math.floor((y + r) / WET_CELL_PX)
    const r2 = r * r
    const homeX = Math.floor(x / WET_CELL_PX), homeY = Math.floor(y / WET_CELL_PX)
    let peak = 0
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * WET_CELL_PX - x
        const dy = (cy + 0.5) * WET_CELL_PX - y
        if (dx * dx + dy * dy > r2 && !(cx === homeX && cy === homeY)) continue
        const cell = cells.get(key(cx, cy))
        if (cell) peak = Math.max(peak, PaperWetness._decayed(cell, now))
      }
    }
    return peak
  }

  /** Whether anything within `radiusPx` of the point is still wet enough to
   *  work into. This is what decides whether a stroke joins the wash already on
   *  the paper or starts a new one — a physical question ("did the brush land
   *  in something wet?") rather than a bookkeeping one ("was that recent?"). */
  anyWetNear(layerId: string, x: number, y: number, radiusPx: number, now: number, threshold = 0.06): boolean {
    const cells = this._layers.get(layerId)
    if (!cells) return false
    const r = Math.max(radiusPx, WET_CELL_PX)
    const x0 = Math.floor((x - r) / WET_CELL_PX), x1 = Math.floor((x + r) / WET_CELL_PX)
    const y0 = Math.floor((y - r) / WET_CELL_PX), y1 = Math.floor((y + r) / WET_CELL_PX)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = cells.get(key(cx, cy))
        if (cell && PaperWetness._decayed(cell, now) >= threshold) return true
      }
    }
    return false
  }

  /** Whether any of a layer's paper is still wet enough to work into. What a
   *  clean-water stroke asks before joining the wash already on the paper: the
   *  question for water is not "did I land in it" but "is it still there". */
  anyWet(layerId: string, now: number, threshold = 0.06): boolean {
    const cells = this._layers.get(layerId)
    if (!cells) return false
    for (const cell of cells.values()) {
      if (PaperWetness._decayed(cell, now) >= threshold) return true
    }
    return false
  }

  /** Drops cells that have finished drying. Called opportunistically — the map
   *  is small, but a long session over a large sheet would otherwise keep every
   *  cell it ever touched. */
  prune(now: number): void {
    for (const [layerId, cells] of this._layers) {
      for (const [k, cell] of cells) {
        if (now - cell.at >= WET_DRY_MS) cells.delete(k)
      }
      if (!cells.size) this._layers.delete(layerId)
    }
  }

  /** (#536) Drops a layer's water outright. Undo and "clear layer" call it:
   *  the field is not in the Operation Log and cannot be, so there is nothing
   *  to replay backwards — and paper that stays wet after the stroke that wet
   *  it has been undone is plainly wrong. Dropping the whole layer's water
   *  takes other strokes' with it, which is a small over-correction on a field
   *  that is ephemeral anyway and dries in seconds. */
  forgetLayer(layerId: string): void {
    this._layers.delete(layerId)
    this._pending.delete(layerId)
  }

  clear(): void {
    this._layers.clear()
    this._pending.clear()
    this._drained.clear()
    this._peak = 0
    this._peakAt = 0
  }

  /** Every wet cell across every layer, plus the world rect they cover — what
   *  the display pass needs, and it is a union rather than a per-layer answer
   *  because water is on the *paper*: layers are a way of organising marks, not
   *  separate sheets stacked in the air. Returns null when nothing is wet,
   *  which is the overwhelmingly common case and switches the whole overlay
   *  off rather than uploading a texture of zeroes. */
  bounds(now: number): { minCx: number; minCy: number; maxCx: number; maxCy: number } | null {
    let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity
    for (const [, cells] of [...this._layers, ...this._pending]) {
      for (const [k, cell] of cells) {
        if (PaperWetness._decayed(cell, now) <= 0.01) continue
        const comma = k.indexOf(',')
        const cx = Number(k.slice(0, comma)), cy = Number(k.slice(comma + 1))
        if (cx < minCx) minCx = cx
        if (cy < minCy) minCy = cy
        if (cx > maxCx) maxCx = cx
        if (cy > maxCy) maxCy = cy
      }
    }
    return minCx === Infinity ? null : { minCx, minCy, maxCx, maxCy }
  }

  /** Wetness at a cell, taking the wettest layer — see bounds() on why the
   *  layers are unioned rather than kept apart. */
  atCell(cx: number, cy: number, now: number): number {
    const k = key(cx, cy)
    let best = 0
    for (const [, cells] of [...this._layers, ...this._pending]) {
      const cell = cells.get(k)
      if (!cell) continue
      const w = PaperWetness._decayed(cell, now)
      if (w > best) best = w
    }
    return best
  }

  /** Live cells of one layer, for the display pass. World-space cell indices. */
  cellsOf(layerId: string, now: number): Array<{ cx: number; cy: number; w: number }> {
    const cells = this._layers.get(layerId)
    if (!cells) return []
    const out: Array<{ cx: number; cy: number; w: number }> = []
    for (const [k, cell] of cells) {
      const w = PaperWetness._decayed(cell, now)
      if (w <= 0.01) continue
      const comma = k.indexOf(',')
      out.push({ cx: Number(k.slice(0, comma)), cy: Number(k.slice(comma + 1)), w })
    }
    return out
  }
}

// ─── The recorded profile ───────────────────────────────────────────────────
//
// One hex digit per dab. Quantization happens *before* the live stroke uses the
// value, not after: both the live mark and its replay must read the identical
// numbers, or the stroke would redraw itself the moment the room reloaded. That
// failure has happened here before, with a per-batch water uniform, and cost a
// quarter of the mark's area.
//
// Per dab rather than per group of dabs so that every place a gesture gets cut
// — chunk operations, live packets — can take its own piece with a substring
// instead of an index calculation nobody will keep correct.

const HEX = '0123456789abcdef'

export function quantizeWet(v: number): string {
  return HEX[Math.max(0, Math.min(15, Math.round(v * 15)))]
}

export function dequantizeWet(ch: string): number {
  const i = HEX.indexOf(ch)
  return i < 0 ? 0 : i / 15
}

/** Wetness a stroke saw at `dabIndex`, read back out of a recorded profile.
 *  A short profile — the stroke went on past what was written, or the field is
 *  absent entirely — reads as dry, which is what an older recording is. */
export function wetAt(profile: string | undefined, dabIndex: number): number {
  if (!profile) return 0
  return dabIndex < profile.length ? dequantizeWet(profile[dabIndex]) : 0
}

/** (#536, s17.25) The wettest paper the operation ran over, anywhere along
 *  it: whether its water joined a puddle already on the sheet. */
export function wetPeak(profile: string | undefined): number {
  if (!profile) return 0
  let peak = 0
  for (let i = 0; i < profile.length; i++) peak = Math.max(peak, dequantizeWet(profile[i]))
  return peak
}

/** True when nothing in the profile is wet, i.e. there is nothing worth
 *  recording. Keeps the field off the overwhelming majority of strokes. */
export function isDryProfile(profile: string): boolean {
  for (let i = 0; i < profile.length; i++) if (profile[i] !== '0') return false
  return true
}

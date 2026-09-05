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
export const WET_CELL_PX = 24

/** How long a patch of paper takes to go from flooded to bone dry, ms.
 *
 *  Far shorter than real paper, and on purpose: this is the window in which the
 *  *next* stroke can still work into what is there, and a window measured in
 *  real minutes would mean a mark laid at the start of a session still altering
 *  one laid much later, with nothing on screen to explain why. */
export const WET_DRY_MS = 25000

interface WetCell { w: number; at: number }

function key(cx: number, cy: number): string {
  return `${cx},${cy}`
}

export class PaperWetness {
  private readonly _layers = new Map<string, Map<string, WetCell>>()

  /** Linear rather than exponential decay, and it matters: an exponential never
   *  reaches zero, so cells would accumulate forever and "is this dry?" would
   *  never be quite true. */
  private static _decayed(cell: WetCell, now: number): number {
    const age = now - cell.at
    if (age >= WET_DRY_MS) return 0
    return cell.w * (1 - age / WET_DRY_MS)
  }

  /** Water laid down by one dab. `amount` is how wet the brush was, 0..1.
   *
   *  Takes the max rather than adding: wetness is a state of the paper, not a
   *  quantity that piles up, and a brush passed over the same spot twice leaves
   *  it wet, not twice as wet. */
  deposit(layerId: string, x: number, y: number, radiusPx: number, amount: number, now: number): void {
    if (amount <= 0) return
    let cells = this._layers.get(layerId)
    if (!cells) { cells = new Map(); this._layers.set(layerId, cells) }
    const r = Math.max(radiusPx, WET_CELL_PX * 0.5)
    const x0 = Math.floor((x - r) / WET_CELL_PX), x1 = Math.floor((x + r) / WET_CELL_PX)
    const y0 = Math.floor((y - r) / WET_CELL_PX), y1 = Math.floor((y + r) / WET_CELL_PX)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = key(cx, cy)
        const prev = cells.get(k)
        const held = prev ? PaperWetness._decayed(prev, now) : 0
        cells.set(k, { w: Math.max(held, amount), at: now })
      }
    }
  }

  /** How wet the paper is at a world point, 0..1. */
  sample(layerId: string, x: number, y: number, now: number): number {
    const cells = this._layers.get(layerId)
    if (!cells) return 0
    const cell = cells.get(key(Math.floor(x / WET_CELL_PX), Math.floor(y / WET_CELL_PX)))
    return cell ? PaperWetness._decayed(cell, now) : 0
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

  forgetLayer(layerId: string): void {
    this._layers.delete(layerId)
  }

  clear(): void {
    this._layers.clear()
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

/** True when nothing in the profile is wet, i.e. there is nothing worth
 *  recording. Keeps the field off the overwhelming majority of strokes. */
export function isDryProfile(profile: string): boolean {
  for (let i = 0; i < profile.length; i++) if (profile[i] !== '0') return false
  return true
}

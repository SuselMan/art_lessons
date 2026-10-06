import type { Dab } from '@grafetto/shared'

import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from './ILayerBuffer'
import type { RibbonScratchPool } from './RibbonScratchPool'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonProfile } from '../dabs/ribbonProfile'
import type { WcTrailDab } from '../presets/watercolorPresets'
import type { BrushTravel } from '../watercolor/brushDrag'
import type { WaterFootprint, WaterSource } from '../watercolor/foreignWater'

/** Per-marker-stroke, per-tile scratch state (follow-up to #250: the
 *  original per-dab patch-copy-then-multiply design compounded darker at
 *  every dab overlap, since it multiplied whatever the *previous dab of
 *  this same stroke* had already written — and multiply has no natural
 *  ceiling the way normal "over" accumulation does, so a dense, heavily-
 *  overlapping stroke showed regular dark banding/chevrons at the dab-
 *  spacing interval, worst on the elongated chisel nib. See #251/QA — real
 *  reproduction on both desktop and a tablet). Fixed by separating two
 *  concerns that used to be conflated into one "read the live layer" step:
 *
 *  - `original`: this tile's content exactly as it was *before* this stroke
 *    touched it, frozen the first time the stroke reaches this tile and
 *    never updated again for the rest of the stroke.
 *  - `coverage`: this stroke's silhouette/alpha only — how much of the tile
 *    this stroke has visually touched so far, a perfectly ordinary
 *    saturating "over" splat (DAB_FRAG's u_inkMode>2.5 branch), so densely
 *    overlapping dabs converge to one smooth flat value instead of
 *    compounding.
 *  - `inkLoad` (ADR 004 "Ревизия v1.5"): how much ink this stroke has
 *    actually *deposited* so far — accumulated *additively*
 *    (AccumulationBuffer.beginAdditiveDraw, no per-splat ceiling), by
 *    `dab.opacity * segmentLength` per dab (distance-normalized — see
 *    _ribbonStrokeWork), not a flat per-dab amount. Deliberately separate
 *    from `coverage`: conflating the two into one saturating value (v1's
 *    own design) meant a spot that had already reached full coverage
 *    stopped darkening on further overlapping passes within the same
 *    stroke — wrong, a real marker keeps darkening (toward its own
 *    asymptote) if you scribble back over the same spot without lifting.
 *
 *  DAB_FRAG's u_inkMode>1.5 branch multiplies `original` by a darkness
 *  derived from the *total* accumulated `inkLoad` (saturating only at read
 *  time, `1 - exp(-inkLoad*rate)`) every time it redraws a dab's footprint,
 *  and separately blends alpha toward 1 by `coverage` — always against the
 *  same frozen base, never the previous dab's own already-multiplied
 *  output.
 *
 *  Lives for exactly one stroke, never reused across strokes (unlike
 *  smudge's own per-user reservoir, a real carried physical resource) —
 *  see engine._onStart/_onEnd for the live-drawing lifecycle, and
 *  _paintRibbonDabs' own doc comment for the one-shot-replay case (which
 *  just creates and destroys its own throwaway instance within one call,
 *  needing no cross-call lifecycle at all). */
/** One tile's worth of a ribbon stroke's scratch state. `inkLoad` is null for a
 *  tool whose composite doesn't read one — see RibbonStrokeScratch's ctor. */
export interface RibbonTileScratch {
  original: AccumulationBuffer
  coverageFilm?: AccumulationBuffer
  coverageFilmGesture?: number
  coverageCommands?: Array<() => void>
  coverage: AccumulationBuffer
  inkLoad: AccumulationBuffer | null
  /** (#536, §17.17) The deposit as it stood after the wash's last settle —
   *  the FIXED paint. What the diffusion moves is inkLoad minus this: the
   *  paint laid since, and only that. Null when inkLoad is. */
  inkSettled: AccumulationBuffer | null
  /** (#536, §17.19) The optical depth of the paint per texel, .rgb, and its
   *  mass in .a — the wash's colour record (pigmentOptics.ts). Written by the
   *  ink pass beside inkLoad, moved by the diffusion by the same fractions. */
  inkColor: AccumulationBuffer | null
  /** Its settled counterpart, as inkSettled is to inkLoad. */
  colorSettled: AccumulationBuffer | null
  /** (#536, s17.28) The gesture's FILM: its stamps and bands under MAX, so a
   *  texel holds the thickest thing the brush left there and never the
   *  count of overlapping stamps. inkLoad is rebuilt per batch as
   *  inkBase + strokeInk, inkBase being the wash as it stood when this
   *  gesture began (refreshed on the first batch of each gesture). The
   *  colour record has the same pair. Null until a gesture with film draws. */
  strokeInk: AccumulationBuffer | null
  inkBase: AccumulationBuffer | null
  strokeColor: AccumulationBuffer | null
  colorBase: AccumulationBuffer | null
  /** Which gesture the film buffers belong to (RibbonStrokeScratch.gesture). */
  filmGesture: number
  /** (#536, §17.42) The wash's PROVISIONAL DRY TARGET: inkLoad - the wet
   *  state, which is what the next operation of the wash starts from - with
   *  the one tide laid along the outer contour of the wash's whole coverage,
   *  recomputed at every pen-up. The composite reads this, never inkLoad,
   *  once it exists; the live batches composite inkLoad (wet plus film), so
   *  a brush touching the wash shows it wet again until the pen lifts. Null
   *  under the per-operation drying A/B (wcOpDry). */
  inkDry: AccumulationBuffer | null
  colorDry: AccumulationBuffer | null
  /** Dev-only solvent thickness V/4, independent of pigment/depth headroom. */
  foreignSolventLoad?: AccumulationBuffer | null
  solventLoad?: AccumulationBuffer | null
  solventBase?: AccumulationBuffer | null
  strokeSolvent?: AccumulationBuffer | null
  solventGesture?: number
}

/** Parked state is zero-padded in full, regardless of a display's scissor. */
function clearParkedBuffer(buffer: AccumulationBuffer): void {
  const gl = buffer.gl, scissor = gl.isEnabled(gl.SCISSOR_TEST)
  if (scissor) gl.disable(gl.SCISSOR_TEST)
  buffer.clear()
  if (scissor) gl.enable(gl.SCISSOR_TEST)
}

type ScratchBounds = { minX: number; minY: number; maxX: number; maxY: number }

export class RibbonStrokeScratch {
  /** Transient next-film continuation while the previous settle is pending. */
  trackRunningCoverage = false

  runningCoverage(tile: AccumulationBuffer): AccumulationBuffer | undefined {
    if (!this.trackRunningCoverage) return undefined
    const entry = this.getOrCreate(tile)
    if (entry.coverageFilmGesture !== this.gesture) {
      if (entry.coverageFilm) this.pool.release(entry.coverageFilm)
      entry.coverageFilm = this.pool.acquire(tile.width, tile.height)
      entry.coverage.copyTo(entry.coverageFilm)
      entry.coverageCommands = []
      entry.coverageFilmGesture = this.gesture
    }
    return entry.coverageFilm
  }

  recordRunningCoverage(tile: AccumulationBuffer, draw: () => void): void {
    if (this.trackRunningCoverage) this.getOrCreate(tile).coverageCommands?.push(draw)
  }

  releaseRunningCoverage(forget = false): void {
    for (const entry of this._tiles.values()) {
      if (entry.coverageFilm && !forget) this.pool.release(entry.coverageFilm)
      entry.coverageFilm = undefined; entry.coverageFilmGesture = undefined; entry.coverageCommands = undefined
    }
    this.trackRunningCoverage = false
  }

  /** Conservative proof: fresh cleared P/C only; restoration is unknown. */
  pigmentInputsKnownZero = true

  // #702: every rectangle written to the non-original buffers, including
  // diffusion's halo. Undefined means an older carried state has no proof
  // of its empty exterior and must be kept whole.
  private _storageBounds: ScratchBounds | null | undefined = null

  noteStorageBounds(bounds: ScratchBounds): void {
    const old = this._storageBounds
    if (old === undefined) return
    this._storageBounds = old ? {
      minX: Math.min(old.minX, bounds.minX), minY: Math.min(old.minY, bounds.minY),
      maxX: Math.max(old.maxX, bounds.maxX), maxY: Math.max(old.maxY, bounds.maxY),
    } : { ...bounds }
  }
  private _tiles = new Map<AccumulationBuffer, RibbonTileScratch>()
  private readonly pool: RibbonScratchPool
  /** (#536, §17.19) Whether tiles carry inkColor — watercolor only. */
  private readonly needsColor: boolean
  /** (#536, §17.20) Every paint laid into this wash, as colour keys. While it
   *  is one paint, the colour record is the deposit times one absorption and
   *  the diffusion need not carry it — see _diffuseWash. */
  readonly paints = new Set<string>()
  /** (#536, §17.21) What each dab of the batch just painted left standing on
   *  the sheet (watercolorStandingWater) — the ribbon build writes it, and
   *  whoever feeds the live wetness field reads it, so the field and the
   *  wash's coverage .b are fed one number. Cleared per batch; the keys are
   *  the batch's own dab objects. */
  readonly standing = new Map<Dab, number>()
  /** (#536, §17.22) Live batches no longer composite one by one: each adds
   *  its rect here, and the engine composites the union once per displayed
   *  frame (_flushLiveComposite). Keyed by tile buffer. */
  readonly pendingComposite = new Map<AccumulationBuffer, { tile: PaintTarget; bounds: { minX: number; minY: number; maxX: number; maxY: number } }>()
  private readonly needsInk: boolean
  /** (#468 v3) How much of the brush's load this gesture has spent so far,
   *  measured in brush radii of travel (ADR 011 §3.8).
   *
   *  Lives on the scratch rather than on the engine because that is the one
   *  object all three paths already share for the length of exactly one
   *  gesture: a live stroke's batches, a one-shot replay's single call, and a
   *  chunked replay's several operations. Put it on the engine and replay would
   *  either carry it between unrelated strokes or reset it at every chunk
   *  boundary — and a seam in the depletion is a visible band across the mark. */
  private _waterUsed = 0
  /** (#536, ADR 011 §17.11) Whether deposit has been laid since the wash's
   *  pigment was last diffused. The diffusion is the one pass in this tool
   *  that is *not* idempotent — every run is N more steps — so it may run
   *  exactly once per operation, on every path alike: a live chunk flush, the
   *  pen-up, a replayed chunk, a peer's operation. This flag is what makes
   *  that true whichever path calls _finishRibbonStroke and however often. */
  diffusePending = false
  /** (#536) The same clock for pigment, and the reason it is a second number
   *  rather than the same one is the brush drinking from wet paper.
   *
   *  Picking up water rewinds the water clock (watercolorWaterClock). Pigment
   *  must not come back with it: dragging a brush through a puddle of clean
   *  water does not reload it with paint, it dilutes what is left. So travel
   *  advances both, and only water is ever given back.
   *
   *  On dry paper the two are the same number to the last bit, which is what
   *  keeps every stroke that never meets water behaving exactly as it did. */
  private _pigmentUsed = 0

  /** (#468 v6) The composite's scalar uniforms, fixed for the whole gesture.
   *
   *  They cannot be per batch. The composite is a *recomputation* over a whole
   *  rect, so whichever batch wrote a pixel last decides its scalars — and with
   *  per-batch values that showed up immediately as rectangular tone blocks
   *  along a live stroke, one per pointer event, which is precisely what
   *  "штрих постоянно странно меняется" was.
   *
   *  Derived from the gesture's *first* dab, which is the one thing a live
   *  stroke and a replay of it are guaranteed to agree on: live sees it as the
   *  first dab of its first batch, a one-shot replay as the first dab of the
   *  only batch. Anything averaged over a batch would differ between the two. */
  private _composite: {
    spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; bristleRadiusPx: number
    /** (#468 v10) Where the noise fields are anchored.
     *
     *  A constant of the gesture, and that is a bug fix rather than tidiness.
     *  It used to be *this batch's* first dab, so the whole texture shifted by
     *  a few pixels on every pointer event — the mark's grain visibly crawled
     *  backwards under the pen as it was drawn, and then landed somewhere else
     *  again at pen-up, because the final pass anchored on the gesture's first
     *  dab instead. On a long straight stroke the same shifting showed up as a
     *  row of discs at the batch pitch. */
    fieldSeed: [number, number]
  } | null = null

  compositeScalars(make: () => { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; fieldSeed: [number, number]; bristleRadiusPx: number }): { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; fieldSeed: [number, number]; bristleRadiusPx: number } {
    if (!this._composite) this._composite = make()
    return this._composite
  }

  /** (#468 v6) The gesture's dab spacing, cached the first time two consecutive
   *  dabs are actually available.
   *
   *  Measured rather than derived, because what it has to match is
   *  DabSystem's `baseSize * spacingFactor` — and `baseSize` is the tool's
   *  *nominal* size, which no operation records: dabs carry their post-pressure,
   *  post-taper sizes instead. The distance between the stroke's own first two
   *  dabs is that spacing, and it is the same pair of dabs whether they arrive
   *  in one replayed batch or across two live ones (the second case reaches
   *  them through prevDab), so both paths measure the identical number.
   *
   *  Zero until a pair exists — a first batch of exactly one dab covers a few
   *  px at the stroke's start, and the next batch's padded rect recomposites it
   *  anyway. */
  private _dabSpacing = 0
  /** (#468 v6) Everything the gesture's final recomposite needs, plus the union
   *  of every batch's bounds.
   *
   *  It exists because reasoning about whether the incremental per-batch
   *  composites are *sufficient* turned out to be a trap: three plausible
   *  arguments that they were, and a measured 26% of the mark still differing
   *  between a live stroke and a replay of it. So the last thing a gesture does
   *  is now exactly what a replay does — one composite over the whole mark with
   *  the finished buffers — and the two agree by construction rather than by
   *  argument.
   *
   *  This is not the old settle pass. That one *introduced* terms the live
   *  batches had switched off, and re-read scalars from the first batch, which
   *  is why the mark jumped at pen-up. Every scalar here is already a constant
   *  of the gesture, so the final pass recomputes the same values the batches
   *  did — it only fixes pixels that were composited before all their ink had
   *  arrived. */
  private _finish: {
    target: ILayerBuffer; preset: PencilPreset; profile: RibbonProfile
    color: [number, number, number]; opacity: number
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    fieldSeed: [number, number]
    /** (#536, §17.23) The recorded wetness of the paper where this operation
     *  LANDED — its first dab's digit — so the settle can tell a drop into a
     *  damp wash (a bloom) from one into a wet or a dry one. The first dab,
     *  as everything else the gesture decides once (see _paintRibbonDabs):
     *  it is the one sample a live stroke and its replay are sure to share,
     *  and the profile after it is strided and trimmed. */
    landedWet: number
    /** (#536, §17.25) The wettest paper the operation ran over (wetPeak):
     *  whether its water joined a puddle already there. */
    wetPeak: number
    /** (#536, §17.23) The widest dab radius of the operation, px. */
    radiusPx: number
    /** (#536, §17.37) How long the brush stood on landing, ms. */
    dwellMs: number
  } | null = null

  /** (#536, §17.42) What the group tide needs when the wash dries as one
   *  component (watercolorDryWash): the composite's constants from the LAST
   *  settled operation, the widest radius and the wettest standing level
   *  of any, and the union of every settle's bounds. Set by the settle. */
  dryCtx: {
    target: ILayerBuffer; preset: PencilPreset; profile: RibbonProfile
    color: [number, number, number]; opacity: number; fieldSeed: [number, number]
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    radiusPx: number; standing: number
  } | null = null

  noteFinish(ctx: NonNullable<RibbonStrokeScratch['_finish']>): void {
    this.noteStorageBounds(ctx.bounds)
    const prev = this._finish
    if (!prev) { this._finish = ctx; return }
    prev.dwellMs = Math.max(prev.dwellMs, ctx.dwellMs)
    prev.bounds = {
      minX: Math.min(prev.bounds.minX, ctx.bounds.minX),
      minY: Math.min(prev.bounds.minY, ctx.bounds.minY),
      maxX: Math.max(prev.bounds.maxX, ctx.bounds.maxX),
      maxY: Math.max(prev.bounds.maxY, ctx.bounds.maxY),
    }
    prev.radiusPx = Math.max(prev.radiusPx, ctx.radiusPx)
    // A stroke can enter a puddle after its first live batch. Retain the
    // wettest landing across every batch, just as a single-batch replay does.
    prev.wetPeak = Math.max(prev.wetPeak, ctx.wetPeak)
  }

  get finishContext(): RibbonStrokeScratch['_finish'] {
    return this._finish
  }

  /** The scratch this tile already has, or null — deliberately not getOrCreate:
   *  a tile inside the gesture's bounding box that its dabs never reached has
   *  nothing to recomposite, and snapshotting one would spend three pooled
   *  buffers writing it back unchanged. */
  peek(tile: AccumulationBuffer): RibbonTileScratch | null {
    return this._tiles.get(tile) ?? null
  }

  /** (#579) The digital watercolor's wet-edge reach, fixed by the gesture's
   *  first dab — the same "first dab is what live and replay agree on" rule
   *  as the spacing below. A per-batch value would draw a rim of a different
   *  width across every batch boundary. */
  private _brushEdgePx = 0

  noteBrushEdgePx(px: number): number {
    if (this._brushEdgePx === 0 && px > 0) this._brushEdgePx = px
    return this._brushEdgePx
  }

  noteDabSpacing(gap: number): number {
    if (this._dabSpacing === 0 && gap > 0.01) this._dabSpacing = gap
    return this._dabSpacing
  }

  /** (#468 v8) The gesture's opening direction, cached the first time a real
   *  segment exists. Same first-two-dabs rule the spacing follows, and for the
   *  same reason: it is the one measurement a live stroke and a replay of it
   *  are guaranteed to agree on. */
  private _dir: [number, number] = [1, 0]
  private _dirSet = false

  noteDirection(dx: number, dy: number): [number, number] {
    if (!this._dirSet) {
      const len = Math.hypot(dx, dy)
      if (len > 0.01) { this._dir = [dx / len, dy / len]; this._dirSet = true }
    }
    return this._dir
  }

  get waterUsed(): number {
    return this._waterUsed
  }

  get pigmentUsed(): number {
    return this._pigmentUsed
  }

  advanceWater(water: number, pigment: number): void {
    this._waterUsed = water
    this._pigmentUsed = pigment
  }

  /** (#468 v7) A new stroke joins this wash. Only the brush's own load resets —
   *  lifting the brush and putting it back down means a freshly charged brush,
   *  but the paint already on the paper is still there and still wet.
   *
   *  Everything else deliberately survives: the frozen pre-wash content, the
   *  accumulated coverage and deposit, the noise field's seed and the composite
   *  scalars. That is what makes a second band laid beside the first merge with
   *  it instead of arriving as another mark on top — the two share one
   *  silhouette, so there is no boundary between them to draw, and only the
   *  outer perimeter of the whole wash gets a tideline. */
  /** (§17.28) The last dab that deposited — the anchor the travel quantum
   *  measures from (watercolorTravelQuantum). Per gesture. */
  lastKept: Dab | undefined = undefined
  /** (§17.28) Counts the gestures of this wash; the film buffers of a tile
   *  are refreshed when a batch arrives from a gesture they were not made for. */
  gesture = 0
  /** (#536, §17.37) The gesture's landing: where the nib came down and its
   *  radius there, and how long it stood within WC_DWELL_RADIUS of it before
   *  moving on (the dabs' own clock, Dab.t). Frozen once a dab leaves. Per
   *  gesture, and a pure function of the operation's dabs, so a replay
   *  counts the same dwell to the millisecond. */
  landing: { x: number; y: number; r: number; t: number } | null = null
  dwellMs = 0
  dwellDone = false
  /** (#680, §17.74) The gesture's recent kept dabs (oldest first, at most
   *  WC_TRAIL_LEN), the dwell at every dab is read back over; and the brush's
   *  surplus the slowdowns left - pigment and water - with the pigment clock
   *  it was last carried to. Per gesture, a pure function of its dabs. */
  turnOffset: [number, number] = [0, 0]
  turnDirection: [number, number] | null = null
  brushTravel: BrushTravel[] = []
  foreignSources: WaterSource[] | null = null
  foreignImportedGestures = new Set<string>()
  wetContacts: WaterFootprint[] = []
  trail: WcTrailDab[] = []
  /** (#680) The pen's smoothed speed (px/ms) and its recent peak. */
  speed = 0
  speedPeak = 0
  speedAt = -1
  speedTravel = 0
  brakePigment = 0
  surplusPigment = 0
  surplusWater = 0
  surplusAt = 0
  /** (#536, §17.43) Ends the gesture's FILM without ending the gesture: the
   *  next batch starts a fresh film over the wash as the settle just left
   *  it. Called at a chunk boundary, live and on replay alike, right after
   *  the chunk's settle has landed — the film's base is refreshed from
   *  inkLoad on the next batch (filmBuffers), so the settled chunk is what
   *  the rest of the stroke paints over. Without this the next batch rebuilt
   *  inkLoad as the PRE-gesture base plus the whole film and threw the
   *  chunk's settle away — live only sometimes, by frame timing, so a long
   *  stroke came back different after a reload. */
  newFilm(): void {
    this.brushTravel = []
    this.gesture++
  }

  /** (#536, §17.43) Gives the film buffers back once a settle has landed:
   *  four tile-sized textures per tile that are only read between the first
   *  batch of a gesture and its settle, and were held for the life of the
   *  wash - with the replay cache's four washes that was 384 MB of scratch
   *  on a two-tile layer, and the rebuild behind an undo on top of it. The
   *  next gesture (or chunk) acquires them again from the pool. */
  releaseFilm(gesture = this.gesture): void {
    for (const entry of this._tiles.values()) if (entry.coverageFilmGesture === gesture) {
      if (entry.coverageFilm) this.pool.release(entry.coverageFilm)
      entry.coverageFilm = undefined; entry.coverageFilmGesture = undefined; entry.coverageCommands = undefined
    }
    for (const entry of this._tiles.values()) {
      if (entry.solventGesture === gesture) {
        for (const b of [entry.strokeSolvent, entry.solventBase]) if (b) this.pool.release(b)
        entry.strokeSolvent = null; entry.solventBase = null; entry.solventGesture = -1
      }
      // Only the film the landed settle consumed: a chunk's settle lands
      // while the next chunk's film is being painted.
      if (entry.filmGesture !== gesture) continue
      for (const b of [entry.strokeInk, entry.inkBase, entry.strokeColor, entry.colorBase]) if (b) this.pool.release(b)
      entry.strokeInk = null; entry.inkBase = null; entry.strokeColor = null; entry.colorBase = null
      entry.filmGesture = -1
    }
  }

  beginStroke(): void {
    this.lastKept = undefined
    this.gesture++
    this.turnOffset = [0, 0]
    this.turnDirection = null
    this.landing = null
    this.dwellMs = 0
    this.dwellDone = false
    this.trail = []
    this.speed = 0
    this.speedPeak = 0
    this.speedAt = -1
    this.speedTravel = 0
    this.brushTravel = []
    this.foreignSources = null
    this.wetContacts = []
    this.brakePigment = 0
    this.surplusPigment = 0
    this.surplusWater = 0
    this.surplusAt = 0
    this._waterUsed = 0
    // (#536) Including everything the brush drank from the paper last stroke.
    // The exchange is intra-stroke by decision — see watercolorWaterClock's own
    // note on why the brush is not allowed hidden state that outlives a mark.
    this._pigmentUsed = 0
    // (#536, §17.23) The finish context is the GESTURE's: its bounds, its
    // landing wetness, its radius. It used to outlive the stroke, so every
    // pen-up of a wash recomposited the union of every stroke so far and
    // read the first stroke's landing for the bloom of the last.
    this._finish = null
  }

  /** `needsInk` false skips the third buffer entirely (#454): a covering,
   *  source-over ink has no per-pixel pigment quantity for the composite to
   *  read, so allocating and clearing one per tile would be a buffer and two
   *  draw calls spent on a value nothing samples. See RibbonProfile.ink. */
  constructor(pool: RibbonScratchPool, needsInk = true, needsColor = false) {
    this.pool = pool
    this.needsInk = needsInk
    this.needsColor = needsColor
  }

  /** Keyed by the tile's own AccumulationBuffer identity — stable across
   *  repeated resolveForPaint calls for the same resident tile (see
   *  TiledLayerBuffer.getOrCreateTile), so no tile-coordinate bookkeeping is
   *  needed here. 'nearest' filtering: all three buffers are always sampled
   *  1:1 (same size and pixel alignment as the tile they mirror — see
   *  DAB_FRAG's own u_original/u_strokeCoverage/u_inkLoad comment), so
   *  'linear' would buy nothing and 'nearest' keeps this deterministic
   *  across GPU vendors, same reasoning every other scratch-texture pool in
   *  this file already follows (paper grain's own hard-won lesson — see
   *  .claude/rules.md).
   *
   *  v1 accepted gap: if this tile gets evicted (TiledLayerBuffer's memory
   *  budget) mid-stroke and later recovered as a *new* AccumulationBuffer
   *  instance, this map won't recognize it as the same tile and will
   *  silently re-snapshot — a fresh (still correct, just not maximally
   *  "original") base rather than a crash or a wrong result. Not worth
   *  guarding against for v1: a single marker gesture spans very few tiles,
   *  nowhere near what it'd take to force an eviction on its own. */
  /** (§17.28) The gesture's film buffers for a tile, made or refreshed for
   *  the current gesture: the base is the deposit as it stands now, the film
   *  starts empty. */
  filmBuffers(tile: AccumulationBuffer): { strokeInk: AccumulationBuffer; inkBase: AccumulationBuffer; strokeColor: AccumulationBuffer | null; colorBase: AccumulationBuffer | null } | null {
    const entry = this.getOrCreate(tile)
    if (!entry.inkLoad) return null
    if (entry.filmGesture !== this.gesture) {
      entry.strokeInk ??= this.pool.acquire(tile.width, tile.height)
      entry.inkBase ??= this.pool.acquire(tile.width, tile.height)
      entry.strokeInk.clear()
      entry.inkLoad.copyTo(entry.inkBase)
      if (entry.inkColor) {
        entry.strokeColor ??= this.pool.acquire(tile.width, tile.height)
        entry.colorBase ??= this.pool.acquire(tile.width, tile.height)
        entry.strokeColor.clear()
        entry.inkColor.copyTo(entry.colorBase)
      }
      entry.filmGesture = this.gesture
    }
    return { strokeInk: entry.strokeInk!, inkBase: entry.inkBase!, strokeColor: entry.strokeColor, colorBase: entry.colorBase }
  }

  /** Read-only iteration; the scratch retains ownership of these buffers. */
  tileEntries(): IterableIterator<[AccumulationBuffer, RibbonTileScratch]> { return this._tiles.entries() }

  getOrCreate(tile: AccumulationBuffer): RibbonTileScratch {
    let entry = this._tiles.get(tile)
    if (!entry) {
      // (#385) From the pool, and every one of them is fully written before it
      // is read — copyTo overwrites `original` outright, the others are
      // cleared — so a reused buffer carries nothing of whatever gesture had
      // it last.
      const original = this.pool.acquire(tile.width, tile.height)
      tile.copyTo(original)
      const coverage = this.pool.acquire(tile.width, tile.height)
      coverage.clear()
      let inkLoad: AccumulationBuffer | null = null
      let inkColor: AccumulationBuffer | null = null
      if (this.needsInk) {
        inkLoad = this.pool.acquire(tile.width, tile.height)
        inkLoad.clear()
        if (this.needsColor) {
          inkColor = this.pool.acquire(tile.width, tile.height)
          inkColor.clear()
        }
      }
      // The settled pair is taken on the first settle, by the pass that needs
      // it — a marker gesture never does, and three buffers a tile was already
      // the churn #385 is about.
      entry = { original, coverage, inkLoad, inkSettled: null, inkColor, colorSettled: null, strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1, inkDry: null, colorDry: null }
      this._tiles.set(tile, entry)
    }
    return entry
  }

  /** Bounded diagnostic solvent state: one loaded-contact film is V=1;
   * RGBA8 stores V/4. MAX within the gesture, additive/capped between films. */
  solventFilm(tile: AccumulationBuffer): { load: AccumulationBuffer; base: AccumulationBuffer; film: AccumulationBuffer } {
    const entry = this.getOrCreate(tile)
    if (!entry.solventLoad) { entry.solventLoad = this.pool.acquire(tile.width, tile.height); entry.solventLoad.clear() }
    if (entry.solventGesture !== this.gesture) {
      entry.strokeSolvent ??= this.pool.acquire(tile.width, tile.height)
      entry.solventBase ??= this.pool.acquire(tile.width, tile.height)
      entry.strokeSolvent.clear(); entry.solventLoad.copyTo(entry.solventBase)
      entry.solventGesture = this.gesture
    }
    return { load: entry.solventLoad, base: entry.solventBase!, film: entry.strokeSolvent! }
  }

  /** Ends this gesture's use of its buffers. Named as it always was, and it
   *  still means "this scratch is finished with" — what changed (#385) is that
   *  the buffers go back to the pool instead of to the driver. */
  destroy(): void {
    this._storageBounds = null
    this._waterUsed = 0
    this._pigmentUsed = 0
    this.diffusePending = false
    this.pendingComposite.clear()
    this._composite = null
    this._dabSpacing = 0
    this._brushEdgePx = 0
    this._dirSet = false
    this._dir = [1, 0]
    this._finish = null
    this.releaseRunningCoverage()
    for (const { original, coverage, inkLoad, inkSettled, inkColor, colorSettled, strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry, solventLoad, solventBase, strokeSolvent, foreignSolventLoad } of this._tiles.values()) {
      for (const b of [strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry, solventLoad, solventBase, strokeSolvent, foreignSolventLoad]) if (b) this.pool.release(b)
      this.pool.release(original); this.pool.release(coverage)
      if (inkLoad) this.pool.release(inkLoad)
      if (inkSettled) this.pool.release(inkSettled)
      if (inkColor) this.pool.release(inkColor)
      if (colorSettled) this.pool.release(colorSettled)
    }
    this._tiles.clear()
  }

  /** Context loss: the GL objects are already dead, so neither release nor
   *  destroy is meaningful — just let go of them. */
  forget(): void {
    this.trackRunningCoverage = false
    this._tiles.clear()
    this.pendingComposite.clear()
  }

  /** (#536, §17.22) Whether this scratch still holds its tiles — false once
   *  destroyed or forgotten, which is how a settle in flight learns that the
   *  wash it was settling is gone. */
  get live(): boolean {
    return this._tiles.size > 0
  }

  /** (#536, §17.56) The wash as the next operation of it will find it, at an
   *  operation boundary: every texture that outlives a gesture's film, copied
   *  into buffers of its own (the checkpoint keeps them; this scratch goes on
   *  being painted), and every number the next operation reads. The film is
   *  not taken — at a boundary it is released or about to be refreshed for a
   *  new gesture (filmBuffers), so the restored tile starts without one.
   *  `originOf` names each tile by its place on the sheet: the replay that
   *  restores this paints into another buffer. */
  snapshot(gl: WebGLRenderingContext, originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): ScratchSnapshot | null {
    if ([...this._tiles.values()].some(entry => entry.coverageFilm)) return null
    const tiles: ScratchSnapshot['tiles'] = []
    for (const [tile, entry] of this._tiles) {
      const at = originOf(tile)
      if (!at) return null
      const bufs: ScratchSnapshot['tiles'][number]['bufs'] = {}
      for (const k of SNAPSHOT_TILE_BUFFERS) {
        const b = entry[k]
        if (!b) continue
        const copy = new AccumulationBuffer(gl, b.width, b.height, 'nearest')
        b.copyTo(copy)
        bufs[k] = copy
      }
      tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
    }
    return { ...this._scalars(), tiles }
  }

  /** Every number the next operation of this wash reads - see snapshot. */
  private _scalars(): ScratchScalars {
    return {
      needsInk: this.needsInk, needsColor: this.needsColor,
      storageBounds: this._storageBounds ? { ...this._storageBounds } : this._storageBounds,
      paints: [...this.paints], waterUsed: this._waterUsed, pigmentUsed: this._pigmentUsed,
      composite: this._composite ? { ...this._composite, fieldSeed: [...this._composite.fieldSeed] } : null,
      dabSpacing: this._dabSpacing, brushEdgePx: this._brushEdgePx, dir: [...this._dir], dirSet: this._dirSet,
      finish: this._finish ? { ...this._finish, bounds: { ...this._finish.bounds }, fieldSeed: [...this._finish.fieldSeed] } : null,
      dryCtx: this.dryCtx ? { ...this.dryCtx, bounds: { ...this.dryCtx.bounds }, fieldSeed: [...this.dryCtx.fieldSeed] } : null,
      lastKept: this.lastKept ? { ...this.lastKept } : undefined, gesture: this.gesture,
      landing: this.landing ? { ...this.landing } : null, dwellMs: this.dwellMs, dwellDone: this.dwellDone,
      turnOffset: [...this.turnOffset], turnDirection: this.turnDirection ? [...this.turnDirection] : null, brushTravel: this.brushTravel.map(d => ({ ...d })), foreignSources: this.foreignSources, foreignImportedGestures: [...this.foreignImportedGestures], wetContacts: this.wetContacts.map(d => ({ ...d })),
      trail: this.trail.map(d => ({ ...d })), speed: this.speed, speedPeak: this.speedPeak, speedAt: this.speedAt, speedTravel: this.speedTravel, brakePigment: this.brakePigment, surplusPigment: this.surplusPigment, surplusWater: this.surplusWater, surplusAt: this.surplusAt,
    }
  }

  private _applyScalars(snap: ScratchScalars, target: ILayerBuffer): void {
    this.pigmentInputsKnownZero = false

    this._storageBounds = snap.storageBounds ? { ...snap.storageBounds } : snap.storageBounds
    for (const p of snap.paints) this.paints.add(p)
    this._waterUsed = snap.waterUsed
    this._pigmentUsed = snap.pigmentUsed
    this._composite = snap.composite ? { ...snap.composite, fieldSeed: [...snap.composite.fieldSeed] } : null
    this._dabSpacing = snap.dabSpacing
    this._brushEdgePx = snap.brushEdgePx
    this._dir = [snap.dir[0], snap.dir[1]]
    this._dirSet = snap.dirSet
    this._finish = snap.finish ? { ...snap.finish, target, bounds: { ...snap.finish.bounds }, fieldSeed: [...snap.finish.fieldSeed] } : null
    this.dryCtx = snap.dryCtx ? { ...snap.dryCtx, target, bounds: { ...snap.dryCtx.bounds }, fieldSeed: [...snap.dryCtx.fieldSeed] } : null
    this.lastKept = snap.lastKept ? { ...snap.lastKept } : undefined
    this.gesture = snap.gesture
    this.landing = snap.landing ? { ...snap.landing } : null
    this.dwellMs = snap.dwellMs
    this.dwellDone = snap.dwellDone
    this.turnOffset = [...snap.turnOffset]
    this.turnDirection = snap.turnDirection ? [...snap.turnDirection] : null
    this.brushTravel = snap.brushTravel.map(d => ({ ...d }))
    this.foreignSources = snap.foreignSources
    this.foreignImportedGestures = new Set(snap.foreignImportedGestures ?? [])
    this.wetContacts = snap.wetContacts.map(d => ({ ...d }))
    this.trail = snap.trail.map(d => ({ ...d }))
    this.speed = snap.speed
    this.speedPeak = snap.speedPeak
    this.speedAt = snap.speedAt
    this.speedTravel = snap.speedTravel
    this.brakePigment = snap.brakePigment
    this.surplusPigment = snap.surplusPigment
    this.surplusWater = snap.surplusWater
    this.surplusAt = snap.surplusAt
  }

  /** #702: park a resting wash in compact GPU buffers. CPU readback waits
   * for the whole context's queue, even for 1x1, so it cannot be a background
   * memory operation. Keep original whole: a continuation may enter a new
   * area whose pre-wash picture must still be the same. Other buffers start
   * clear and only receive writes inside storageBounds. GPU sub-rect copies
   * preserve every byte; unpark clears the missing exterior. */
  spill(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): SpilledScratch | null {
    const work = this.spillWork(originOf)
    let r = work.next()
    while (!r.done) r = work.next()
    return r.value
  }

  *spillWork(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): Generator<void, SpilledScratch | null, void> {
    if (this.diffusePending || this.pendingComposite.size) return null
    const tiles: SpilledScratch['tiles'] = []
    const owned = new Set<AccumulationBuffer>(), moved = new Set<AccumulationBuffer>()
    let bytes = 0, committed = false
    const takeBuffer = (b: AccumulationBuffer): void => { owned.delete(b) }
    const releaseBuffer = (b: AccumulationBuffer): void => { if (owned.delete(b)) this.pool.release(b) }
    const dispose = (): void => { for (const b of owned) this.pool.release(b); owned.clear() }
    try {
      for (const [tile, entry] of this._tiles) {
        if (entry.coverageFilm || entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase || entry.strokeSolvent || entry.solventBase) return null
        const at = originOf(tile)
        if (!at) return null
        const bufs: SpilledScratch['tiles'][number]['bufs'] = {}
        const whole = (b: AccumulationBuffer): ParkedScratchBuffer => {
          moved.add(b); bytes += b.width * b.height * 4
          return { buffer: b, glX: 0, glY: 0, srcX: 0, srcY: 0, w: b.width, h: b.height, whole: true }
        }
        bufs.original = whole(entry.original)
        const parts = SPILL_TILE_BUFFERS.filter(k => k !== 'original' && entry[k])
        const bounds = this._storageBounds
        const x0 = bounds ? Math.max(0, Math.floor(bounds.minX - at.originX)) : 0
        const y0 = bounds ? Math.max(0, Math.floor(bounds.minY - at.originY)) : 0
        const x1 = bounds ? Math.min(tile.width, Math.ceil(bounds.maxX - at.originX)) : tile.width
        const y1 = bounds ? Math.min(tile.height, Math.ceil(bounds.maxY - at.originY)) : tile.height
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
        const columns = Math.max(1, Math.floor(tile.width / w)), rows = Math.max(1, Math.floor(tile.height / h))
        const capacity = columns * rows
        const atlasCount = Math.ceil(parts.length / capacity)
        // Tile-sized atlases reuse the film's released buffers. Arbitrarily
        // sized small textures were themselves 100ms allocations on Safari.
        // When packing saves no memory, move the original buffers instead.
        if (atlasCount >= parts.length) {
          for (const k of parts) bufs[k] = whole(entry[k]!)
        } else {
          let atlas: AccumulationBuffer | undefined
          for (const [i, k] of parts.entries()) {
            if (i % capacity === 0) {
              atlas = this.pool.acquire(tile.width, tile.height)
              owned.add(atlas); bytes += tile.width * tile.height * 4
            }
            const srcX = (i % capacity % columns) * w, srcY = Math.floor(i % capacity / columns) * h
            const glX = Math.min(tile.width - 1, x0), glY = Math.min(tile.height - 1, Math.max(0, tile.height - y1))
            if (x1 > x0 && y1 > y0) entry[k]!.copyRegionInto(atlas!, glX, glY, srcX, srcY, w, h)
            else {
              // A present-but-empty field must remain present after restore.
              // Empty intersects are rare, so a full clear is safe and cheap.
              clearParkedBuffer(atlas!)
            }
            bufs[k] = { buffer: atlas!, glX, glY, srcX, srcY, w, h, whole: false }
            yield
          }
        }
        tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
      }
      const result = { ...this._scalars(), tiles, bytes, dispose, takeBuffer, releaseBuffer }
      // Ownership moves only on successful completion. Until now the active
      // scratch was untouched and cancellation can simply release its copies.
      for (const b of moved) owned.add(b)
      for (const entry of this._tiles.values()) for (const k of SPILL_TILE_BUFFERS) {
        const b = entry[k]
        if (b && !moved.has(b)) this.pool.release(b)
      }
      this._tiles.clear()
      committed = true
      return result
    } finally { if (!committed) dispose() }
  }

  /** A parked wash back in full-sized, zero-padded scratch buffers. */
  static unspill(pool: RibbonScratchPool, sp: SpilledScratch, target: ILayerBuffer): RibbonStrokeScratch | null {
    const s = new RibbonStrokeScratch(pool, sp.needsInk, sp.needsColor)
    s._applyScalars(sp, target)
    const references = new Map<AccumulationBuffer, number>()
    for (const t of sp.tiles) for (const p of Object.values(t.bufs)) if (p) {
      references.set(p.buffer, (references.get(p.buffer) ?? 0) + 1)
    }
    try {
      for (const t of sp.tiles) {
        const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
        const tile = target.resolveForPaint(rect).find(r => r.originX === t.originX && r.originY === t.originY)?.buffer
        if (!tile) { s.destroy(); return null }
        const take = (p: ParkedScratchBuffer | undefined): AccumulationBuffer | null => {
          if (!p) return null
          if (p.whole) { sp.takeBuffer(p.buffer); return p.buffer }
          const own = pool.acquire(t.width, t.height)
          clearParkedBuffer(own)
          p.buffer.copyRegionInto(own, p.srcX, p.srcY, p.glX, p.glY, p.w, p.h)
          const left = references.get(p.buffer)! - 1
          references.set(p.buffer, left)
          // Reuse a consumed atlas for later full-sized fields rather than
          // allocating a texture while continuing the wash.
          if (left === 0) sp.releaseBuffer(p.buffer)
          return own
        }
        const original = take(t.bufs.original), coverage = take(t.bufs.coverage)
        if (!original || !coverage) { if (original) pool.release(original); if (coverage) pool.release(coverage); s.destroy(); return null }
        s._tiles.set(tile, {
          original, coverage, inkLoad: take(t.bufs.inkLoad), inkSettled: take(t.bufs.inkSettled),
          inkColor: take(t.bufs.inkColor), colorSettled: take(t.bufs.colorSettled),
          strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1,
          inkDry: take(t.bufs.inkDry), colorDry: take(t.bufs.colorDry),
          solventLoad: take(t.bufs.solventLoad), foreignSolventLoad: take(t.bufs.foreignSolventLoad),
        })
      }
      return s
    } finally { sp.dispose() }
  }

  /** (#536, §17.56) A scratch as `snap` describes it, its tiles copied into
   *  pooled buffers and keyed by `target`'s own tiles at the same places. */
  static restore(pool: RibbonScratchPool, snap: ScratchSnapshot, target: ILayerBuffer): RibbonStrokeScratch {
    const s = new RibbonStrokeScratch(pool, snap.needsInk, snap.needsColor)
    s._applyScalars(snap, target)
    for (const t of snap.tiles) {
      const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
      const tile = target.resolveForPaint(rect).find(r => r.originX === t.originX && r.originY === t.originY)?.buffer
      if (!tile) continue
      const take = (b: AccumulationBuffer | undefined): AccumulationBuffer | null => {
        if (!b) return null
        const own = pool.acquire(b.width, b.height)
        b.copyTo(own)
        return own
      }
      const original = take(t.bufs.original), coverage = take(t.bufs.coverage)
      if (!original || !coverage) continue
      s._tiles.set(tile, {
        original, coverage, inkLoad: take(t.bufs.inkLoad), inkSettled: take(t.bufs.inkSettled),
        inkColor: take(t.bufs.inkColor), colorSettled: take(t.bufs.colorSettled),
        strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1,
        inkDry: null, colorDry: null,
        solventLoad: take(t.bufs.solventLoad), foreignSolventLoad: take(t.bufs.foreignSolventLoad),
      })
    }
    return s
  }
}

/** (#536, §17.56) The tile textures of a wash that outlive a gesture. Not
 *  the provisional dry picture (inkDry/colorDry): the next operation's settle
 *  lays it again before the composite reads it, and leaving it out was the
 *  same to a level on the devices and a quarter less memory (80 MB of
 *  carried washes on the iPad instead of 96). */
const SNAPSHOT_TILE_BUFFERS = ['original', 'coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled', 'solventLoad', 'foreignSolventLoad'] as const

export function scratchSnapshotBytes(snap: ScratchSnapshot): number {
  let n = 0
  for (const t of snap.tiles) for (const b of Object.values(t.bufs)) if (b) n += b.width * b.height * 4
  return n
}

export function freeScratchSnapshot(snap: ScratchSnapshot): void {
  for (const t of snap.tiles) for (const b of Object.values(t.bufs)) b?.destroy()
}

/** (#536, §17.56) Every number of a RibbonStrokeScratch the next operation
 *  of its wash reads. */
interface ScratchScalars {
  storageBounds?: ScratchBounds | null
  needsInk: boolean; needsColor: boolean
  paints: string[]; waterUsed: number; pigmentUsed: number
  composite: { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; bristleRadiusPx: number; fieldSeed: [number, number] } | null
  dabSpacing: number; brushEdgePx: number; dir: [number, number]; dirSet: boolean
  finish: Omit<NonNullable<RibbonStrokeScratch['finishContext']>, 'target'> | null
  dryCtx: Omit<NonNullable<RibbonStrokeScratch['dryCtx']>, 'target'> | null
  lastKept: Dab | undefined; gesture: number
  landing: { x: number; y: number; r: number; t: number } | null; dwellMs: number; dwellDone: boolean
  turnOffset: [number, number]; turnDirection: [number, number] | null; brushTravel: BrushTravel[]; foreignSources: WaterSource[] | null; foreignImportedGestures: string[]; wetContacts: WaterFootprint[]
  trail: WcTrailDab[]; speed: number; speedPeak: number; speedAt: number; speedTravel: number; brakePigment: number; surplusPigment: number; surplusWater: number; surplusAt: number
}

/** (#536, §17.56) See RibbonStrokeScratch.snapshot. */
export interface ScratchSnapshot extends ScratchScalars {
  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SNAPSHOT_TILE_BUFFERS[number], AccumulationBuffer>> }>
}

/** (#536, §17.68) Every tile buffer of an open wash at rest. */
const SPILL_TILE_BUFFERS = ['original', 'coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled', 'inkDry', 'colorDry', 'solventLoad', 'foreignSolventLoad'] as const

/** (§17.68) See RibbonStrokeScratch.spill. */
interface ParkedScratchBuffer { buffer: AccumulationBuffer; glX: number; glY: number; srcX: number; srcY: number; w: number; h: number; whole: boolean }
export interface SpilledScratch extends ScratchScalars {
  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SPILL_TILE_BUFFERS[number], ParkedScratchBuffer>> }>
  bytes: number
  dispose(): void
  takeBuffer(buffer: AccumulationBuffer): void
  releaseBuffer(buffer: AccumulationBuffer): void
}

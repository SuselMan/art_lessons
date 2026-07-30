import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from './ILayerBuffer'
import { COARSE_FACTORS, TILE_SIZE, coarseTileWorldRect, fineTileSlot, fineToCoarseTile, parseTileKey, tileKey, tileWorldRect, tilesOverlappingRect, worldToTile, type CoarseFactor, type WorldRect } from './tileMath'

/** (#155 Tier 2) Scans a tile's exact RGBA8 pixel content for its real
 *  alpha!=0 bounding box, tile-local pixel space, half-open like WorldRect
 *  (maxX/maxY exclusive). Null if every pixel is fully transparent. The one
 *  place this engine still pays a real readPixels + per-pixel CPU scan —
 *  now only at the two moments a tile's exact historical pixels are already
 *  being handed over wholesale (eviction recovery, checkpoint restore), not
 *  on every content-bounds query the way it used to be.
 *
 *  gl.readPixels' rows are bottom-up (row 0 = GL/window bottom), but every
 *  other buffer-pixel value in this engine is app-space top-down (y=0 at
 *  the top) — same gap DAB_VERT bridges when painting and TRANSFORM_BLIT_FRAG
 *  bridges when baking a transform; flipped here so the returned rect is in
 *  the same top-down convention every other WorldRect in this file uses. */
function scanLocalContentRect(
  pixels: Uint8Array, width: number, height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width, maxX = -1, minRow = height, maxRow = -1
  for (let row = 0; row < height; row++) {
    const base = row * width
    for (let x = 0; x < width; x++) {
      if (pixels[(base + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (row < minRow) minRow = row
      if (row > maxRow) maxRow = row
    }
  }
  if (maxX < minX) return null
  const minY = height - 1 - maxRow
  const maxY = height - 1 - minRow
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1 }
}

// #144: byte budget for one TiledLayerBuffer instance's *resident* tiles —
// same spirit and same order of magnitude as engine/index.ts's own
// CHECKPOINT_BUDGET_BYTES, but expressed as a tile *count* derived from this
// instance's own tileW/tileH (computed once in the constructor, see
// maxResidentTiles) rather than a fixed number of tiles: #142 means tile size
// varies per room (infinite rooms: fixed TILE_SIZE x TILE_SIZE; bounded
// rooms: their own canvas.width x canvas.height), so a flat tile-count cap
// would either be far too generous for a huge bounded canvas or far too
// stingy for a small one. Deriving the cap from bytes keeps the ceiling
// meaningful regardless of how big this instance's own tiles happen to be.
const TILE_BUDGET_BYTES = 128 * 1024 * 1024
// Floor on resident tile count, regardless of what the byte budget above
// alone would compute — guarantees a handful of tiles (comfortably more
// than a bounded room ever legitimately has resident: usually exactly one,
// occasionally a couple more from a layer_transform dragging content past
// its visible page's edge) always stay resident no matter how big this
// instance's own tiles are. Without this, an extreme custom bounded canvas
// (bytes-per-tile alone exceeding the whole budget) would compute a cap of 0
// and evict-then-immediately-rebuild its own one-and-only tile on every
// single paint — exactly the pointless-churn regression the eviction
// feature must not introduce for bounded rooms (see class docstring).
const MIN_RESIDENT_TILES = 8

/** One rebuild-on-demand pass's worth of recovered tile content — see
 *  TileRebuilder. Short-lived: acquired right before a batch of evicted
 *  tiles needs recovering, queried once per tile in that batch, then
 *  destroyed — never held onto across TiledLayerBuffer method calls. */
export interface TileRebuildSession {
  /** RGBA8 pixel content (tileW*tileH*4 bytes) for the tile whose exact
   *  tile-aligned world rect is `rect`, or null if this layer never had any
   *  content there as of whatever moment this session's rebuild snapshot
   *  represents — the same "nothing here" meaning as a tile that was never
   *  created at all. */
  readPixels(rect: WorldRect): Uint8Array | null
  /** Releases whatever scratch resources this session used internally. */
  destroy(): void
}

/** Supplied by the engine (see engine/index.ts's _makeTileRebuilder) to a
 *  real, persistent layer's TiledLayerBuffer only — never to a short-lived
 *  scratch/temp instance (merge sources, transform-preview scratch tiles),
 *  which have no lasting content worth budgeting or recovering in the first
 *  place. Its mere presence is what turns eviction on for an instance (see
 *  the constructor) — this is the seam TiledLayerBuffer needs to stay
 *  engine-agnostic: it knows *when* a tile should be evicted and *that* it
 *  can be safely recovered, but not *how* (that requires the Operation Log
 *  and checkpoint/replay machinery, which live in engine/index.ts). */
export type TileRebuilder = () => TileRebuildSession

/** (#365) Draws one fine tile's whole texture, shrunk, into a `w x h` slot at
 *  (`x`, `y`) — top-down pixel coordinates — of the coarse tile's buffer,
 *  replacing whatever was there rather than blending over it. Supplied by the
 *  engine for the same reason TileRebuilder is: TiledLayerBuffer owns *when*
 *  the coarse level is out of date, but has no shader programs of its own and
 *  no business gaining any. */
export type TileDownsampler = (
  source: AccumulationBuffer, dest: AccumulationBuffer,
  x: number, y: number, w: number, h: number,
) => void

/** Tile-backed ILayerBuffer (Phase 1, #133; #142 generalized to bounded
 *  rooms too; #144 added byte-budget eviction) — a sparse
 *  Map<tileKey, AccumulationBuffer> of currently GPU-resident tiles, one
 *  tileW x tileH AccumulationBuffer per tile, created lazily the first time
 *  something paints into it.
 *
 *  tileW/tileH default to TILE_SIZE (infinite rooms' own fixed, square tile
 *  size), but a bounded room's own layer buffers are constructed with
 *  tileW/tileH set to that room's canvas.width/canvas.height instead (see
 *  engine/index.ts's _makeLayerBuffer) — its "tile grid" is rooted at world
 *  origin with cells the size of its own visible page, so a canvas smaller
 *  than TILE_SIZE in both dimensions (matching old BoundedLayerBuffer
 *  sizing/pixel-indexing byte-for-byte) still resolves to exactly one
 *  resident tile once painted, while a layer_transform dragging content
 *  past that visible page's edge creates an *adjacent*, identically-sized
 *  tile rather than clipping it away.
 *
 *  #144 eviction: once a `rebuildTile` callback is supplied (real, persistent
 *  layer buffers only — see TileRebuilder's own doc comment), a tile is a
 *  genuine eviction candidate the moment it stops being the least-recently-
 *  touched resident tile past this instance's own byte budget
 *  (maxResidentTiles, derived from TILE_BUDGET_BYTES / this instance's own
 *  tile size). "Evicted" never means "gone": every tile's content is always
 *  exactly reproducible from replaying its layer's pixel ops (the Operation
 *  Log architecture's whole point — see CLAUDE.md), so evicting just means
 *  destroying its GPU texture now and remembering (in `evicted`) that it
 *  existed, so a later access transparently recovers it through
 *  `rebuildTile` instead of either losing its content or mistaking it for a
 *  tile that was never touched at all (which resolveVisible/allResident
 *  must keep contributing nothing for, same as always). `resolveVisible`
 *  and `allResident` both bump a resident tile's recency on every read, not
 *  just `resolveForPaint`'s writes — this is what keeps whatever tiles are
 *  actually on screen (or otherwise in active use) safely away from the
 *  LRU end regardless of how many *other* tiles a big room has touched, so
 *  ordinary panning within budget never thrashes. (#363) The budget is a
 *  soft target, not a hard cap: a single resolve call's own tiles are never
 *  evicted, so a view wider than the budget — an infinite room at low zoom —
 *  deliberately stays over it while it's on screen rather than destroying
 *  pixels the caller is mid-way through drawing. See evictIfOverBudget.
 *  `allResident` in
 *  particular must recover *every* evicted tile before returning (never
 *  just the ones asked about) — callers (checkpoint, merge, transform
 *  bake/preview) rely on it as "this layer's entire content," and if it
 *  silently omitted evicted tiles a checkpoint/merge/bake would silently
 *  drop real content. Scratch/temp instances (no rebuildTile) never evict
 *  at all — maxResidentTiles is Infinity for them — matching the pre-#144
 *  behavior exactly, correctly: they're short-lived and never re-queried
 *  after the one operation that made them, so there's nothing to gain and a
 *  real correctness gap to lose (recovering one would need a rebuildTile
 *  they were never given). */
export class TiledLayerBuffer implements ILayerBuffer {
  private readonly gl: WebGLRenderingContext
  private readonly tileW: number
  private readonly tileH: number
  // Insertion order doubles as LRU order: touch() deletes-then-reinserts a
  // key to bump it to the most-recently-used (last) position, so the first
  // key in Map iteration order is always the least-recently-used one.
  private readonly tiles = new Map<string, AccumulationBuffer>()
  // Tile keys this instance has evicted (destroyed the GPU texture for) but
  // not forgotten — recoverable on demand via rebuildTile. Never populated
  // when rebuildTile is undefined (see class docstring).
  private readonly evicted = new Set<string>()
  // (#155 Tier 2) Real content bbox per tile ever created, world-space,
  // keyed the same as `tiles`/`evicted` — populated the moment a tile is
  // created and never removed except by clear()/destroy(), independent of
  // whether the tile is currently resident or evicted (eviction destroys
  // the GPU texture, never the knowledge of what was on it — same spirit as
  // `evicted` itself). null means "this tile currently holds no content."
  // See PaintTarget.contentRect's own doc comment for the full reasoning.
  private readonly contentRects = new Map<string, WorldRect | null>()
  private readonly rebuildTile: TileRebuilder | undefined
  // (#365) The coarse level: one buffer per COARSE_FACTOR x COARSE_FACTOR
  // block of fine tiles, same texture size, so 1/COARSE_FACTOR the
  // resolution. Only ever populated for an instance that was given a
  // downsampleTile (real layers in an infinite room); everything else keeps
  // exactly the pre-#365 behaviour of having no coarse level at all.
  //
  // Not budgeted, unlike `tiles`. Every level together costs about a third of
  // what the same content costs at full resolution (1/4 + 1/16 + 1/64), and
  // the coarsest level covers 64 fine tiles' worth of world area per tile —
  // so reaching even the fine level's own 32-tile cap there would take 2048
  // fine tiles of real painted content, two orders of magnitude past anything
  // a lesson produces. Worth revisiting only if that stops being true.
  private readonly coarse = new Map<CoarseFactor, Map<string, AccumulationBuffer>>()
  // Fine tile keys whose content has changed since it was last folded into
  // the coarse level. Populated by resolveForPaint — the single gate every
  // write path in the engine passes through to get a target — rather than by
  // the individual writers, so a new write path cannot forget to mark itself
  // and silently leave the coarse level showing stale pixels at low zoom.
  private readonly pendingDownsample = new Set<string>()
  private readonly downsampleTile: TileDownsampler | undefined
  private readonly maxResidentTiles: number
  // Counter, not boolean, so nested suspend/resume (defensive — nothing in
  // this codebase currently nests them) can't resume prematurely. See
  // suspendEviction's own doc comment for why engine/index.ts needs this.
  private evictionSuspendDepth = 0

  constructor(
    gl: WebGLRenderingContext, tileW: number = TILE_SIZE, tileH: number = TILE_SIZE,
    rebuildTile?: TileRebuilder,
    // Test-only override of TILE_BUDGET_BYTES — every real (production)
    // caller relies on the default. Reaching TILE_BUDGET_BYTES honestly at
    // TILE_SIZE (or a bounded room's own, often bigger, canvas size) would
    // mean creating dozens of real multi-megabyte tiles per test just to
    // cross the threshold — this lets a test cross a *tiny* threshold with
    // tiny tiles instead, exercising the exact same eviction logic cheaply
    // (same idea as clearCheckpoints() simulating CHECKPOINT_BUDGET_BYTES
    // pressure in engineTestUtils.ts, just injected instead of simulated,
    // since unlike checkpoint eviction this budget is computed once, in the
    // constructor, rather than checked against a module-level constant on
    // every call).
    budgetBytes: number = TILE_BUDGET_BYTES,
    // (#365) Last on purpose: budgetBytes above is passed positionally by the
    // eviction tests, so a new parameter ahead of it would silently arrive as
    // the budget. Omitted for bounded rooms and for scratch/temp instances —
    // a bounded room never minifies its buffers (the browser's compositor
    // scales its canvas element instead) and a scratch instance is read once
    // and thrown away, so neither has a coarse level to keep. Without one,
    // every coarse path below short-circuits.
    downsampleTile?: TileDownsampler,
  ) {
    this.gl = gl
    this.tileW = tileW
    this.tileH = tileH
    this.rebuildTile = rebuildTile
    this.downsampleTile = downsampleTile
    this.maxResidentTiles = rebuildTile
      ? Math.max(MIN_RESIDENT_TILES, Math.floor(budgetBytes / (tileW * tileH * 4)))
      : Infinity
  }

  /** Resident tile count — exposed for tests/diagnostics, not part of
   *  ILayerBuffer. This is specifically the GPU-resident count (what
   *  actually costs memory right now), not "every tile ever touched" —
   *  see evictedTileCount for the latter. */
  get tileCount(): number { return this.tiles.size }

  /** Evicted-but-recoverable tile count — diagnostics/tests only, so a test
   *  can assert eviction actually happened rather than merely that
   *  tileCount stayed bounded (which alone can't distinguish "evicted
   *  something" from "never grew past budget in the first place"). */
  get evictedTileCount(): number { return this.evicted.size }

  clear(): void {
    for (const tile of this.tiles.values()) tile.destroy()
    this.tiles.clear()
    this.evicted.clear()
    this.contentRects.clear()
    this.dropCoarse()
  }

  destroy(): void {
    for (const tile of this.tiles.values()) tile.destroy()
    this.tiles.clear()
    this.evicted.clear()
    this.contentRects.clear()
    this.dropCoarse()
  }

  /** (#365) Throws the coarse level away wholesale. Correct for both clear()
   *  and destroy(): the coarse level is derived, never a source of truth, so
   *  losing it costs nothing a later paint won't rebuild — and keeping it
   *  across a clear() would be actively wrong, leaving a low-zoom view
   *  showing content the layer no longer has. */
  private dropCoarse(): void {
    for (const level of this.coarse.values()) {
      for (const tile of level.values()) tile.destroy()
    }
    this.coarse.clear()
    this.pendingDownsample.clear()
  }

  /** (#365) Folds every fine tile written since the last fold into its coarse
   *  tile, then forgets the marks.
   *
   *  Ordering is the whole correctness argument here, so it is worth stating:
   *  a key in `pendingDownsample` is guaranteed still resident when this runs,
   *  because the only thing that evicts is evictIfOverBudget and that calls
   *  this first. Conversely, keys are marked at the *end* of resolveForPaint,
   *  after that call's own trim — so this never folds a tile whose paint has
   *  not happened yet and then clears the mark, which would leave the coarse
   *  level one operation behind forever. */
  private flushDownsamples(): void {
    const downsample = this.downsampleTile
    if (!downsample || !this.pendingDownsample.size) return
    for (const key of this.pendingDownsample) {
      const tile = this.tiles.get(key)
      if (!tile) continue // cannot normally happen — see the ordering note above
      const { tileX, tileY } = parseTileKey(key)
      // Into every level, not just one: which level the camera will ask for
      // is not known here, and a level that skipped this fold would be stale
      // the moment the camera settled on it. Each fold is one quad draw into
      // a slot, so three of them per written tile is nothing next to the
      // paint that produced the tile in the first place.
      for (const factor of COARSE_FACTORS) {
        const coarseCoord = fineToCoarseTile(tileX, tileY, factor)
        const coarseKey = tileKey(coarseCoord.tileX, coarseCoord.tileY)
        let level = this.coarse.get(factor)
        if (!level) { level = new Map(); this.coarse.set(factor, level) }
        let dest = level.get(coarseKey)
        if (!dest) {
          dest = new AccumulationBuffer(this.gl, this.tileW, this.tileH)
          dest.clear()
          level.set(coarseKey, dest)
        }
        const slot = fineTileSlot(tileX, tileY, factor, this.tileW, this.tileH)
        downsample(tile, dest, slot.x, slot.y, slot.w, slot.h)
      }
    }
    this.pendingDownsample.clear()
  }

  /** (#365) Marks fine tiles as needing to be folded into the coarse level.
   *  Called from the two places that hand a caller a buffer it may write to
   *  — resolveForPaint (every paint, bake, merge and restore in the engine
   *  goes through it) and allResident (bakes and merges also clear tiles they
   *  got from there). Over-marking only costs one quad draw per tile at the
   *  next fold; under-marking silently shows stale content at low zoom, so
   *  this errs toward the former. */
  private markForDownsample(keys: Iterable<string>): void {
    if (!this.downsampleTile) return
    for (const key of keys) this.pendingDownsample.add(key)
  }

  /** (#365) The pyramid's counterpart to resolveVisible: whichever tiles of
   *  level `factor` overlap `worldRect` and actually hold content. Null — not
   *  an empty array — when this instance keeps no levels at all (bounded
   *  rooms, scratch buffers), so the caller can tell "nothing to draw here"
   *  apart from "ask me for fine tiles instead".
   *
   *  Never creates a tile and never touches the fine level's residency or
   *  budget, which is the point: at the zooms this exists for, resolving the
   *  equivalent fine tiles is exactly the work being avoided — and, since
   *  those tiles have usually been evicted by then, the Operation Log replay
   *  that recovering them would cost is the freeze this whole level exists to
   *  remove. */
  resolveCoarse(worldRect: WorldRect, factor: CoarseFactor): PaintTarget[] | null {
    if (!this.downsampleTile) return null
    this.flushDownsamples()
    const level = this.coarse.get(factor)
    if (!level) return []
    const targets: PaintTarget[] = []
    for (const { tileX, tileY } of tilesOverlappingRect(worldRect, this.tileW * factor, this.tileH * factor)) {
      const buffer = level.get(tileKey(tileX, tileY))
      if (!buffer) continue
      const rect = coarseTileWorldRect(tileX, tileY, factor, this.tileW, this.tileH)
      targets.push({ buffer, originX: rect.minX, originY: rect.minY, contentRect: null })
    }
    return targets
  }

  /** (#365) World-space size one tile of `factor` spans — what the composite
   *  needs to place a resolveCoarse target, since unlike a fine tile its
   *  buffer dimensions and its world extent are no longer the same number. */
  coarseWorldSize(factor: CoarseFactor): { w: number; h: number } {
    return { w: this.tileW * factor, h: this.tileH * factor }
  }

  /** Suspends eviction until a matching resumeEviction() — used by
   *  engine/index.ts's _replayInto while it's mid-way through repopulating
   *  this exact instance from a checkpoint plus tail ops. Without this, a
   *  tile count that transiently exceeds budget partway through that
   *  repopulation (e.g. a checkpoint restores more tiles than the final
   *  done-history will end up needing) could evict a tile the *same*
   *  replay's later tail ops then immediately need again — triggering a
   *  nested rebuild (a fresh, *separate* full replay via rebuildTile) whose
   *  result would be stale the moment this replay's own later ops go on to
   *  change that tile further. Suspending across the whole repopulation and
   *  sweeping once at the end (resumeEviction) avoids the nested-replay
   *  hazard entirely and only ever evicts based on the final, settled tile
   *  count. */
  suspendEviction(): void { this.evictionSuspendDepth++ }

  /** Ends a suspendEviction() span and sweeps once against the now-final
   *  tile count — see suspendEviction's own doc comment. */
  resumeEviction(): void {
    this.evictionSuspendDepth = Math.max(0, this.evictionSuspendDepth - 1)
    this.flushDownsamples()
    if (this.evictionSuspendDepth === 0) this.evictIfOverBudget()
  }

  private touch(key: string, tile: AccumulationBuffer): void {
    this.tiles.delete(key)
    this.tiles.set(key, tile)
  }

  /** Trims resident tiles back to budget, least-recently-used first, never
   *  touching a key in `inUse`.
   *
   *  (#363) That exemption is the whole point, not a refinement. This used to
   *  trim unconditionally, on the assumption its callers spelled out and
   *  relied on: that a single resolve call could never itself ask for more
   *  tiles than the budget holds, so anything it had just touch()ed was
   *  freshly MRU and therefore safe. An infinite room's *view* breaks that —
   *  tiles in view grow with 1/zoom², and past roughly zoom 0.5 on a normal
   *  screen the visible set alone outnumbers maxResidentTiles. The trim then
   *  destroyed the GL textures of tiles resolveVisible had already placed in
   *  the array it was about to return, and _drawCompositeItem went on to bind
   *  them: in GLES2 a deleted texture name samples as opaque black, which
   *  under the composite's own (ONE, ONE_MINUS_SRC_ALPHA) blend paints a
   *  solid black square over whatever was beneath it. Worse, each frame then
   *  re-recovered what the previous frame had evicted — and recovery is a
   *  full Operation Log replay of the layer (see TileRebuilder), so a static
   *  wide view replayed the whole layer once per composited frame.
   *
   *  Exempting the in-use set fixes both at once: the frame draws every tile
   *  it resolved, and the resident set stops oscillating, since consecutive
   *  frames of a still camera protect the same keys. The cost is that a view
   *  wider than the budget deliberately *stays* over budget for as long as
   *  it's on screen — resident tiles become max(budget, tiles in view). That
   *  is the honest price of compositing full-resolution tiles at low zoom,
   *  and bounding it for real needs a reduced-resolution level to draw
   *  instead (the LOD work #363 defers); a budget that "wins" by destroying
   *  pixels the caller is mid-way through drawing was never actually
   *  respecting it, just corrupting the frame. The moment the camera moves
   *  on, the next resolve protects a different set and these trim normally. */
  private evictIfOverBudget(inUse?: ReadonlySet<string>): void {
    if (!this.rebuildTile || this.evictionSuspendDepth > 0) return
    // (#365) Before anything is destroyed: a tile still owing its content to
    // the coarse level must contribute it while it is still here, or the
    // low-zoom view keeps showing what was there before the last stroke.
    this.flushDownsamples()
    let overBudget = this.tiles.size - this.maxResidentTiles
    if (overBudget <= 0) return
    // Iterates a snapshot rather than the live Map: unlike the old loop this
    // can skip a key (leaving it in place) instead of always deleting the
    // first one, so re-reading keys().next() would just return the same
    // protected key forever. Snapshot order is Map insertion order, which
    // touch() maintains as LRU order — so this still evicts oldest-first.
    for (const key of [...this.tiles.keys()]) {
      if (overBudget <= 0) break
      if (inUse?.has(key)) continue
      this.tiles.get(key)!.destroy()
      this.tiles.delete(key)
      this.evicted.add(key)
      overBudget--
    }
  }

  /** Recovers every key in `keys` (assumed disjoint from `tiles`, i.e. each
   *  currently in `evicted`) in one rebuildTile session — a single
   *  from-scratch replay recovers as many evicted tiles as a caller needs in
   *  one pass rather than one full replay per tile, which matters for
   *  allResident() (potentially recovering many at once for a
   *  checkpoint/merge/bake) as much as it does for resolveVisible (a pan
   *  back into previously-evicted territory can reveal several at once).
   *  Deliberately never trims back down to budget itself (see
   *  evictIfOverBudget) — every caller below controls exactly when that
   *  happens relative to its own touch()es, since trimming too early here
   *  could evict (destroy the GPU texture of) a tile the caller is about to
   *  hand back in its own return value. */
  private recoverTiles(keys: string[]): void {
    if (!this.rebuildTile || !keys.length) return
    const session = this.rebuildTile()
    for (const key of keys) {
      const { tileX, tileY } = parseTileKey(key)
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      const tile = new AccumulationBuffer(this.gl, this.tileW, this.tileH)
      tile.clear()
      const pixels = session.readPixels(rect)
      // (#155 Tier 2) Recovery already has this tile's exact historical
      // pixels in hand — scan them once, right here, for the real content
      // bbox rather than leaving tracked state stale. This is the *only*
      // place recovery pays for a scan; every later getContentBounds() call
      // reads the result back for free instead of re-scanning.
      if (pixels) {
        tile.restorePixels(pixels)
        const local = scanLocalContentRect(pixels, this.tileW, this.tileH)
        this.contentRects.set(key, local
          ? { minX: rect.minX + local.minX, minY: rect.minY + local.minY, maxX: rect.minX + local.maxX, maxY: rect.minY + local.maxY }
          : null)
      } else {
        this.contentRects.set(key, null)
      }
      this.evicted.delete(key)
      this.tiles.set(key, tile)
    }
    session.destroy()
  }

  private getOrCreateTile(tileX: number, tileY: number): AccumulationBuffer {
    const key = tileKey(tileX, tileY)
    const existing = this.tiles.get(key)
    if (existing) { this.touch(key, existing); return existing }
    // Reaching here with a genuinely missing key means either this tile has
    // never existed until now (brand new — start blank), or it was evicted
    // and resolveForPaint's own recoverTiles pass (run just before this is
    // called — see resolveForPaint) already recovered it, so it wouldn't
    // still be missing from `tiles`. Either way, a plain blank tile is
    // correct here.
    const tile = new AccumulationBuffer(this.gl, this.tileW, this.tileH)
    tile.clear()
    this.tiles.set(key, tile)
    // A genuinely brand-new tile (never seen this key before) starts with
    // no tracked content — a recovered one already got its real content set
    // by recoverTiles just above, don't stomp it.
    if (!this.contentRects.has(key)) this.contentRects.set(key, null)
    return tile
  }

  resolveForPaint(worldRect: WorldRect): PaintTarget[] {
    const coords = tilesOverlappingRect(worldRect, this.tileW, this.tileH)
    const keys = coords.map(({ tileX, tileY }) => tileKey(tileX, tileY))
    this.recoverTiles(keys.filter(key => !this.tiles.has(key) && this.evicted.has(key)))
    const targets = coords.map(({ tileX, tileY }, i) => {
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      const buffer = this.getOrCreateTile(tileX, tileY)
      return { buffer, originX: rect.minX, originY: rect.minY, contentRect: this.contentRects.get(keys[i]) ?? null }
    })
    // Trimmed once, after every target this call needs is already resolved,
    // and passed this call's own keys so the trim can never destroy one of
    // them — see evictIfOverBudget's own doc comment. A bake's transformed
    // content bounds can span a lot of tiles, so this isn't only the display
    // path's concern.
    this.evictIfOverBudget(new Set(keys))
    // (#365) Marked last, after the trim: the caller has not written yet, so
    // folding these now would bank pre-paint content and clear the mark. See
    // flushDownsamples' ordering note.
    this.markForDownsample(keys)
    return targets
  }

  resolveVisible(worldRect: WorldRect): PaintTarget[] {
    const coords = tilesOverlappingRect(worldRect, this.tileW, this.tileH)
    const keys = coords.map(({ tileX, tileY }) => tileKey(tileX, tileY))
    this.recoverTiles(keys.filter(key => !this.tiles.has(key) && this.evicted.has(key)))

    const targets: PaintTarget[] = []
    const inUse = new Set<string>()
    for (const { tileX, tileY } of coords) {
      const key = tileKey(tileX, tileY)
      const tile = this.tiles.get(key)
      if (!tile) continue // never touched at all — nothing to show, same as before #144
      this.touch(key, tile)
      inUse.add(key)
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      targets.push({ buffer: tile, originX: rect.minX, originY: rect.minY, contentRect: this.contentRects.get(key) ?? null })
    }
    // See resolveForPaint's own comment. `inUse` is built from the tiles
    // actually returned, not from `keys`: a coord with no tile at all
    // contributes nothing to protect, and this is the hot display path.
    this.evictIfOverBudget(inUse)
    return targets
  }

  /** Never trims (see recoverTiles's own doc comment) — callers (checkpoint,
   *  merge, transform bake/preview) rely on getting *every* tile a layer has
   *  ever held back in one call, and this instance's own resident count can
   *  legitimately be larger than its budget for the entirety of this call
   *  (that's the whole reason recovery exists). Trimming here would mean
   *  destroying the very AccumulationBuffer objects this method is about to
   *  return to its caller. The budget catches up on its own the next time a
   *  normal, smaller resolveForPaint/resolveVisible call runs (e.g. the next
   *  paint/composite) — a temporary, bounded-in-practice bulge right after
   *  an infrequent bulk operation, never a permanent regression. */
  allResident(): PaintTarget[] {
    this.flushDownsamples()
    this.recoverTiles([...this.evicted])
    // Snapshot entries before touching: touch() deletes-and-reinserts the
    // very key a live Map iterator is mid-way through, which would revisit
    // it later in the same iteration (JS Maps replay a re-inserted key that
    // hasn't been reached yet) — trivially infinite for a single-tile
    // buffer. Iterating a plain array snapshot instead sidesteps that.
    const entries = [...this.tiles.entries()]
    const targets: PaintTarget[] = []
    for (const [key, tile] of entries) {
      this.touch(key, tile)
      const { tileX, tileY } = parseTileKey(key)
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      targets.push({ buffer: tile, originX: rect.minX, originY: rect.minY, contentRect: this.contentRects.get(key) ?? null })
    }
    // (#365) Bakes and merges clear tiles they took from here, so treat every
    // one as possibly-written — see markForDownsample.
    this.markForDownsample(entries.map(([key]) => key))
    return targets
  }

  /** See ILayerBuffer's own doc comment. */
  markContentPainted(worldRect: WorldRect): void {
    // Rounded outward once, here, rather than left as whatever float math
    // produced it (a dab's radius-padded bounds, or a rotated transform's
    // AABB corners) — every tracked contentRect stays integer this way,
    // with no separate rounding step needed wherever they're later unioned
    // (getContentBoundsWorld) or compared (getContentBounds' translate-
    // invariance guarantee, _buildContentComposite's zero-rounding camera
    // placement — see their own doc comments).
    const rect: WorldRect = {
      minX: Math.floor(worldRect.minX), minY: Math.floor(worldRect.minY),
      maxX: Math.ceil(worldRect.maxX), maxY: Math.ceil(worldRect.maxY),
    }
    if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return
    for (const { tileX, tileY } of tilesOverlappingRect(rect, this.tileW, this.tileH)) {
      const key = tileKey(tileX, tileY)
      if (!this.tiles.has(key)) continue // caller should have resolveForPaint'd this already
      const tileRect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      const overlap: WorldRect = {
        minX: Math.max(rect.minX, tileRect.minX), minY: Math.max(rect.minY, tileRect.minY),
        maxX: Math.min(rect.maxX, tileRect.maxX), maxY: Math.min(rect.maxY, tileRect.maxY),
      }
      if (overlap.maxX <= overlap.minX || overlap.maxY <= overlap.minY) continue
      const existing = this.contentRects.get(key) ?? null
      this.contentRects.set(key, existing ? {
        minX: Math.min(existing.minX, overlap.minX), minY: Math.min(existing.minY, overlap.minY),
        maxX: Math.max(existing.maxX, overlap.maxX), maxY: Math.max(existing.maxY, overlap.maxY),
      } : overlap)
    }
  }

  /** See ILayerBuffer's own doc comment. */
  clearContentAt(originX: number, originY: number): void {
    const { tileX, tileY } = worldToTile(originX, originY, this.tileW, this.tileH)
    const key = tileKey(tileX, tileY)
    if (this.tiles.has(key)) this.contentRects.set(key, null)
  }

  /** See ILayerBuffer's own doc comment. */
  restoreTileContent(rect: WorldRect, pixels: Uint8Array): void {
    const { tileX, tileY } = worldToTile(rect.minX, rect.minY, this.tileW, this.tileH)
    const key = tileKey(tileX, tileY)
    if (!this.tiles.has(key)) return
    const local = scanLocalContentRect(pixels, this.tileW, this.tileH)
    this.contentRects.set(key, local
      ? { minX: rect.minX + local.minX, minY: rect.minY + local.minY, maxX: rect.minX + local.maxX, maxY: rect.minY + local.maxY }
      : null)
  }

  /** See ILayerBuffer's own doc comment. */
  getContentBoundsWorld(): WorldRect | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const rect of this.contentRects.values()) {
      if (!rect) continue
      minX = Math.min(minX, rect.minX); minY = Math.min(minY, rect.minY)
      maxX = Math.max(maxX, rect.maxX); maxY = Math.max(maxY, rect.maxY)
    }
    if (maxX <= minX || maxY <= minY) return null
    return { minX, minY, maxX, maxY }
  }
}

// Shared scaffolding for engine-level integration tests (#101): a fake
// <canvas>-like object backed by MockGL (see ./mockGL.ts), a real
// PencilEngine constructed against it, and small builders for the
// structural/pixel Operations these tests append directly via
// `appendOperation` — bypassing PointerInput entirely, the same way a
// `room_state` replay or a `peer_operation` would (see the docstring on
// `appendOperation` in engine/index.ts: it is deliberately origin-agnostic).

import { nanoid } from 'nanoid'
import type { Dab, LayerAddOperation, LayerDeleteOperation, LayerMergeOperation, LayerTransformOperation, StrokeOperation } from '@art-lessons/shared'

import { PencilEngine, type PencilEngineOptions } from '../index'
import type { AccumulationBuffer } from '../src/AccumulationBuffer'
import type { ILayerBuffer } from '../src/ILayerBuffer'
import type { PointerData } from '../src/PointerInput'
import { TiledLayerBuffer } from '../src/TiledLayerBuffer'
import { TILE_SIZE, tileWorldRect } from '../src/tileMath'
import { MockGL, type MockLocation, type UniformValue } from './mockGL'

// jsdom is not used (vitest env is 'node' — see root vitest.config.ts), so
// rAF/cancelAnimationFrame don't exist; PencilEngine's constructor/destroy
// call them unconditionally. Stub once, process-wide.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number): void => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame
}

interface FakeCanvas {
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  style: Record<string, string>
  getContext: (type: string) => MockGL | null
  addEventListener: () => void
  removeEventListener: () => void
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
  setPointerCapture: () => void
  toBlob: (cb: (b: Blob | null) => void) => void
}

/** A canvas-shaped object good enough for PencilEngine's constructor and
 *  PointerInput — real pointer events are never dispatched in these tests
 *  (structural/pixel ops are appended directly), so the handlers here just
 *  need to exist, not do anything. */
function createMockCanvas(width: number, height: number): FakeCanvas {
  const gl = new MockGL()
  return {
    width, height, clientWidth: width, clientHeight: height,
    style: {},
    getContext: () => gl,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setPointerCapture: () => {},
    toBlob: cb => cb(null),
  }
}

export interface TestEngine {
  engine: PencilEngine
  canvas: FakeCanvas
}

export function createTestEngine(
  options: PencilEngineOptions = {},
  size: { width?: number; height?: number } = {},
): TestEngine {
  const { width = 8, height = 8 } = size
  const canvas = createMockCanvas(width, height)
  const engine = new PencilEngine(canvas as unknown as HTMLCanvasElement, options)
  return { engine, canvas }
}

// ─── White-box access ──────────────────────────────────────────────────────
//
// PencilEngineAPI intentionally exposes no buffer/checkpoint read access —
// there is no product reason a caller would need it. These tests are
// specifically about the private replay/checkpoint machinery (#101), so they
// reach past the public API on purpose. One centralized, documented cast
// beats scattering `as any` through every test.

interface EngineInternals {
  _layers: Map<string, ILayerBuffer>
  _checkpoints: Array<{ layerId: string; opIds: string[] }>
  _onStart: (e: PointerData) => void
  _onMove: (e: PointerData) => void
  _onEnd: (e: PointerData) => void
  _onPredict: (samples: PointerData[]) => void
  _compositeFBO: AccumulationBuffer
  // #145 white-box access — see buildExportComposite below.
  _buildContentComposite: () => { bounds: { x: number; y: number; width: number; height: number }; buffer: AccumulationBuffer } | null
  // #134-follow-up white-box access — see assemblyPad/compositeCenterFor below.
  _assemblyPad: () => { padX: number; padY: number }
  _compositeCenterX: number
  _compositeCenterY: number
  // Live gizmo-drag preview (#120/#139) — see engine/index.ts's own
  // PreviewTile. Structurally identical, redeclared here rather than
  // exported from index.ts since there's no product reason a real caller
  // would ever need this shape — same reasoning as the rest of this file's
  // white-box access.
  _transformPreview: Map<string, Array<{ originX: number; originY: number; buffer: AccumulationBuffer }>>
  // #141 white-box access — see paperTextureSize/paperTextureWrap/
  // lastPaperDabUniform below.
  gl: MockGL
  _paperTex: object
  _dabUni: Record<string, MockLocation | null>
  _dabInstUni: Record<string, MockLocation | null>
}

function internals(engine: PencilEngine): EngineInternals {
  return engine as unknown as EngineInternals
}

export function hasLayerBuffer(engine: PencilEngine, layerId: string): boolean {
  return internals(engine)._layers.has(layerId)
}

/** Bounded-mode-only helper (see index.tiledStroke.test.ts /
 *  index.tiledTransform.test.ts for the tile-aware equivalent,
 *  readTilePixels/allResident, that infinite-canvas tests use instead).
 *  Reads specifically the tile at world origin (0,0) — a bounded room's
 *  own visible page (see _makeLayerBuffer: its tile size is its own canvas
 *  size, rooted at world origin) — rather than "whatever allResident()
 *  happens to return first": #142 means a layer_transform can leave a
 *  bounded layer with more than one resident tile (content dragged past
 *  the visible page's edge lands in an *adjacent* tile instead of being
 *  destroyed), and allResident()'s Map iteration order doesn't guarantee
 *  the origin tile comes first. A never-painted layer has *zero* resident
 *  tiles (#142: every layer, bounded or infinite, now lazily creates its
 *  TiledLayerBuffer tile(s) on first paint, unlike the old always-eager
 *  BoundedLayerBuffer) — synthesized as an all-transparent buffer the same
 *  size as _compositeFBO (always exactly canvas.width x canvas.height,
 *  regardless of mode) so callers asserting "a fresh layer reads as all
 *  zero" don't need their own special case for it. */
export function readLayerPixels(engine: PencilEngine, layerId: string): Uint8Array | null {
  const buf = internals(engine)._layers.get(layerId)
  if (!buf) return null
  const resident = buf.allResident().find(t => t.originX === 0 && t.originY === 0)
  if (resident) return resident.buffer.readPixels()
  const { width, height } = internals(engine)._compositeFBO
  return new Uint8Array(width * height * 4)
}

// ─── Infinite-canvas (tiled) white-box access (#133 Phase 1) ───────────────

/** Resident tile count for any layer, bounded or infinite (#142: every
 *  layer is a TiledLayerBuffer now) — 0 if it doesn't exist or nothing has
 *  painted into it yet. A bounded layer's canvas fitting within a single
 *  TILE_SIZE tile in both dimensions (true of any preset up to 1024x1024)
 *  still shows 1 once painted, same as it always effectively was — larger
 *  presets (e.g. A4 at 1240x1754) legitimately span more than one. */
export function residentTileCount(engine: PencilEngine, layerId: string): number {
  const buf = internals(engine)._layers.get(layerId)
  return buf instanceof TiledLayerBuffer ? buf.tileCount : 0
}

/** Reads back one specific tile's pixels by tile coordinate (see
 *  engine/src/tileMath.ts) — null if that tile isn't resident (or the layer
 *  doesn't exist / isn't tiled). Used to assert content landed on (or
 *  didn't land on) a specific tile after a tile-straddling stroke or a
 *  transform bake that moves content across a tile boundary. `tileW/tileH`
 *  default to TILE_SIZE (infinite rooms' own tile size, and every existing
 *  caller's expectation) — a bounded-room test wanting its *own* (canvas-
 *  sized) second/third/etc. tile must pass its actual tile size explicitly
 *  (see _makeLayerBuffer's docstring in engine/index.ts for why that
 *  differs from TILE_SIZE for bounded rooms). */
export function readTilePixels(
  engine: PencilEngine, layerId: string, tileX: number, tileY: number, tileW = TILE_SIZE, tileH = TILE_SIZE,
): Uint8Array | null {
  const buf = internals(engine)._layers.get(layerId)
  if (!buf) return null
  const rect = tileWorldRect(tileX, tileY, tileW, tileH)
  const target = buf.allResident().find(t => t.originX === rect.minX && t.originY === rect.minY)
  return target ? target.buffer.readPixels() : null
}

/** Reads back the final on-screen composite (#122) — what _display() last
 *  blended every visible layer/folder-child into, *before* the paper-color
 *  display pass (which MockGL never rasterizes — see its module docstring).
 *  Used by index.recompositeCache.test.ts to check the below/above
 *  split-cache optimization never diverges from a guaranteed-fresh full
 *  recompute of the same layer state. */
export function readCompositePixels(engine: PencilEngine): Uint8Array {
  return internals(engine)._compositeFBO.readPixels()
}

// ─── exportPNG infinite-room composite (#145) ──────────────────────────────

export interface ExportComposite {
  x: number
  y: number
  width: number
  height: number
  // RGBA8, GL-row-order (bottom-up) — same convention readCompositePixels/
  // AccumulationBuffer.readPixels already give; see _buildContentComposite's
  // own doc comment in engine/index.ts.
  pixels: Uint8Array
}

/** White-box hook into exportPNG's infinite-room composite-building step
 *  (#145) — _buildContentComposite() itself. Returns the union content-
 *  bounds rect plus that rect's raw (unblended, premultiplied-color/
 *  coverage-alpha) pixels, or null if every layer is empty.
 *
 *  This is the layer these tests can actually assert on: exportPNG's own
 *  final output isn't mockable end-to-end — MockGL deliberately never
 *  rasterizes the paper-blend/display-transparent passes (see mockGL.ts's
 *  module docstring), and _exportInfinitePNG's PNG encoding step reaches for
 *  `document.createElement('canvas')`, which doesn't exist in vitest's
 *  'node' environment (see the root vitest.config.ts) — so a test exercising
 *  the full exportPNG() call with real content on an infinite-room engine
 *  would throw, not just fail an assertion. _buildContentComposite is the
 *  exact boundary where "pixels MockGL can rasterize" ends and "the DOM-only
 *  PNG encoding step" begins, so that's what this reaches past — same
 *  documented, centralized reach-past-private-fields pattern as every other
 *  helper in this file. */
export function buildExportComposite(engine: PencilEngine): ExportComposite | null {
  const result = internals(engine)._buildContentComposite()
  if (!result) return null
  const pixels = result.buffer.readPixels()
  result.buffer.destroy()
  return { ...result.bounds, pixels }
}

// ─── Live gizmo-drag preview (#120/#139) white-box access ──────────────────

export interface PreviewTileSnapshot {
  originX: number
  originY: number
  pixels: Uint8Array
}

/** Snapshots every scratch tile previewLayerTransform currently has staged
 *  for `layerId` — [] if that layer has no live preview at all (never
 *  called previewLayerTransform, or its preview was cleared/collapsed to
 *  nothing). Reads each tile's own AccumulationBuffer directly rather than
 *  going through the full display/composite pipeline, so a test can check
 *  the preview's own staged content (position + pixels) in isolation from
 *  whether the camera/viewport happens to have it on screen. */
export function readTransformPreviewTiles(engine: PencilEngine, layerId: string): PreviewTileSnapshot[] {
  const tiles = internals(engine)._transformPreview.get(layerId)
  if (!tiles) return []
  return tiles.map(({ originX, originY, buffer }) => ({ originX, originY, pixels: buffer.readPixels() }))
}

/** Identity (WebGLTexture handle), not content, per currently-staged preview
 *  tile — a perf regression test's tool, not a correctness one: proves
 *  whether previewLayerTransform is reusing an existing scratch
 *  AccumulationBuffer across frames or destroying/recreating it every call
 *  (the latter was a real GPU alloc/dealloc-churn bug found testing on an
 *  underpowered device — every pointermove during a drag recreated a full
 *  page-sized texture+framebuffer). Keyed by world origin so a test can
 *  compare identity for "the same tile" across two previewLayerTransform
 *  calls. */
export function readTransformPreviewTextureIds(engine: PencilEngine, layerId: string): Map<string, unknown> {
  const tiles = internals(engine)._transformPreview.get(layerId) ?? []
  return new Map(tiles.map(t => [`${t.originX},${t.originY}`, t.buffer.texture]))
}

export function checkpointCountFor(engine: PencilEngine, layerId: string): number {
  return internals(engine)._checkpoints.filter(cp => cp.layerId === layerId).length
}

/** #134-follow-up white-box access: how much bigger the assembly buffer is
 *  than the real canvas, per axis, *rounded to the nearest whole pixel* —
 *  see _assemblyPad's own doc comment in engine/index.ts. Both components
 *  are integers by construction (Math.round always returns one); what a
 *  test actually wants to check is that the engine *uses* this padding
 *  (rather than the assembly buffer's raw half-size) when placing content
 *  and rotating it back — see index.tiledDisplay.test.ts's blur-regression
 *  test for that end-to-end check. */
export function assemblyPad(engine: PencilEngine): { padX: number; padY: number } {
  return internals(engine)._assemblyPad()
}

/** #134-follow-up white-box access: the pixel position within the *current*
 *  composite target that the camera's own world point (wx, wy) maps to —
 *  only meaningful right after a real composite has run (setInfiniteCamera/
 *  a paint/etc. — anything that calls _display()), since it's set fresh by
 *  _runComposite every time. See engine/index.ts's _compositeCenterX field
 *  comment for why, for an infinite room, this must differ from
 *  canvas.width/2 by an exact integer (not any fractional amount) to avoid
 *  a permanent, uniform bilinear-resample blur on every frame. */
export function compositeCenterFor(engine: PencilEngine): { x: number; y: number } {
  const i = internals(engine)
  return { x: i._compositeCenterX, y: i._compositeCenterY }
}

// ─── Paper-texture white-box access (#141) ─────────────────────────────────
//
// MockGL deliberately doesn't rasterize DAB_FRAG's/PAPER_BLEND_FRAG's paper-
// height sampling or PAPER_GEN_FRAG's noise generation (see mockGL.ts's
// module docstring), so a pixel readback can't observe whether a dab's
// paper-UV uniforms came out world-position-correct, or whether the paper
// texture itself was created at the right size/wrap mode. These reach past
// MockGL's own introspection getters (readUniform/getTextureSize/
// getTextureWrap — all read-only, never influencing any rasterization
// behavior) the same documented way the rest of this file reaches past
// PencilEngine's private fields.

/** The paper texture's own GL pixel dimensions — canvas-sized for a bounded
 *  room, a fixed constant for an infinite one (see _initPaper). */
export function paperTextureSize(engine: PencilEngine): { width: number; height: number } | null {
  const eng = internals(engine)
  return eng.gl.getTextureSize(eng._paperTex)
}

/** The paper texture's wrap mode — CLAMP_TO_EDGE for a bounded room,
 *  REPEAT for an infinite one (see _initPaper/PaperTexture.ts). */
export function paperTextureWrap(engine: PencilEngine): { wrapS: number; wrapT: number } | null {
  const eng = internals(engine)
  return eng.gl.getTextureWrap(eng._paperTex)
}

/** The last value a named dab-shader uniform (e.g. 'u_paperOrigin',
 *  'u_paperTexSize') was set to for the most recently painted dab —
 *  whichever of the batched (_dabInstUni) or per-dab-uniform (_dabUni) path
 *  actually ran last (MockGL always provides the ANGLE_instanced_arrays
 *  shim, so in practice this is always the batched path — see
 *  _paintDabsInstanced). Reads through the *instanced* program first since
 *  that's the one every real dab paint in these tests actually uses. */
export function lastPaperDabUniform(engine: PencilEngine, name: string): UniformValue | undefined {
  const eng = internals(engine)
  const loc = eng._dabInstUni[name] ?? eng._dabUni[name]
  return loc ? eng.gl.readUniform(loc) : undefined
}

/** Simulates checkpoint eviction (in production this happens under
 *  CHECKPOINT_BUDGET_BYTES pressure — impractical to reach honestly in a
 *  small-canvas unit test) so a rebuild is forced to fall back to full
 *  from-scratch replay instead of the checkpoint fast path. Used to exercise
 *  the recursive `_replayMergeInto` path for a merge-of-a-merge, which a live
 *  merge's own immediate checkpoint would otherwise always short-circuit. */
export function clearCheckpoints(engine: PencilEngine): void {
  internals(engine)._checkpoints.length = 0
}

/** Element-wise comparison for the Uint8Array readPixels() returns —
 *  vitest's toEqual on typed arrays is fine too, but Array.from gives a
 *  clearer diff on failure. */
export function expectPixelsEqual(a: Uint8Array | null, b: Uint8Array | null): void {
  if (a === null || b === null) throw new Error('expectPixelsEqual: one side is null (buffer missing)')
  if (a.length !== b.length) throw new Error(`pixel buffer length mismatch: ${a.length} vs ${b.length}`)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`pixel mismatch at byte ${i}: ${a[i]} !== ${b[i]}`)
  }
}

/** Like expectPixelsEqual, but tolerant of small per-byte drift. Only use
 *  this for a comparison that legitimately crosses a checkpoint
 *  restore-then-replay-a-tail boundary: restorePixels() dequantizes an
 *  8-bit snapshot back to float, so painting further dabs on top starts
 *  from a value that can be off by up to 1/255 from the equivalent
 *  never-restored float32 accumulation — an inherent property of any
 *  8-bit-texture-backed checkpoint, not a correctness bug. A real
 *  checkpoint-selection bug (wrong layer, wrong prefix, stale snapshot)
 *  produces gross differences, far outside this tolerance. */
export function expectPixelsClose(a: Uint8Array | null, b: Uint8Array | null, maxDiff = 2): void {
  if (a === null || b === null) throw new Error('expectPixelsClose: one side is null (buffer missing)')
  if (a.length !== b.length) throw new Error(`pixel buffer length mismatch: ${a.length} vs ${b.length}`)
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i] - b[i])
    if (diff > maxDiff) throw new Error(`pixel mismatch at byte ${i}: ${a[i]} vs ${b[i]} (diff ${diff} > ${maxDiff})`)
  }
}

// ─── Live pointer-pipeline simulation (ruler tool, #89) ─────────────────────
//
// Every other integration test in this file drives the engine by appending
// pre-built Operations directly (appendOperation is deliberately
// origin-agnostic — see its docstring in index.ts), never through real
// pointer events (the mock canvas's addEventListener above is a no-op).
// That's not an option for the ruler tool: its snapping happens *inside*
// the private pointer pipeline itself (PencilEngine._onStart/_onMove via
// _snapPoint — see index.ts), not as a post-hoc transform on an already-
// built Operation. A test that wants to confirm a *recorded* stroke's dabs
// actually landed on the snapped line (not just that the pure
// snapToRuler() function is correct in isolation — see rulerSnap.test.ts)
// has to drive that exact pipeline, so this reaches past the private
// _onStart/_onMove/_onEnd the same documented, centralized way
// hasLayerBuffer/readLayerPixels above reach past _layers/_checkpoints.

/** Minimal PointerData sample — defaults are inert for the
 *  pressure/tilt/speed math (a light, straight, pen-like sample) so a
 *  caller only needs to specify what it actually cares about (position, or
 *  an explicit override). */
export function pointerSample(x: number, y: number, overrides: Partial<PointerData> = {}): PointerData {
  return { x, y, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: 0, ...overrides }
}

/** Drives the engine's real (private) pointer pipeline for one whole
 *  stroke: _onStart with the first point, _onMove for every point after
 *  it (including the last — mirroring real usage, where pointerup often
 *  lands at the same spot as the preceding pointermove), then _onEnd to
 *  flush the final segment. Requires an active layer to already exist
 *  (setActiveLayer + a live buffer), same precondition real drawing has.
 *  `points.length` must be >= 2: DabSystem needs at least a start and one
 *  more sample to define any segment at all (see DabSystem's own n < 2/3
 *  guards). */
export function simulateStroke(
  engine: PencilEngine, points: Array<{ x: number; y: number }>, overrides: Partial<PointerData> = {},
): void {
  if (points.length < 2) throw new Error('simulateStroke: need at least 2 points (start + at least one more)')
  const eng = engine as unknown as EngineInternals
  const [first, ...rest] = points
  eng._onStart(pointerSample(first.x, first.y, overrides))
  for (const p of rest) eng._onMove(pointerSample(p.x, p.y, overrides))
  const last = points[points.length - 1]
  eng._onEnd(pointerSample(last.x, last.y, overrides))
}

// #138: companions to simulateStroke that drive one pipeline step at a time
// and never call _onEnd — needed for tests that inspect the live-tip (#104)
// / speculative-prediction (#92) preview buffers, both of which are
// stroke-scoped and torn down the moment _onEnd runs (see PencilEngine's
// _tipBuf/_previewBuf field comments), so a test proving anything about
// their content has to stop short of ending the stroke.

/** Drives only PencilEngine._onStart — the stroke stays open afterward
 *  (unlike simulateStroke, which always finishes with _onEnd). */
export function simulateStrokeStart(
  engine: PencilEngine, x: number, y: number, overrides: Partial<PointerData> = {},
): void {
  (engine as unknown as EngineInternals)._onStart(pointerSample(x, y, overrides))
}

/** Drives one PencilEngine._onMove call — see simulateStrokeStart. */
export function simulateStrokeMove(
  engine: PencilEngine, x: number, y: number, overrides: Partial<PointerData> = {},
): void {
  (engine as unknown as EngineInternals)._onMove(pointerSample(x, y, overrides))
}

/** Drives PencilEngine._onPredict (#92) with the given predicted samples —
 *  only paints anything into _previewBuf when called mid-stroke (after
 *  simulateStrokeStart/simulateStrokeMove) with `predictPointer: true` set
 *  on the engine. */
export function simulatePredictedSamples(
  engine: PencilEngine, samples: Array<{ x: number; y: number }>, overrides: Partial<PointerData> = {},
): void {
  (engine as unknown as EngineInternals)._onPredict(samples.map(s => pointerSample(s.x, s.y, overrides)))
}

// ─── Operation builders ─────────────────────────────────────────────────────

let seqCounter = 0
function nextTimestamp(): number { return ++seqCounter }

export function dab(x: number, y: number, overrides: Partial<Dab> = {}): Dab {
  return {
    x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 4, aspectRatio: 1, angle: 0, opacity: 1, t: 0,
    ...overrides,
  }
}

export function makeStroke(
  userId: string, layerId: string, dabs: Dab[], overrides: Partial<StrokeOperation> = {},
): StrokeOperation {
  return {
    id: nanoid(10), type: 'stroke', userId, timestamp: nextTimestamp(),
    layerId, tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs,
    ...overrides,
  }
}

export function makeLayerAdd(userId: string, layerId: string, name = 'Layer', overrides: Partial<LayerAddOperation> = {}): LayerAddOperation {
  return { id: nanoid(10), type: 'layer_add', userId, timestamp: nextTimestamp(), layerId, name, ...overrides }
}

export function makeLayerDelete(userId: string, layerIds: string[], overrides: Partial<LayerDeleteOperation> = {}): LayerDeleteOperation {
  return { id: nanoid(10), type: 'layer_delete', userId, timestamp: nextTimestamp(), layerIds, ...overrides }
}

export function makeLayerMerge(
  userId: string, layerId: string, sources: Array<{ id: string; opacity: number }>,
  overrides: Partial<LayerMergeOperation> = {},
): LayerMergeOperation {
  return {
    id: nanoid(10), type: 'layer_merge', userId, timestamp: nextTimestamp(),
    layerId, name: 'Merged', sources, parentId: null, index: 0,
    ...overrides,
  }
}

/** A single dab, centered, that paints a fully-opaque disc covering the
 *  whole test canvas (given the small canvas sizes used in these tests). */
export function fillStroke(userId: string, layerId: string, cx: number, cy: number, radius: number): StrokeOperation {
  return makeStroke(userId, layerId, [dab(cx, cy, { size: radius * 2, pressure: 1, opacity: 1 })])
}

export function makeLayerTransform(
  userId: string,
  transforms: LayerTransformOperation['transforms'],
  overrides: Partial<LayerTransformOperation> = {},
): LayerTransformOperation {
  return { id: nanoid(10), type: 'layer_transform', userId, timestamp: nextTimestamp(), transforms, ...overrides }
}

// (#494) The paper and the sheet it is cut to: the grain texture's whole
// lifecycle (placeholder, async load, retry, context restore, mip chain) and
// the geometry every paint path reads off it (the sheet's size, the world
// span the grain repeats over, the watercolour clamp to the sheet).
//
// One object the engine builds once and hands to its passes — the painters
// read `texture`/`worldSize()` straight off it at draw time. It is never
// replaced: a new paper type or a context restore swaps the texture *inside*
// it, so a pass holding a reference always reads the live one, and reading it
// allocates nothing beyond what the size getters already did.
//
// Not imported by paper.ts (the out-of-room door): that one must stay free of
// anything engine-sized, and this file only makes sense inside an engine.
import { defaultPaperColor, type PaperType } from '@grafetto/shared'

import { PAPER_BAKE_RESOLUTION, PAPER_WORLD_SIZE } from './paperConstants'
import {
  createPlaceholderPaperTexture, generatePaperMipmaps, getPaperBytes, uploadPaperTexture,
} from './paperLoader'

/** (#470) Paper texels per screen pixel past which the grain is sampled
 *  through its mip chain instead of straight. Two, because that is where
 *  straight bilinear stops having a sample for every output pixel and starts
 *  dropping them — below it the chain only blurs, above it the lack of one
 *  shimmers. */
const PAPER_MIP_THRESHOLD = 2

export interface Size { w: number; h: number }
export interface SheetRect { minX: number; minY: number; maxX: number; maxY: number }

/** The sheet: what a bounded room's paint is clamped to. */
export interface PaperSheet {
  /** The sheet's size in world units — see PaperState.pageSize. */
  pageSize(): Size
}

/** What a dab shader reads to catch on the grain. Getters, not a snapshot:
 *  the texture changes whenever the paper does and the catch follows two
 *  dev sliders, so a pass must read it at draw time. */
export interface PaperSampling {
  readonly texture: WebGLTexture
  readonly scale: number
  readonly fillThreshold: number
  readonly fillCap: number
  /** See PaperState.worldSize. */
  worldSize(): Size
}

/** What a stamp pass needs: the grain plus the sheet it clamps to. */
export type PaperRead = PaperSampling & PaperSheet

export interface PaperStateOptions {
  readonly gl: WebGLRenderingContext
  readonly infinite: boolean
  readonly type: PaperType
  /** PencilEngineOptions.paperColor — overrides the type's own colour. */
  readonly color?: [number, number, number]
  readonly scale: number
  readonly fillThreshold: number
  readonly fillCap: number
  /** (#470) The sheet's world size for a bounded room — see
   *  PencilEngineOptions.pageWidth. Undefined for an infinite room. */
  readonly pageWidth?: number
  readonly pageHeight?: number
  /** The canvas — the fallback sheet for a caller that never passed one.
   *  Read live: its size changes on resize. */
  readonly canvas: { readonly width: number; readonly height: number }
  /** Called after a real texture has been swapped in — the engine redraws. */
  onLoaded(): void
}

// Default per-texture background, used when a room has no explicit
// PencilEngineOptions.paperColor override.
// (#426) Derived from shared's hex rather than kept as a second hand-written
// table, which is what this was. The comment above it said "update both
// together if these defaults ever change" — and by the time anyone read that,
// they already disagreed: 0.90 against 230/255 = 0.902, and the same rounding
// on the other five channels. Nothing failed, because nothing compared them;
// the shader just rendered a slightly different paper than the colour picker
// previewed. One source of truth removes the class of bug rather than fixing
// this instance of it.
//
// Safe under the cross-device determinism rule (.claude/rules.md): this is a
// constant converted by exact integer arithmetic on every client, not a value
// computed per-device on the GPU.
export function paperColorOf(type: PaperType): [number, number, number] {
  const hex = defaultPaperColor(type)
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

export class PaperState implements PaperRead {
  readonly scale: number
  /** Dev-only live tuning — see DAB_FRAG's u_paperFillThreshold/u_paperFillCap. */
  fillThreshold: number
  fillCap: number

  private readonly gl: WebGLRenderingContext
  private readonly infinite: boolean
  private readonly colorOverride: [number, number, number] | undefined
  private readonly pageWidth: number | undefined
  private readonly pageHeight: number | undefined
  private readonly canvas: { readonly width: number; readonly height: number }
  private readonly onLoaded: () => void
  private _type: PaperType

  // A placeholder set by init() (at construction and on context-restore),
  // swapped for the real baked texture once load()'s async upload resolves.
  // _ready lets a caller (tests, Room.tsx's history-replay sites) await that
  // swap deterministically instead of guessing tick counts.
  // Sole texture owner; the engine getter/painter contexts only borrow it.
  private _texture: WebGLTexture | null = null
  private _contextActive = false
  private _generation = 0
  private _request = 0
  private _loadedType: PaperType | null = null
  private _ready: Promise<void> = Promise.resolve()
  // True once the real (non-placeholder) paper texture has loaded at least
  // once — false right after construction and right after a context-restore
  // (both rebind a genuinely-meaningless placeholder), but never reset by a
  // later setType() switch: that swaps between two already-loaded real
  // textures (the previous type stays bound and valid until the new one is
  // ready — see load), so there's nothing invalid to guard against there.
  // Gates the engine's _onStart: a stroke painted against the placeholder
  // would bake in its flat, meaningless response permanently, with nothing
  // later to re-paint it once the real texture arrives (only the display/
  // composite step re-runs on demand, not already-applied pixel operations)
  // — a real bug this closes, found via a live cross-device paper-grain
  // comparison where the very first strokes of a freshly-opened room came
  // out wrong on whichever device's network happened to be slower to load
  // the (multi-MB) paper asset. Deliberately separate from the engine's
  // `_locked` (a public, user-controlled room-lock feature) rather than
  // reusing it — conflating the two would risk this auto-clearing a lock the
  // user explicitly asked for.
  private _loaded = false
  // (#365) Whether _texture currently carries a mip chain, i.e. whether the
  // infinite-room display pass may switch to a mip filter for it. Re-decided
  // every time _texture is replaced (initial placeholder, real bake, context
  // restore) and never assumed — see generatePaperMipmaps for why a driver
  // can legitimately refuse.
  private _mipsReady = false
  // Set by deactivate()/destroy() — guards load()'s async continuation (its
  // getPaperBytes() await can still resolve after the engine was destroyed)
  // from touching a dead gl context.
  private _destroyed = false

  constructor(opts: PaperStateOptions) {
    this.gl = opts.gl
    this.infinite = opts.infinite
    this._type = opts.type
    this.colorOverride = opts.color
    this.scale = opts.scale
    this.fillThreshold = opts.fillThreshold
    this.fillCap = opts.fillCap
    this.pageWidth = opts.pageWidth
    this.pageHeight = opts.pageHeight
    this.canvas = opts.canvas
    this.onLoaded = opts.onLoaded
  }

  get texture(): WebGLTexture {
    if (!this._texture) throw new Error('Paper texture unavailable')
    return this._texture
  }
  /** Current owner identity only; a pending replacement keeps the old texture live. */
  ownsCurrentTexture(gl: WebGLRenderingContext, texture: WebGLTexture): boolean {
    return this.gl === gl && !this._destroyed && this._contextActive && this._texture === texture
  }
  /** See the _loaded field comment. */
  get loaded(): boolean { return this._loaded }
  get type(): PaperType { return this._type }

  /** The room's background colour: the override, or the type's own. */
  color(): [number, number, number] {
    return this.colorOverride ?? paperColorOf(this._type)
  }

  /** Binds a flat mid-gray placeholder immediately — so every paint call
   *  between now and the real bake finishing still has something valid to
   *  sample, see paperLoader.ts's createPlaceholderPaperTexture — then starts
   *  the real load. Called once after the engine's _initGL, and again after a
   *  context restore: the dead context already took the previous texture
   *  (placeholder or real) with it, and the re-upload comes from the byte
   *  cache (paperLoader caches by PaperType, not by gl context, so this never
   *  re-fetches over the network — see getPaperBytes). */
  init(): void {
    this.requireLiveOwner()
    if (this.gl.isContextLost()) { this.contextLost(); throw new Error('Paper context lost') }
    const generation = ++this._generation, request = ++this._request
    let candidate: WebGLTexture | null = null
    try {
      candidate = createPlaceholderPaperTexture(this.gl)
      const mipsReady = generatePaperMipmaps(this.gl, candidate)
      if (this._destroyed || generation !== this._generation || request !== this._request) throw new Error('Paper initialization cancelled')
      if (this.gl.isContextLost()) { this.contextLost(); throw new Error('Paper context lost') }
      const old = this._texture
      this._texture = candidate
      candidate = null // Publication transfers ownership; later failure cannot roll it back.
      this._contextActive = true
      this._mipsReady = mipsReady
      this._loaded = false
      this._loadedType = null
      if (old) this.deleteTexture(old)
      this.start(this._type)
    } catch (error) {
      try { if (this.gl.isContextLost()) this.contextLost() } catch { /* Preserve primary. */ }
      if (candidate) { try { this.deleteTexture(candidate) } catch { /* Preserve primary. */ } }
      throw error
    }
  }

  /** Latest attempt, not a permission to use a later/destroyed GL generation. */
  ready(): Promise<void> { return this._ready }

  retry(): Promise<void> {
    this.requireLiveOwner()
    if (!this._contextActive) throw new Error('Paper context unavailable')
    if (this._loaded && this._loadedType === this._type) return this._ready
    return this.start(this._type)
  }

  /** The old real texture remains valid while a different type is loading. */
  setType(type: PaperType): void {
    this.requireLiveOwner()
    this._type = type
    if (this._contextActive) this.start(type)
    else ++this._request // Record the desired type without uploading into a lost context.
  }

  /** Early engine teardown: invalidate work, retain texture until borrowers retire. */
  deactivate(): void {
    if (this._destroyed) return
    this._destroyed = true
    ++this._generation
    ++this._request
    this._loaded = false
    this._loadedType = null
  }

  /** Actual loss fence only: names are dead, shared context/byte cache is not ours. */
  contextLost(): void {
    if (this._destroyed) return
    ++this._generation
    ++this._request
    this._contextActive = false
    this._texture = null
    this._loaded = false
    this._loadedType = null
    this._mipsReady = false
  }

  /** Sole terminal owner; engine and painter texture getters are borrowers. */
  destroy(): void {
    this.deactivate()
    const texture = this._texture
    this._texture = null
    this._contextActive = false
    this._mipsReady = false
    if (texture) this.deleteTexture(texture)
  }

  private requireLiveOwner(): void {
    if (this._destroyed) throw new Error('PaperState destroyed')
  }

  private deleteTexture(texture: WebGLTexture): void {
    // Query failure must not make an independent owned deletion unreachable.
    let lost = false, failed = false
    let firstError: unknown
    try { lost = this.gl.isContextLost() } catch (error) { failed = true; firstError = error }
    if (!lost) {
      try { this.gl.deleteTexture(texture) } catch (error) {
        if (!failed) { failed = true; firstError = error }
      }
    }
    if (failed) throw firstError
  }

  private current(generation: number, request: number): boolean {
    if (this._destroyed || !this._contextActive || generation !== this._generation || request !== this._request) return false
    if (this.gl.isContextLost()) { this.contextLost(); return false }
    return true
  }

  /** Shared bytes are never cancelled/cleared by a single owner. Observe each
   * rejection immediately, but preserve the original promise for consumers. */
  private start(type: PaperType): Promise<void> {
    this.requireLiveOwner()
    const generation = this._generation, request = ++this._request
    this._ready = this.load(type, generation, request)
    void this._ready.catch(() => {})
    return this._ready
  }

  private async load(type: PaperType, generation: number, request: number): Promise<void> {
    const bytes = await getPaperBytes(type)
    if (!this.current(generation, request)) return
    let candidate: WebGLTexture | null = null
    try {
      candidate = uploadPaperTexture(this.gl, bytes)
      const mipsReady = generatePaperMipmaps(this.gl, candidate)
      if (!this.current(generation, request)) {
        const obsolete = candidate
        candidate = null
        this.deleteTexture(obsolete)
        return
      }
      const old = this._texture
      this._texture = candidate
      candidate = null
      this._mipsReady = mipsReady
      this._loaded = true
      this._loadedType = type
      if (old) this.deleteTexture(old)
      if (this.current(generation, request)) this.onLoaded()
    } catch (error) {
      try { if (this.gl.isContextLost()) this.contextLost() } catch { /* Preserve primary. */ }
      if (candidate) { try { this.deleteTexture(candidate) } catch { /* Preserve primary. */ } }
      throw error
    }
  }

  /** The sheet's size in world units. Falls back to the canvas for a caller
   *  that never passed one — which is exactly the pre-#470 geometry, since
   *  back then the canvas was the sheet. */
  pageSize(): Size {
    return {
      w: this.pageWidth ?? this.canvas.width,
      h: this.pageHeight ?? this.canvas.height,
    }
  }

  /** World-space size the baked paper texture repeats over — see
   *  paperNoise.ts's PAPER_WORLD_SIZE for the full reasoning (coprimality
   *  with TILE_SIZE, etc.). Both kinds of room read the exact same
   *  fixed-resolution, offline-baked REPEAT texture (see load); they
   *  differ only in how far it is stretched.
   *
   *  A bounded room maps the tile across its sheet exactly once, because
   *  that is what DISPLAY_FRAG has always done for the blank-paper tint
   *  (`paperUV = v_uv`, no repeat) and the two must agree: with the tile
   *  repeating every PAPER_WORLD_SIZE (157) here while the tint spanned the
   *  whole sheet, the grain a stroke bit into was an order of magnitude
   *  finer than the grain visible underneath it — the same sheet rendered
   *  at two different scales, which is exactly what it looked like.
   *
   *  Safe for cross-device determinism (the property .claude/rules.md guards
   *  and #162/#165 were about) specifically because a bounded room's canvas
   *  is fixed by its paper format — A2 is 2480x3508 on every device, never
   *  DPR-scaled, unlike an infinite room's backing store (see cameraMath's
   *  deviceNativeZoom). Two clients therefore derive the identical UV for
   *  the identical buffer pixel, which is what feeds real dab deposit. An
   *  infinite room has no sheet to span, so it keeps the world-space repeat.
   *
   *  Note this is not square for a bounded room: the square tile takes the
   *  sheet's aspect ratio, so the grain stretches with it. That is inherited
   *  from the tint's own mapping rather than chosen, and matching it is the
   *  entire point here. */
  worldSize(): Size {
    if (this.infinite) return { w: PAPER_WORLD_SIZE, h: PAPER_WORLD_SIZE }
    return this.pageSize()
  }

  /** (#470) The sheet, in world units — or a degenerate rect for an infinite
   *  room, which has no sheet and whose paper therefore covers the screen
   *  edge to edge. The shader reads the degenerate case as "paper everywhere",
   *  which is exactly what an infinite room did before there was a rect at
   *  all. */
  pageRect(): [number, number, number, number] {
    if (this.infinite) return [0, 0, -1, -1]
    const { w, h } = this.pageSize()
    return [0, 0, w, h]
  }

  /** (#536, ADR 011 §17.50) A watercolour rect cut to the sheet in a bounded
   *  room. The wash's reach (halo bound, pads) ran past the page edge, and the
   *  layer created tiles out there - with a wash's six to ten tile-sized
   *  textures on each: a room of 2x3 tiles had 37 wash tiles alive on the
   *  Android after an eight-round lesson soak, 888 MB, all for paint nobody
   *  sees. The same clamp live and on replay, so both stay one function of
   *  the log. Infinite rooms have no sheet and pass through. */
  clampToSheet(r: SheetRect): SheetRect {
    if (this.infinite) return r
    const { w, h } = this.pageSize()
    return { minX: Math.max(0, r.minX), minY: Math.max(0, r.minY), maxX: Math.min(w, r.maxX), maxY: Math.min(h, r.maxY) }
  }

  /** (#470) How much the paper is being shrunk on the way to a compose
   *  pass's target, in texels per output pixel. Below PAPER_MIP_THRESHOLD the
   *  mip chain is left off on purpose — see bindForCompose. */
  texelsPerPixel(zoom: number): number {
    const { w } = this.worldSize()
    return (PAPER_BAKE_RESOLUTION / w) / Math.max(zoom, 1e-6) * this.scale
  }

  /** (#365) Binds the paper texture to TEXTURE1 for a PAPER_COMPOSE_FRAG
   *  draw, switching it to a mip filter for the duration.
   *
   *  The baked grain is ~13 texels per world unit (PAPER_BAKE_RESOLUTION over
   *  PAPER_WORLD_SIZE), and this shader takes one tap per output pixel at
   *  that pixel's world position — so it reads a single texel out of a
   *  ~13-wide footprint even at 1 world unit = 1 pixel, and out of a
   *  hundreds-wide one when the camera is zoomed out. That is the grain
   *  crawl that makes an infinite room read worse than a bounded one at the
   *  same on-screen size.
   *
   *  Switched per draw rather than set once at load because this texture is
   *  shared with the paint path (DAB_FRAG), where mip levels must never be
   *  used: level selection is implementation-defined, graphite deposit
   *  depends on the grain, and that deposit is baked into content every
   *  participant sees. See .claude/rules.md, "Cross-device pixel
   *  determinism". Callers must pair this with releaseFromCompose.
   *
   *  Applied to the export path as well as the live one, both of which go
   *  through this shader: filtering only the screen would leave an exported
   *  image visibly grainier than the room it was exported from.
   *
   *  Bounded rooms never reach either path — they display through
   *  DISPLAY_FRAG (see the engine's _display) and are scaled by the
   *  browser's compositor, so their paper is untouched by all of this. */
  bindForCompose(texelsPerPixel: number): void {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // (#470) Mips only once the paper is genuinely being shrunk past two
    // texels a pixel. This used to switch them on for every composed frame,
    // and with viewport rendering that meant every frame at any zoom below
    // 100% — where the grain is minified less than 2x and trilinear blending
    // costs far more than it buys. Measured at 27% zoom on a 4096 page,
    // scanning blank paper: grain energy 78 with the chain against 148
    // without, i.e. mip sampling was removing half the texture. The paper is
    // the largest surface on screen and its grain is what reads as sharpness,
    // so that halving is what "everything looks soft" actually was.
    //
    // Past the threshold the chain goes back on, and it has to: a genuinely
    // small zoom undersamples the grain into shimmer, which is worse than
    // soft because it crawls when the camera moves.
    const useMips = this._mipsReady && texelsPerPixel > PAPER_MIP_THRESHOLD
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, useMips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  }

  /** Restores the plain LINEAR filter the paint path requires — see
   *  bindForCompose. Must run after the draw that used it, before any
   *  dab can sample this texture again. */
  releaseFromCompose(): void {
    const { gl } = this
    if (!this._mipsReady) return
    // Always back to plain LINEAR, whichever filter the bind above chose.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
}

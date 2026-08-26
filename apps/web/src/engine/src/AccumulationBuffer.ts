// Persistent WebGL framebuffer that accumulates graphite over strokes.
// Blending: ONE, ONE_MINUS_SRC_ALPHA  →  result = src + dst*(1-src.a)

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

export class AccumulationBuffer {
  readonly gl: WebGLRenderingContext
  readonly width: number
  readonly height: number
  // Prefixed _ but not private — internal methods use _fbo directly; public getter `fbo` is used externally.
  _texture: WebGLTexture
  _fbo: WebGLFramebuffer

  // Smudge's scratch "picked up patch" buffers (engine/index.ts's
  // _paintOneSmudgeDab) request 'nearest': the patch is later sampled at a
  // dab-quad's fragment positions, which don't generally land on exact
  // texel centers, so LINEAR would blend between texels there — the same
  // cross-GPU bilinear-filtering precision risk flagged in .claude/rules.md
  // (paper grain's own hard-won lesson). NEAREST's texel selection is a
  // simple floor/round, not a weighted blend, so it stays deterministic
  // across vendors. Every other caller keeps the original LINEAR default —
  // real paint/composite/display content benefits from the smoothing and
  // was never part of that determinism class (see DAB_FRAG's own paper-catch
  // comment for what *is*).
  constructor(gl: WebGLRenderingContext, width: number, height: number, filter: 'linear' | 'nearest' = 'linear') {
    this.gl = gl
    this.width = width
    this.height = height
    this._baseFilter = filter
    this._texture = this._makeTexture(filter)
    this._fbo     = this._makeFBO(this._texture)
    // Computed here rather than as a field initializer: those run before the
    // constructor body assigns width/height, so an initializer would have
    // silently read undefined and disabled mipmaps everywhere.
    this._mipCapable = isPowerOfTwo(width) && isPowerOfTwo(height)
  }

  private _makeTexture(filter: 'linear' | 'nearest'): WebGLTexture {
    const { gl, width, height } = this
    const glFilter = filter === 'nearest' ? gl.NEAREST : gl.LINEAR
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private _makeFBO(texture: WebGLTexture): WebGLFramebuffer {
    const { gl } = this
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('Framebuffer incomplete')
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return fbo
  }

  get texture(): WebGLTexture { return this._texture }
  get fbo(): WebGLFramebuffer { return this._fbo }

  /** (#365) Whether a mip chain can legally exist for this buffer at all.
   *  WebGL1 only allows mipmaps on power-of-two textures, and a texture whose
   *  min filter asks for mip levels that aren't there is *incomplete* — it
   *  samples as opaque black, the same failure mode #363's use-after-free
   *  produced. So this is checked once, up front, and every mip path below
   *  is a no-op without it rather than something that can half-apply.
   *
   *  True for an infinite room's tiles (a square TILE_SIZE = 1024) and false
   *  for a bounded room's (its own canvas size, e.g. A4's 1240x1754) and for
   *  every viewport-sized scratch/assembly buffer. That split is exactly the
   *  one that matters: minification without mip levels is what makes an
   *  infinite room's low zoom crawl and sparkle, while a bounded room is
   *  scaled down by the browser's own compositor (its canvas element carries
   *  a CSS transform) and never samples its buffers minified at all. */
  private readonly _mipCapable: boolean

  // Whether the mip chain currently matches level 0. Starts false: nothing
  // has generated it yet, and the constructor leaves the plain LINEAR min
  // filter in place, so the texture is complete from the moment it exists.
  private _mipsValid = false
  // Whether the min filter is currently asking for mip levels. Tracked so
  // setMipSampling can skip redundant GL state changes on the per-draw path.
  private _mipSampling = false

  /** Call before *any* write to level 0. Drops back to the plain LINEAR min
   *  filter rather than merely noting staleness: leaving a mip filter in
   *  place over a stale chain would keep sampling pixels that are no longer
   *  there, and at the zooms this exists for that reads as content lagging a
   *  frame behind the stroke drawing it. Two texParameteri calls per write
   *  batch is nothing next to the draws around them. */
  private _invalidateMips(): void {
    if (!this._mipCapable || !this._mipsValid) return
    const { gl } = this
    this._mipsValid = false
    // Drops back to plain LINEAR rather than merely noting staleness: a
    // filter left pointing at a chain that no longer matches level 0 keeps
    // sampling pixels that are not there any more, which at the zooms this
    // exists for reads as content lagging a frame behind the stroke drawing
    // it.
    if (!this._mipSampling) return
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    this._mipSampling = false
  }

  /** (#365) Brings the mip chain in sync with level 0 if it is not already,
   *  and reports whether a chain now exists. Does *not* change how the
   *  texture is sampled — see setMipSampling for that.
   *
   *  The two are separate because the chain is needed by more than one caller
   *  at more than one moment: the composite wants it when it is shrinking
   *  tiles, and the coarse-level fold (#365's draw-call half) wants it on
   *  every write regardless of zoom, since shrinking 1024 texels into 128
   *  unfiltered would build the coarse level out of exactly the aliasing it
   *  exists to remove. If generating also switched the filter, that fold
   *  would leave every tile sampling trilinearly at 1:1 — where the result is
   *  meant to be a plain, untouched texel copy.
   *
   *  Idempotent and cheap when nothing has been written since the last call,
   *  which is the common case: a still camera re-composites the same tiles
   *  every frame. */
  ensureMipmaps(): boolean {
    if (!this._mipCapable) return false
    if (this._mipsValid) return true
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.generateMipmap(gl.TEXTURE_2D)
    this._mipsValid = true
    return true
  }

  /** The filter this buffer was created with — what setPointSampling restores
   *  to, so a smudge scratch (created 'nearest') does not silently come back
   *  as LINEAR. */
  private readonly _baseFilter: 'linear' | 'nearest'
  private _pointSampling = false

  /** (#507) Forces exact-texel sampling for the next draw, and back again.
   *
   *  The transform blits sample with their own hand-written bilinear filter
   *  (see TILE_BILINEAR in shaders.ts — a tiled layer cannot use the
   *  hardware's, because at a tile edge half the kernel lives in a texture
   *  this pass does not have). They fetch at exact texel centres, so the
   *  sampler must not add a second, different interpolation on top: NEAREST
   *  makes each fetch a plain floor, which is also the only thing that
   *  reliably keeps a mip filter left behind by setMipSampling out of a pass
   *  that would otherwise read blurred coarse levels.
   *
   *  Scoped to one draw — every caller turns it off immediately afterwards,
   *  which is what makes restoring from _baseFilter/_mipSampling correct
   *  rather than a guess about who else touched the texture in between. */
  setPointSampling(on: boolean): void {
    if (on === this._pointSampling) return
    const { gl } = this
    const base = this._baseFilter === 'nearest' ? gl.NEAREST : gl.LINEAR
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : base)
    gl.texParameteri(
      gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      on ? gl.NEAREST : (this._mipSampling ? gl.LINEAR_MIPMAP_LINEAR : base),
    )
    this._pointSampling = on
  }

  /** (#365) Chooses trilinear or plain LINEAR minification for the next draw
   *  that samples this buffer. Turning it on without a valid chain is refused
   *  rather than obeyed: a texture whose filter asks for levels it lacks is
   *  incomplete and samples as opaque black. Callers that want mip sampling
   *  must therefore go through ensureMipmaps() first and respect its answer.
   *
   *  Set per draw rather than once, because the same tile is sampled by
   *  passes that want different answers — the coarse fold always minifies,
   *  the on-screen composite only sometimes. */
  setMipSampling(on: boolean): void {
    if (!this._mipCapable) return
    const wanted = on && this._mipsValid
    if (wanted === this._mipSampling) return
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, wanted ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    this._mipSampling = wanted
  }

  beginDraw(): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  beginErase(): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** (#446) `result = dst * src.a` — the mirror of beginErase: what the
   *  incoming alpha covers survives, everything else is cleared. Used with a
   *  selection mask to cut a copied region out of a flattened patch, so a
   *  lasso'd shape pastes as that shape and not as its bounding rectangle.
   *
   *  Multiplying a premultiplied buffer by a scalar is exactly right for
   *  premultiplied colour — rgb and a scale together — so nothing on this path
   *  ever has to un-premultiply and re-premultiply around the mask. */
  beginKeepDraw(): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ZERO, gl.SRC_ALPHA)
  }

  /** Marker's own inkLoad accumulation (ADR 004 "Ревизия v1.5"): a pure sum,
   *  `result = src + dst`, no alpha-weighted saturation at all — unlike
   *  beginDraw()'s (ONE, ONE_MINUS_SRC_ALPHA) "over" (which is exactly what
   *  `coverage` still wants, for a fast-saturating silhouette), inkLoad is
   *  meant to keep growing across repeated overlapping dabs within one
   *  stroke with no ceiling at the accumulation stage — the only saturation
   *  happens later, once, in DAB_FRAG's composite branch
   *  (`1 - exp(-inkLoad * rate)`), not here. */
  beginAdditiveDraw(): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
  }

  /** Marker's own composite pass (#330): a straight overwrite, `result = src`,
   *  no blending with what's already in the target at all.
   *
   *  Every other writer here is an *increment* — one dab's own deposit,
   *  meaningless without whatever is already underneath it, so it has to blend.
   *  Marker's composite (DAB_FRAG's u_inkMode>1.5 branch) is the one exception:
   *  it is a complete recomputation of the final pixel from this stroke's
   *  frozen `original` plus its accumulated `coverage`/`inkLoad` (see
   *  RibbonStrokeScratch), so the value it produces is already the answer, not
   *  a contribution toward one.
   *
   *  Running that through beginDraw()'s "over" instead compounded alpha once
   *  per dab (`A = a + A*(1-a)`): a pixel inside N dab footprints went through
   *  N compositions, its neighbour through N-1, leaving a hard alpha step along
   *  every dab's own rim — measured up to 53/255, repeating at the dab-spacing
   *  interval, which is what made a wide stroke visibly break into separate
   *  stamped shapes (rectangular ones on the 5:1 chisel nib). #266 fixed the
   *  same compounding on the *colour* side; this is its alpha-side twin.
   *
   *  Safe to overwrite rather than blend because `coverage`/`inkLoad` only ever
   *  change where a dab actually landed, and the composite draw uses that same
   *  dab quad — so a pixel is recomputed exactly when its own inputs change,
   *  and is left alone (still holding its last correct value) when they don't.
   *  Accepted consequence: within a marker stroke's own footprint, anything a
   *  *peer* painted into the same tile mid-stroke is overwritten rather than
   *  preserved — same class of accepted v1 gap as RibbonStrokeScratch's own
   *  mid-stroke tile-eviction note. */
  beginReplaceDraw(): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.disable(gl.BLEND)
  }

  endDraw(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.disable(this.gl.BLEND)
  }

  clear(): void {
    this._invalidateMips()
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  readPixels(): Uint8Array {
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return pixels
  }

  restorePixels(pixels: Uint8Array): void {
    this._invalidateMips()
    const { gl, width, height } = this
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  }

  /** (#425) Restores a payload that covers only the world-top-left `w`x`h` of
   *  this buffer, leaving the rest transparent.
   *
   *  Exists because a bounded room's tile grid overhangs the sheet: a
   *  1754x2480 canvas on 1024-pixel tiles has a right-hand column running to
   *  2048 and a bottom row running to 3072. Those pixels cannot be displayed
   *  by anything — the sheet ends — but they were baked, gzipped, stored,
   *  shipped and inflated by every client on every first join. Measured on
   *  room U68gWoq-: 6.70 MB on the wire, 4.81 MB with the overhang dropped.
   *
   *  A full-size payload takes the plain path above: an old snapshot stored
   *  before this existed is exactly the case where `w`/`h` equal the buffer's
   *  own size, so nothing needs to know which era it came from.
   *
   *  The reallocation is not incidental. `texSubImage2D` alone would leave
   *  whatever the texture held outside the sub-rect, and this is a *restore* —
   *  it has to mean the same thing the whole-texture path means, which is
   *  "this buffer now holds exactly this and nothing else". `texImage2D` with
   *  null data is specified to zero-fill, so the overhang lands transparent
   *  rather than merely unspecified.
   *
   *  (#500) The y offset is `height - h`, not 0, and that is the whole
   *  correctness of this method. What gets clipped away is the part of the
   *  tile *below* the sheet, so the rows that survive are the tile's world-top
   *  ones — which, this array being GL bottom-up, are its *last* rows, and so
   *  belong at the top of the texture. Uploading them at y 0 puts them under
   *  the paper instead: on a 2480x3508 page the bottom tile row's 436 surviving
   *  rows landed at world y 3660..4095, where nothing renders them and the next
   *  bake — clipping to the sheet again, over rows now empty — wrote the loss
   *  back to the server. Columns need no such care; see clipTileToPage, which
   *  keeps the first `keepW` of them in both conventions. */
  restorePixelsRect(w: number, h: number, pixels: Uint8Array): void {
    const { gl, width, height } = this
    if (w === width && h === height) { this.restorePixels(pixels); return }
    this._invalidateMips()
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    if (w > 0 && h > 0) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    }
  }

  copyTo(dest: AccumulationBuffer): void {
    dest._invalidateMips() // copyTexImage2D redefines dest's level 0
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.bindTexture(gl.TEXTURE_2D, dest._texture)
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.width, this.height, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Like copyTo, but for an arbitrary sub-rect rather than the whole
   *  buffer — smudge's own "pick up whatever's currently under/behind the
   *  dab" step (engine/index.ts's _paintOneSmudgeDab), copied into an
   *  independent scratch texture so it can be sampled while this buffer's
   *  own tile keeps being the render target (WebGL1 forbids reading and
   *  writing the same texture in one draw call — same reasoning
   *  _bakeTransform's scratch-then-copyTo two-phase commit exists for).
   *  `glX`/`glY` are bottom-up (native GL framebuffer convention, like
   *  copyTexImage2D's own x/y) — the caller flips from this engine's usual
   *  top-down app-space convention, same as every other app-space/GL-space
   *  boundary in this codebase (DAB_VERT, pickColor). Redefines `dest`'s own
   *  texture storage to exactly `w x h` (copyTexImage2D always does this,
   *  regardless of dest's previous size — see copyTo's identical behavior),
   *  so a pooled dest buffer sized differently than `w x h` is silently
   *  resized, not rejected — callers that care about pool reuse must size
   *  their own request to match before calling this. */
  copyRegionTo(dest: AccumulationBuffer, glX: number, glY: number, w: number, h: number): void {
    dest._invalidateMips() // copyTexImage2D redefines dest's level 0
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.bindTexture(gl.TEXTURE_2D, dest._texture)
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, glX, glY, w, h, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  destroy(): void {
    this.gl.deleteTexture(this._texture)
    this.gl.deleteFramebuffer(this._fbo)
  }
}

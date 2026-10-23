// apps/web/src/engine/src/buffers/AccumulationBuffer.ts
function isPowerOfTwo(n) {
  return n > 0 && (n & n - 1) === 0;
}
var checkedContexts = /* @__PURE__ */ new WeakSet();
var AccumulationBuffer = class {
  gl;
  width;
  height;
  // Prefixed _ but not private — internal methods use _fbo directly; public getter `fbo` is used externally.
  _texture;
  _fbo;
  // copyTo's legacy unequal-size path redefines physical storage without
  // changing the public logical extent. Guards must use the physical extent.
  _storageWidth;
  _storageHeight;
  // Smudge's scratch "picked up patch" buffers requested 'nearest' until #416
  // (they are LINEAR since — see SmudgePainter's scratchPool; the ribbon's
  // scratch still asks for it). The original reasoning: the patch is later sampled at a
  // dab-quad's fragment positions, which don't generally land on exact
  // texel centers, so LINEAR would blend between texels there — the same
  // cross-GPU bilinear-filtering precision risk flagged in .claude/rules.md
  // (paper grain's own hard-won lesson). NEAREST's texel selection is a
  // simple floor/round, not a weighted blend, so it stays deterministic
  // across vendors. Every other caller keeps the original LINEAR default —
  // real paint/composite/display content benefits from the smoothing and
  // was never part of that determinism class (see DAB_FRAG's own paper-catch
  // comment for what *is*).
  constructor(gl, width, height, filter = "linear") {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this._storageWidth = width;
    this._storageHeight = height;
    this._baseFilter = filter;
    this._texture = this._makeTexture(filter);
    this._fbo = this._makeFBO(this._texture);
    this._mipCapable = isPowerOfTwo(width) && isPowerOfTwo(height);
  }
  _makeTexture(filter) {
    const { gl, width, height } = this;
    const glFilter = filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  _makeFBO(texture) {
    const { gl } = this;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (!checkedContexts.has(gl)) {
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error("Framebuffer incomplete");
      checkedContexts.add(gl);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }
  get texture() {
    return this._texture;
  }
  get fbo() {
    return this._fbo;
  }
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
  _mipCapable;
  // Whether the mip chain currently matches level 0. Starts false: nothing
  // has generated it yet, and the constructor leaves the plain LINEAR min
  // filter in place, so the texture is complete from the moment it exists.
  _mipsValid = false;
  // Whether the min filter is currently asking for mip levels. Tracked so
  // setMipSampling can skip redundant GL state changes on the per-draw path.
  _mipSampling = false;
  /** Call before *any* write to level 0. Drops back to the plain LINEAR min
   *  filter rather than merely noting staleness: leaving a mip filter in
   *  place over a stale chain would keep sampling pixels that are no longer
   *  there, and at the zooms this exists for that reads as content lagging a
   *  frame behind the stroke drawing it. Two texParameteri calls per write
   *  batch is nothing next to the draws around them. */
  _invalidateMips() {
    if (!this._mipCapable || !this._mipsValid) return;
    const { gl } = this;
    this._mipsValid = false;
    if (!this._mipSampling) return;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    this._mipSampling = false;
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
  ensureMipmaps() {
    if (!this._mipCapable) return false;
    if (this._mipsValid) return true;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    this._mipsValid = true;
    return true;
  }
  /** The filter this buffer was created with — what setPointSampling restores
   *  to, so a smudge scratch (created 'nearest') does not silently come back
   *  as LINEAR. */
  _baseFilter;
  _pointSampling = false;
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
  setPointSampling(on) {
    if (on === this._pointSampling) return;
    const { gl } = this;
    const base = this._baseFilter === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : base);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      on ? gl.NEAREST : this._mipSampling ? gl.LINEAR_MIPMAP_LINEAR : base
    );
    this._pointSampling = on;
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
  setMipSampling(on) {
    if (!this._mipCapable) return;
    const wanted = on && this._mipsValid;
    if (wanted === this._mipSampling) return;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, wanted ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    this._mipSampling = wanted;
  }
  beginDraw() {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  beginErase() {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  }
  /** (#446) `result = dst * src.a` — the mirror of beginErase: what the
   *  incoming alpha covers survives, everything else is cleared. Used with a
   *  selection mask to cut a copied region out of a flattened patch, so a
   *  lasso'd shape pastes as that shape and not as its bounding rectangle.
   *
   *  Multiplying a premultiplied buffer by a scalar is exactly right for
   *  premultiplied colour — rgb and a scale together — so nothing on this path
   *  ever has to un-premultiply and re-premultiply around the mask. */
  beginKeepDraw() {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
  }
  /** Marker's own inkLoad accumulation (ADR 004 "Ревизия v1.5"): a pure sum,
   *  `result = src + dst`, no alpha-weighted saturation at all — unlike
   *  beginDraw()'s (ONE, ONE_MINUS_SRC_ALPHA) "over" (which is exactly what
   *  `coverage` still wants, for a fast-saturating silhouette), inkLoad is
   *  meant to keep growing across repeated overlapping dabs within one
   *  stroke with no ceiling at the accumulation stage — the only saturation
   *  happens later, once, in DAB_FRAG's composite branch
   *  (`1 - exp(-inkLoad * rate)`), not here. */
  beginAdditiveDraw() {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
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
  beginReplaceDraw() {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
  }
  /** (#536, s17.28) Blend by MAX (EXT_blend_minmax): what lands on a texel is
   *  the largest of the writes, not their sum. The watercolor deposit is a
   *  FILM the brush leaves, and a film is as thick as the brush made it, not
   *  as thick as the number of stamps that happened to overlap there. */
  beginMaxDraw(ext) {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(ext.MAX_EXT);
  }
  endDraw() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.disable(this.gl.BLEND);
    this.gl.blendEquation(this.gl.FUNC_ADD);
  }
  clear() {
    this._invalidateMips();
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** (#536, §17.68) `into`, when big enough, is filled instead of a new array. */
  readPixels(into) {
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    const n = width * height * 4;
    const pixels = into && into.byteLength >= n ? into.subarray(0, n) : new Uint8Array(n);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
  }
  /** Owned tight bottom-up readback for a snapshot's page-clipped edge tile. */
  readPixelsRegion(x, y, width, height) {
    const pixels = new Uint8Array(width * height * 4);
    if (!width || !height) return pixels;
    const { gl } = this;
    const pack = gl.getParameter(gl.PACK_ALIGNMENT) ?? 4;
    if (pack !== 4) gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    try {
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (pack !== 4) gl.pixelStorei(gl.PACK_ALIGNMENT, pack);
    }
    return pixels;
  }
  /** DEV bridge: replace an existing premultiplied Q8 layer tile from a
   * dedicated WebGPU canvas. No paper/composite or model fallback is applied.
   * Browser canvas conversion is not presumed byte exact; a hardware gate is
   * required before this path is admitted by Room. */
  restoreCanvasPixels(canvas) {
    if (canvas.width !== this.width || canvas.height !== this.height || this._storageWidth !== this.width || this._storageHeight !== this.height) {
      throw new Error("Room GPU canvas bridge requires equal allocated tile dimensions");
    }
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error("Room GPU canvas bridge WebGL context lost");
    this._invalidateMips();
    const binding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const flip2 = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    const premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    const conversion = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL);
    try {
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip2);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, conversion);
      gl.bindTexture(gl.TEXTURE_2D, binding);
    }
  }
  restorePixels(pixels) {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    if (this._storageWidth === width && this._storageHeight === height && pixels.byteLength >= width * height * 4) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      this._storageWidth = pixels.byteLength >= width * height * 4 ? width : 0;
      this._storageHeight = pixels.byteLength >= width * height * 4 ? height : 0;
    }
  }
  /** (#536, ADR 011 §17.68) The whole texture overwritten in place with
   *  `pixels` - same content as restorePixels, but no new storage: a wash
   *  brought back from main memory uploads dozens of these at once, and on
   *  the iPad reallocating each one next to the storage still being freed was
   *  the spike the tab did not survive. */
  writePixels(pixels) {
    this._invalidateMips();
    const { gl, width, height } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
  restorePixelsRect(w, h, pixels) {
    const { gl, width, height } = this;
    if (w === width && h === height) {
      this.restorePixels(pixels);
      return;
    }
    this._invalidateMips();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this._storageWidth = width;
    this._storageHeight = height;
    if (w > 0 && h > 0) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    }
  }
  copyTo(dest) {
    dest._invalidateMips();
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.bindTexture(gl.TEXTURE_2D, dest._texture);
    if (dest !== this && dest.gl === gl && this._storageWidth === this.width && this._storageHeight === this.height && dest._storageWidth === this.width && dest._storageHeight === this.height) {
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.width, this.height);
    } else {
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.width, this.height, 0);
      if (dest.gl === gl) {
        const known = dest !== this && this._storageWidth === this.width && this._storageHeight === this.height;
        dest._storageWidth = known ? this.width : 0;
        dest._storageHeight = known ? this.height : 0;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** Like copyTo, but from an arbitrary sub-rect of this buffer into an
   *  arbitrary sub-rect of `dest` — smudge's own "pick up whatever's
   *  currently under/behind the dab" step (engine/index.ts's
   *  SmudgePainter.gatherPatch), copied into an independent scratch texture so it
   *  can be sampled while this buffer's own tile keeps being the render
   *  target (WebGL1 forbids reading and writing the same texture in one
   *  draw call — same reasoning AreaOps.bakeLayerTransform's scratch-then-copyTo
   *  two-phase commit exists for).
   *
   *  Both `srcGl*` and `destGl*` are bottom-up (native GL framebuffer
   *  convention, like copyTexSubImage2D's own x/y) — the caller flips from
   *  this engine's usual top-down app-space convention, same as every other
   *  app-space/GL-space boundary in this codebase (DAB_VERT, pickColor).
   *
   *  (#514) Was `copyRegionTo`, which wrote the whole of `dest` through
   *  `copyTexImage2D` and so could only ever be fed one rect from one
   *  source. A smudge patch straddling a tile seam is several rects from
   *  several tiles assembled into one buffer, which needs the *sub*-image
   *  form: `copyTexSubImage2D` leaves everything outside the destination
   *  rect untouched (so successive calls accumulate) and, unlike
   *  copyTexImage2D, does not redefine `dest`'s storage — meaning `dest`
   *  keeps the size its `width`/`height` fields claim, and a caller must
   *  size its own request to match rather than relying on a silent resize.
   *  Anything outside every rect the caller copies keeps whatever `dest`
   *  held before, so a pooled buffer wants clearing first. */
  copyRegionInto(dest, srcGlX, srcGlY, destGlX, destGlY, w, h) {
    if (w <= 0 || h <= 0) return;
    dest._invalidateMips();
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.bindTexture(gl.TEXTURE_2D, dest._texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, destGlX, destGlY, srcGlX, srcGlY, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  destroy() {
    this.gl.deleteTexture(this._texture);
    this.gl.deleteFramebuffer(this._fbo);
  }
};

// apps/web/src/engine/src/webgpuCanonical/fieldBuffer.ts
var CanonicalFieldBuffer = class {
  owner;
  field;
  width;
  height;
  filter;
  released = false;
  constructor(owner, width, height, filter = "nearest", label = "canonical scratch") {
    this.owner = owner;
    this.width = width;
    this.height = height;
    this.filter = filter;
    this.field = owner.createField(label, width, height, filter);
  }
  get texture() {
    this.assertLive();
    return this.field.texture;
  }
  get view() {
    this.assertLive();
    return this.field.view;
  }
  get destroyed() {
    return this.released;
  }
  assertLive() {
    if (this.released) throw new Error("Canonical field buffer use after destroy");
  }
  clear(rect) {
    this.assertLive();
    this.owner.clearField(this.field, rect);
  }
  copyTo(dest) {
    this.assertLive();
    dest.assertLive();
    if (dest.owner !== this.owner) throw new Error("Canonical buffer copy crosses devices");
    this.owner.copyField(this.field, dest.field);
  }
  /** SAME contract as AccumulationBuffer.copyRegionInto: both source and
   * destination arguments are canonical GL-bottom-up coordinates. Convert
   * at this explicit seam into WebGPU row-zero-at-world-top coordinates. */
  copyRegionInto(dest, srcGlX, srcGlY, destGlX, destGlY, w, h) {
    this.assertLive();
    dest.assertLive();
    if (w <= 0 || h <= 0) return;
    if (dest.owner !== this.owner) throw new Error("Canonical buffer region copy crosses devices");
    this.owner.copyRegion(this.field, dest.field, [srcGlX, this.height - srcGlY - h], [destGlX, dest.height - destGlY - h], [w, h]);
  }
  readBytes() {
    this.assertLive();
    return this.owner.readField(this.field);
  }
  upload(bytes) {
    this.assertLive();
    this.owner.upload(this.field, bytes);
  }
  destroy() {
    if (this.released) return;
    this.released = true;
    this.owner.destroyField(this.field);
  }
};

// docs/qa/harness/728-native-end-to-end/solverCheckpointOps.mjs
function installSolverCheckpointOps(planner, { indices, getField, clone, rolesForIndex = () => ["a", "ca"] }) {
  if (!indices.length || new Set(indices).size !== indices.length || indices.some((i) => !Number.isInteger(i) || i < 0)) throw Error("Explicit unique operator indices required");
  const original = planner.prepare, captures = [];
  let calls = 0;
  planner.prepare = function(...args) {
    if (++calls !== 1) throw Error("Single solver job required");
    const job = original.apply(this, args);
    if (!job) throw Error("Actual solver job missing");
    if (indices.some((i) => i >= job.ops.length)) throw Error("Checkpoint outside actual job");
    for (const index of indices) {
      const operation = job.ops[index];
      job.ops[index] = () => {
        operation();
        const field = getField();
        if (!field || field.w !== 1536 || field.h !== 1536) throw Error("Actual1536 field required");
        const roles = rolesForIndex(index);
        if (!roles.length || roles.some((role) => !["a", "b", "c", "ca", "cb", "cc"].includes(role))) throw Error("Explicit pigment/color checkpoint roles required");
        captures.push({ index, ...Object.fromEntries(roles.map((role) => [role, clone(field[role])])) });
      };
    }
    return job;
  };
  return { captures, get calls() {
    return calls;
  }, detach() {
    planner.prepare = original;
  } };
}

// docs/qa/harness/728-native-end-to-end/solverBoundarySnapshot.ts
var FIELD_BYTES = 1536 * 1536 * 4;
var hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (v) => v.toString(16).padStart(2, "0")).join("");
var flip = (raw) => {
  const top = new Uint8Array(raw.length);
  for (let y = 0; y < 1536; y++) top.set(raw.subarray((1535 - y) * 6144, (1536 - y) * 6144), y * 6144);
  return top;
};
function installBoundarySnapshot(owner, native, index) {
  const planner = native ? owner.planner : owner._settlePlan, buffers = [];
  const capture = installSolverCheckpointOps(planner, { indices: [index], rolesForIndex: () => index === 0 ? ["a", "ca"] : ["c", "cc"], getField: () => native ? owner.fieldOwner.current : owner._fieldCache[0], clone: (source) => {
    if (source.width !== 1536 || source.height !== 1536) throw Error("Exact1536 source required");
    const out = native ? new CanonicalFieldBuffer(owner.backend, 1536, 1536, source.filter, "QA boundary snapshot") : new AccumulationBuffer(owner.gl, 1536, 1536, source._baseFilter);
    source.copyTo(out);
    buffers.push(out);
    return out;
  } });
  return { async read() {
    if (capture.captures.length !== 1 || capture.calls !== 1) throw Error("Exactly one original operator snapshot required");
    const row = capture.captures[0], roles = [];
    for (const role of index === 0 ? ["a", "ca"] : ["c", "cc"]) {
      const b = row[role], bytes = native ? await b.readBytes() : flip(b.readPixels());
      if (bytes.length !== FIELD_BYTES) throw Error("Bounded field bytes");
      roles.push({ role, w: 1536, h: 1536, filter: b.filter ?? b._baseFilter, bytes });
    }
    return { index, roles };
  }, destroy() {
    capture.detach();
    for (const b of buffers) b.destroy();
  } };
}
async function packBoundarySnapshot(snapshot) {
  const roles = [];
  for (const r of snapshot.roles) {
    const gzip = new Uint8Array(await new Response(new Blob([r.bytes.slice().buffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    if (gzip.length > FIELD_BYTES + 8192) throw Error("Gzip field bound");
    let s = "";
    for (let i = 0; i < gzip.length; i += 32768) s += String.fromCharCode(...gzip.subarray(i, i + 32768));
    roles.push({ role: r.role, w: r.w, h: r.h, filter: r.filter, sha256: await hash(r.bytes), gzipSha256: await hash(gzip), gzipBase64: btoa(s) });
  }
  return { index: snapshot.index, roles };
}
async function validateBoundarySnapshot(snapshot) {
  if (!snapshot || ![0, 1].includes(snapshot.index) || !Array.isArray(snapshot.roles) || snapshot.roles.length !== 2) throw Error("Strict boundary schema");
  const names = snapshot.index === 0 ? ["a", "ca"] : ["c", "cc"];
  for (let i = 0; i < 2; i++) {
    const r = snapshot.roles[i];
    if (r.role !== names[i] || r.w !== 1536 || r.h !== 1536 || r.filter !== "nearest" || !/^[a-f0-9]{64}$/.test(r.sha256) || !/^[a-f0-9]{64}$/.test(r.gzipSha256) || typeof r.gzipBase64 !== "string" || r.gzipBase64.length > Math.ceil((FIELD_BYTES + 8192) / 3) * 4) throw Error("Strict boundary dimensions/filter/hash/budget");
    const gz = Uint8Array.from(atob(r.gzipBase64), (x) => x.charCodeAt(0));
    if (gz.length > FIELD_BYTES + 8192 || await hash(gz) !== r.gzipSha256) throw Error("Strict boundary compressed checksum");
    const reader = new Blob([gz.buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader(), bytes = new Uint8Array(FIELD_BYTES);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > FIELD_BYTES) throw Error("Strict boundary decompression bound");
        bytes.set(value, offset);
        offset += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {
      });
    }
    if (offset !== FIELD_BYTES || await hash(bytes) !== r.sha256) throw Error("Strict boundary raw checksum");
  }
}
async function compareBoundarySnapshot(actual, expected) {
  await validateBoundarySnapshot(expected);
  if (actual.index !== expected.index || expected.roles.length !== 2) throw Error("Original boundary/role count mismatch");
  const rows = [];
  for (const r of actual.roles) {
    const e = expected.roles.find((x) => x.role === r.role);
    if (!e || e.w !== r.w || e.h !== r.h || e.filter !== r.filter) throw Error("Boundary dims/filter/role mismatch");
    const gz = Uint8Array.from(atob(e.gzipBase64), (x) => x.charCodeAt(0));
    if (gz.length > FIELD_BYTES + 8192 || await hash(gz) !== e.gzipSha256) throw Error("Boundary compressed SHA mismatch");
    const reader = new Blob([gz.buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader(), bytes = new Uint8Array(FIELD_BYTES);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > FIELD_BYTES) throw Error("Boundary decompression bound");
        bytes.set(value, offset);
        offset += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {
      });
    }
    if (offset !== FIELD_BYTES || await hash(bytes) !== e.sha256) throw Error("Boundary Q8 SHA mismatch");
    const channels = Array.from({ length: 4 }, () => ({ changed: 0, max: 0, sum: 0 }));
    for (let i = 0; i < bytes.length; i++) {
      const d = Math.abs(bytes[i] - r.bytes[i]), c = channels[i % 4];
      if (d) c.changed++;
      c.max = Math.max(c.max, d);
      c.sum += d;
    }
    rows.push({ role: r.role, w: r.w, h: r.h, filter: r.filter, expectedSha256: e.sha256, actualSha256: await hash(r.bytes), channels, exact: channels.every((c) => c.changed === 0) });
  }
  return { index: actual.index, rows, scope: "One original operator boundary, two actual1536 Q8 fields; field filter checked. No whole solver/Room claim." };
}
export {
  compareBoundarySnapshot,
  installBoundarySnapshot,
  packBoundarySnapshot,
  validateBoundarySnapshot
};

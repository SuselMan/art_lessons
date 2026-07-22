// Persistent WebGL framebuffer that accumulates graphite over strokes.
// Blending: ONE, ONE_MINUS_SRC_ALPHA  →  result = src + dst*(1-src.a)

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
    this._texture = this._makeTexture(filter)
    this._fbo     = this._makeFBO(this._texture)
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

  beginDraw(): void {
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  beginErase(): void {
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)
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
    const { gl, width, height } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.viewport(0, 0, width, height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
  }

  endDraw(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.disable(this.gl.BLEND)
  }

  clear(): void {
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
    const { gl, width, height } = this
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  }

  copyTo(dest: AccumulationBuffer): void {
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

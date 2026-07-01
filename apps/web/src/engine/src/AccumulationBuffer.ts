// Persistent WebGL framebuffer that accumulates graphite over strokes.
// Blending: ONE, ONE_MINUS_SRC_ALPHA  →  result = src + dst*(1-src.a)

export class AccumulationBuffer {
  readonly gl: WebGLRenderingContext
  readonly width: number
  readonly height: number
  // Prefixed _ but not private — internal methods use _fbo directly; public getter `fbo` is used externally.
  _texture: WebGLTexture
  _fbo: WebGLFramebuffer

  constructor(gl: WebGLRenderingContext, width: number, height: number) {
    this.gl = gl
    this.width = width
    this.height = height
    this._texture = this._makeTexture()
    this._fbo     = this._makeFBO(this._texture)
  }

  private _makeTexture(): WebGLTexture {
    const { gl, width, height } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
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

  destroy(): void {
    this.gl.deleteTexture(this._texture)
    this.gl.deleteFramebuffer(this._fbo)
  }
}

// Persistent WebGL framebuffer that accumulates graphite over strokes.
// Blending uses: result = src + dst * (1 - src.a)
// which models graphite accumulation with saturation.

export class AccumulationBuffer {
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this._undoStack = [];

    this._texture = this._makeTexture();
    this._fbo = this._makeFBO(this._texture);
  }

  _makeTexture() {
    const { gl, width, height } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _makeFBO(texture) {
    const { gl, width, height } = this;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: ${status}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  beginDraw() {
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    // result.rgb = src.rgb * 1 + dst.rgb * (1 - src.a)
    // With src = vec4(deposit), this gives: deposit + old*(1-deposit) = graphite accumulation
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  endDraw() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
  }

  get texture() { return this._texture; }

  // Called before each stroke to enable undo
  saveSnapshot() {
    const { gl, width, height } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this._undoStack.push(pixels);
    if (this._undoStack.length > 30) this._undoStack.shift();
  }

  undo() {
    if (!this._undoStack.length) return false;
    const pixels = this._undoStack.pop();
    const { gl, width, height } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return true;
  }

  clear() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._undoStack = [];
  }

  destroy() {
    const { gl } = this;
    gl.deleteTexture(this._texture);
    gl.deleteFramebuffer(this._fbo);
  }
}

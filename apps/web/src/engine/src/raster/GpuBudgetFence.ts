/** Tiny, engine-owned completion fence for WebGL1 scheduling clocks.
 * No physical pass samples this texture. Handles survive only this context. */
export class GpuBudgetFence {
  private texture: WebGLTexture | null = null
  private framebuffer: WebGLFramebuffer | null = null
  private readonly pixel = new Uint8Array(4)

  private readonly gl: WebGLRenderingContext
  constructor(gl: WebGLRenderingContext) { this.gl = gl }

  private ensure(): void {
    if (this.framebuffer) return
    const gl = this.gl
    const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    gl.activeTexture(gl.TEXTURE0)
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
    let texture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null
    try {
      texture = gl.createTexture(); framebuffer = gl.createFramebuffer()
      if (!texture || !framebuffer) throw new Error('GPU budget fence allocation failed')
      gl.bindTexture(gl.TEXTURE_2D, texture)
      for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST)
      for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('GPU budget fence framebuffer incomplete')
      this.texture = texture; this.framebuffer = framebuffer
    } catch (error) {
      if (!gl.isContextLost()) { if (framebuffer) gl.deleteFramebuffer(framebuffer); if (texture) gl.deleteTexture(texture) }
      throw error
    } finally {
      if (!gl.isContextLost()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer)
        gl.bindTexture(gl.TEXTURE_2D, previousTexture)
        gl.activeTexture(active)
      }
    }
  }

  sync(): void {
    const gl = this.gl
    if (gl.isContextLost()) { this.forget(); return }
    this.ensure()
    if (gl.isContextLost()) { this.forget(); return }
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const pack = gl.getParameter(gl.PACK_ALIGNMENT) as number
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel)
    } finally {
      if (!gl.isContextLost()) { gl.pixelStorei(gl.PACK_ALIGNMENT, pack); gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer) }
      else this.forget()
    }
  }

  release(): void {
    const gl = this.gl
    if (!gl.isContextLost()) { if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer); if (this.texture) gl.deleteTexture(this.texture) }
    this.forget()
  }

  forget(): void { this.texture = null; this.framebuffer = null }
}

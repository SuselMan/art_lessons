// (#494) The four full-screen-quad blits the engine resamples layer content
// through, out of PencilEngine — the first step of taking the layer transform,
// selection, paste and fill code (AreaOps) out of it. Each pass is a program,
// its uniforms and its one attribute; nothing here knows about layers, tiles
// or the operation log, only about a source, a destination and a matrix.
//
// Built by the engine's _initGL, and built again by it on a context restore:
// the programs die with the context, so there is nothing here to forget — a
// fresh BlitPasses simply replaces the old one.

import { AREA_MASK_FRAG, AREA_TRANSFORM_FRAG, DISPLAY_VERT, IMAGE_BLIT_FRAG, TRANSFORM_BLIT_FRAG } from './shaders'
import { createProgram, getUniforms } from './utils'
import { toMat3, type Matrix3 } from './matrix'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { WorldRect } from '../buffers/tileMath'

/** (#446) A selection's coverage mask on the GPU, with the world rect it
 *  spans — everything the two mask shaders need to place it. */
export interface MaskTexture {
  tex: WebGLTexture
  rect: WorldRect
}

type Uniforms = Record<string, WebGLUniformLocation | null>

export class BlitPasses {
  private readonly gl: WebGLRenderingContext
  // The full-screen quad every pass here draws — the engine's own, owned and
  // rebuilt by it.
  private readonly screenBuf: WebGLBuffer

  private readonly imageProg: WebGLProgram
  private readonly imageUni: Uniforms
  private readonly imagePosLoc: number
  private readonly transformProg: WebGLProgram
  private readonly transformUni: Uniforms
  private readonly transformPosLoc: number
  // Selection (#446) — the masked transform blit and the one-shader-two-blend-
  // modes mask pass (see AREA_TRANSFORM_FRAG/AREA_MASK_FRAG). Separate
  // programs rather than branches inside the existing transform blit: the
  // whole-layer path runs on every gizmo drag frame of every transform there
  // has ever been, and a mask sampler it never uses has no business in it.
  private readonly areaTransformProg: WebGLProgram
  private readonly areaTransformUni: Uniforms
  private readonly areaTransformPosLoc: number
  private readonly areaMaskProg: WebGLProgram
  private readonly areaMaskUni: Uniforms
  private readonly areaMaskPosLoc: number

  constructor(gl: WebGLRenderingContext, screenBuf: WebGLBuffer) {
    this.gl = gl
    this.screenBuf = screenBuf

    this.imageProg         = createProgram(gl, DISPLAY_VERT, IMAGE_BLIT_FRAG)
    this.transformProg     = createProgram(gl, DISPLAY_VERT, TRANSFORM_BLIT_FRAG)
    this.areaTransformProg = createProgram(gl, DISPLAY_VERT, AREA_TRANSFORM_FRAG)
    this.areaMaskProg      = createProgram(gl, DISPLAY_VERT, AREA_MASK_FRAG)

    this.imageUni = getUniforms(gl, this.imageProg, ['u_image', 'u_bufferSize', 'u_imageRect'])
    this.transformUni = getUniforms(gl, this.transformProg, ['u_source', 'u_dstSize', 'u_srcSize', 'u_matrixInv'])
    this.areaTransformUni = getUniforms(gl, this.areaTransformProg, [
      'u_source', 'u_mask', 'u_dstSize', 'u_srcSize', 'u_srcOrigin', 'u_maskRect', 'u_matrixInv',
    ])
    this.areaMaskUni = getUniforms(gl, this.areaMaskProg, ['u_mask', 'u_dstSize', 'u_dstOrigin', 'u_maskRect'])

    this.imagePosLoc         = gl.getAttribLocation(this.imageProg, 'a_position')
    this.transformPosLoc     = gl.getAttribLocation(this.transformProg, 'a_position')
    this.areaTransformPosLoc = gl.getAttribLocation(this.areaTransformProg, 'a_position')
    this.areaMaskPosLoc      = gl.getAttribLocation(this.areaMaskProg, 'a_position')
  }

  /** Frees the four programs. Not for a context loss — those names are
   *  already gone with the context, and _initGL simply builds a new one. */
  destroy(): void {
    const { gl } = this
    gl.deleteProgram(this.imageProg)
    gl.deleteProgram(this.transformProg)
    gl.deleteProgram(this.areaTransformProg)
    gl.deleteProgram(this.areaMaskProg)
  }

  /** One IMAGE_BLIT_FRAG draw: a decoded, straight-alpha `texture` into the
   *  buffer currently bound for drawing (`bufferW x bufferH`), placed at
   *  (x, y, w, h) buffer-local and premultiplied on the way in. The caller
   *  brackets it with the target's beginDraw/endDraw — both callers (the
   *  engine's image import and AreaOps' paste) draw into a buffer they already
   *  hold open. */
  image(texture: WebGLTexture, bufferW: number, bufferH: number, x: number, y: number, w: number, h: number): void {
    const { gl } = this
    gl.useProgram(this.imageProg)
    const u = this.imageUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_image, 0)
    gl.uniform2f(u.u_bufferSize, bufferW, bufferH)
    gl.uniform4f(u.u_imageRect, x, y, w, h)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf)
    const posLoc = this.imagePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Low-level transform-blit draw call — renders `source` through
   *  `matrixInv` (already inverted: maps destination buffer-local px to
   *  source buffer-local px, both top-down) into `targetFbo` (sized
   *  `dstW x dstH`) — source and destination sizes are independent (#134:
   *  the final rotate blit reads the padded, bigger _assemblyFBO and writes
   *  the real, smaller canvas-sized target; every other caller happens to
   *  use matching sizes, which this reduces to exactly as before).
   *
   *  Never plain-replaces: every caller's target is either freshly cleared
   *  (transparent) before its first draw here, or already holds content this
   *  draw belongs on top of. Which of the two blends applies is the `blend`
   *  argument, and the distinction is not cosmetic —
   *
   *  - 'over' (ONE, ONE_MINUS_SRC_ALPHA), the default: one source, drawn onto
   *    whatever is already there. The image/paste blit (`_drawImageThroughMatrix`)
   *    genuinely lands on existing layer content; the world-aligned patch
   *    copies (`_copyArea`, `_composeAreaFillPatch`) and the export rotate
   *    (`_finishInfiniteComposite`) draw disjoint regions onto a cleared
   *    target, where the two blends agree anyway.
   *  - 'add' (ONE, ONE): several *source tiles of one layer* stitched into
   *    one destination tile — the live gizmo preview (`previewLayerTransform`)
   *    and the bake (`_bakeTransform`). Their contributions are disjoint
   *    except in the half-texel band along each source-tile boundary, where
   *    each pass carries its own share of one bilinear kernel (see
   *    TILE_BILINEAR in shaders.ts) and the shares have to sum to one. "Over"
   *    would scale the second pass down by the first's coverage and lose part
   *    of it, which is exactly the seam #507 was.
   *
   *  Every caller targets a buffer another pass reads from afterwards — since
   *  #301 the frame's last drawing step is _composePaperToScreen, which writes
   *  the screen through its own program rather than this one. */
  transform(
    source: AccumulationBuffer, matrixInv: Matrix3,
    dstW: number, dstH: number, targetFbo: WebGLFramebuffer | null,
    blend: 'over' | 'add' = 'over',
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, dstW, dstH)
    gl.enable(gl.BLEND)
    if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.transformProg)
    const tu = this.transformUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf)
    const posLoc = this.transformPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    // (#507) The shader does its own bilinear from exact texel centres — the
    // sampler must not interpolate underneath it, and must not be left on a
    // mip filter by an earlier composite. See setPointSampling.
    source.setPointSampling(true)
    gl.bindTexture(gl.TEXTURE_2D, source.texture)
    gl.uniform1i(tu.u_source, 0)
    gl.uniform2f(tu.u_dstSize, dstW, dstH)
    gl.uniform2f(tu.u_srcSize, source.width, source.height)
    gl.uniformMatrix3fv(tu.u_matrixInv, false, toMat3(matrixInv))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    source.setPointSampling(false)

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** One AREA_MASK_FRAG pass over a whole buffer — see that shader's comment
   *  for why the two modes are one program: 'erase' punches the selection out
   *  (`dst *= 1 - coverage`), 'keep' throws away everything outside it
   *  (`dst *= coverage`). `originX/originY` is the target's world origin, so
   *  the caller never has to translate the mask. */
  areaMask(
    target: AccumulationBuffer, originX: number, originY: number, mask: MaskTexture, mode: 'erase' | 'keep',
  ): void {
    const { gl } = this
    if (mode === 'erase') target.beginErase()
    else target.beginKeepDraw()
    gl.useProgram(this.areaMaskProg)
    const u = this.areaMaskUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mask.tex)
    gl.uniform1i(u.u_mask, 0)
    gl.uniform2f(u.u_dstSize, target.width, target.height)
    gl.uniform2f(u.u_dstOrigin, originX, originY)
    gl.uniform4f(
      u.u_maskRect, mask.rect.minX, mask.rect.minY,
      mask.rect.maxX - mask.rect.minX, mask.rect.maxY - mask.rect.minY,
    )
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf)
    gl.enableVertexAttribArray(this.areaMaskPosLoc)
    gl.vertexAttribPointer(this.areaMaskPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** The masked twin of `transform`: draws one source tile's *selected*
   *  pixels through `matrixInv` into `targetFbo`.
   *
   *  `blend` carries the same meaning as `transform`'s (read it there):
   *  'over' lands the piece on a destination that already holds the part of
   *  the layer that isn't moving, and is only correct when this is the single
   *  source tile; 'add' sums several source tiles' shares of one bilinear
   *  kernel into a transparent buffer of their own, which _composeAreaTiles
   *  then composites over the tile in one go (#507). */
  areaTransform(
    source: AccumulationBuffer, srcOriginX: number, srcOriginY: number, matrixInv: Matrix3, mask: MaskTexture,
    dstW: number, dstH: number, targetFbo: WebGLFramebuffer, blend: 'over' | 'add',
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, dstW, dstH)
    gl.enable(gl.BLEND)
    if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.areaTransformProg)
    const u = this.areaTransformUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf)
    gl.enableVertexAttribArray(this.areaTransformPosLoc)
    gl.vertexAttribPointer(this.areaTransformPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    // (#507) Same reason as `transform`'s: the shader filters by hand
    // from exact texel centres. See setPointSampling.
    source.setPointSampling(true)
    gl.bindTexture(gl.TEXTURE_2D, source.texture)
    gl.uniform1i(u.u_source, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, mask.tex)
    gl.uniform1i(u.u_mask, 1)
    gl.activeTexture(gl.TEXTURE0)

    gl.uniform2f(u.u_dstSize, dstW, dstH)
    gl.uniform2f(u.u_srcSize, source.width, source.height)
    gl.uniform2f(u.u_srcOrigin, srcOriginX, srcOriginY)
    gl.uniform4f(
      u.u_maskRect, mask.rect.minX, mask.rect.minY,
      mask.rect.maxX - mask.rect.minX, mask.rect.maxY - mask.rect.minY,
    )
    gl.uniformMatrix3fv(u.u_matrixInv, false, toMat3(matrixInv))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    source.setPointSampling(false)

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
}

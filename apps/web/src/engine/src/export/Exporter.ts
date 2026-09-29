// (#494) Export and the room thumbnail, out of PencilEngine (seam С21 of the
// survey): the "whole drawing" composite at 1 world unit = 1 pixel, the two
// passes that finish it (transparent, or through the engine's paper compose),
// and bakePreview's GPU downscale chain.
//
// It never sees the engine, only ExporterContext below. What made this seam
// honest is CameraFrame (src/raster/cameraFrame.ts): the export composes the
// same layers through the same tile draw as the screen, just into its own
// target at its own exactFrame — it used to get there by overwriting the
// engine's live camera and composite centre/scale and restoring them after.
//
// No DOM here: encoding pixels into an image Blob and grabbing the on-screen
// canvas both need `document`/`toBlob`, so they arrive as context functions.
// The two programs die with the GL context and are rebuilt by initGL (the
// engine's _initGL runs it at construction and on a restore); every buffer
// this allocates lives for one call, so there is no forget().

import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { exactFrame, type CameraFrame } from '../raster/cameraFrame'
import { previewDownscaleChain } from '../raster/previewChain'
import { DISPLAY_TRANSPARENT_FRAG, DISPLAY_VERT, DOWNSAMPLE_FRAG } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'

/** A world-space rect: the sheet, or a drawing's content bounds. */
export interface ExportRect {
  x: number
  y: number
  width: number
  height: number
}

/** What Exporter may ask of the engine. */
export interface ExporterContext {
  readonly gl: WebGLRenderingContext
  /** Whether the room has no sheet — decides what "the whole drawing" is:
   *  the sheet, or the content bounds. Fixed at construction. */
  readonly infinite: boolean
  /** DISPLAY_VERT's -1..1 full-screen quad — rebuilt by _initGL on a
   *  context restore, hence a function. */
  screenBuf(): WebGLBuffer
  /** The sheet's size — see the engine's _pageSize. */
  pageSize(): { w: number; h: number }
  /** Every layer that takes part in the on-screen composite right now, in
   *  order — _compositeOrder, not the display order: the display filter
   *  (#557) is a view of the screen, not of the drawing. */
  compositeOrder(): ReadonlyArray<{ id: string; opacity: number }>
  /** A layer's painted world rect, integer — see getContentBounds. */
  contentBounds(id: string): ExportRect | null
  /** The engine's _drawCompositeItem: one layer's tiles (or its live
   *  preview) into `targetFbo` through `frame`. */
  drawLayer(frame: CameraFrame, id: string, opacity: number, targetFbo: WebGLFramebuffer, w: number, h: number): void
  /** PAPER_COMPOSE_FRAG from `sourceTex` into `targetFbo`, 1:1, with the
   *  paper sampled from world `origin` — the same shader the screen pass
   *  uses, which is what keeps export and screen from drifting (#301). It
   *  stays with the engine because the paper texture and the program are the
   *  screen's too. */
  composePaper(sourceTex: WebGLTexture, targetFbo: WebGLFramebuffer, w: number, h: number, origin: { x: number; y: number }): void
  /** Composites the live view into _compositeFBO (rotated, canvas-sized) and
   *  returns its texture — the empty-drawing transparent fallback's source. */
  composeScreen(): WebGLTexture
  /** Shows the normal paper view now. */
  display(): void
  /** The visible canvas's pixel size. */
  canvasSize(): { w: number; h: number }
  /** The live camera's world point — the centre of the view a blank
   *  thumbnail falls back to. */
  cameraCenter(): { wx: number; wy: number }
  /** `canvas.toBlob(png)` of the visible canvas. */
  canvasBlob(): Promise<Blob | null>
  /** Bottom-up RGBA8 readback -> image Blob; see the engine's _pixelsToBlob. */
  encode(pixels: Uint8Array, w: number, h: number, type?: string, quality?: number): Promise<Blob | null>
}

// #145: hard clamp (per axis) on the "whole drawing" render target — a fixed
// constant rather than a live gl.MAX_TEXTURE_SIZE query. Every real device
// this app targets supports textures far bigger than this already; a drawing
// that legitimately spans more than ~8 tiles across in one axis (TILE_SIZE is
// 1024) is the one case this clips to a smaller rect, anchored at the content
// bounds' own top-left, rather than exporting in full — a known,
// deliberately-accepted limitation, not attempted here.
export const MAX_EXPORT_DIMENSION_PX = 8192

type Uniforms = Record<string, WebGLUniformLocation | null>

export class Exporter {
  private readonly gl: WebGLRenderingContext
  private readonly ctx: ExporterContext

  // (#15) Un-premultiplies the composite and writes coverage as alpha.
  private transparentProg!: WebGLProgram
  private transparentUni: Uniforms = {}
  private transparentPosLoc = -1
  // (#595) bakePreview's 2x box-downscale step — see DOWNSAMPLE_FRAG.
  private downsampleProg!: WebGLProgram
  private downsampleUni: Uniforms = {}
  private downsamplePosLoc = -1

  constructor(ctx: ExporterContext) {
    this.ctx = ctx
    this.gl = ctx.gl
  }

  /** Builds both programs — from the engine's _initGL, at construction and
   *  again on every context restore (the old names died with the context). */
  initGL(): void {
    const { gl } = this
    this.transparentProg = createProgram(gl, DISPLAY_VERT, DISPLAY_TRANSPARENT_FRAG)
    this.transparentUni = getUniforms(gl, this.transparentProg, ['u_accumulation'])
    this.transparentPosLoc = gl.getAttribLocation(this.transparentProg, 'a_position')
    this.downsampleProg = createProgram(gl, DISPLAY_VERT, DOWNSAMPLE_FRAG)
    this.downsampleUni = getUniforms(gl, this.downsampleProg, ['u_src', 'u_tapOffset'])
    this.downsamplePosLoc = gl.getAttribLocation(this.downsampleProg, 'a_position')
  }

  destroy(): void {
    this.gl.deleteProgram(this.transparentProg)
    this.gl.deleteProgram(this.downsampleProg)
  }

  /** PencilEngineAPI.exportPNG, after the paper has loaded.
   *
   *  (#470) Both kinds of room render offscreen. A bounded room used to
   *  export by calling _display() and grabbing canvas.toBlob(), which was
   *  exact only because its canvas *was* the sheet at 1:1; the canvas is the
   *  viewport now, so that would export whatever happened to be on screen, at
   *  whatever zoom, with the desk around it. The sheet's own rect through
   *  the offscreen path gives back exactly the old image.
   *
   *  (#145) An infinite room has no sheet, and "the current camera viewport"
   *  is no more useful for an infinite canvas than a screenshot. It exports
   *  the tightest rect containing every layer's painted content instead, at
   *  exactly 1 world unit = 1 pixel — "give me my whole drawing", with no
   *  judgment call about how much blank margin to include.
   *
   *  Renders through an *offscreen* framebuffer sized to that rect rather
   *  than resizing the real canvas to match (which would briefly glitch the
   *  live view, or race a ResizeObserver-driven resizeCanvas()) — readPixels
   *  reads whichever framebuffer is bound — so the visible frame is never
   *  disturbed and there is nothing to restore afterwards. */
  exportPNG(transparent: boolean): Promise<Blob | null> {
    const composite = this.buildContentComposite(this.ctx.infinite ? null : this.sheetRect())
    if (!composite) {
      // Nothing painted on any layer — no content rect to speak of. Falls
      // back to the plain camera-viewport export (blank paper, or fully
      // transparent either way) rather than producing a 0x0 image; this is
      // the one case where "export the current view" and "export the whole
      // drawing" agree — there's no drawing either way.
      //
      // canvas.toBlob() snapshots the drawing buffer synchronously at call
      // time (the encoding is async, the pixels are fixed), which is what
      // makes it safe to put the normal paper view back straight after it,
      // without waiting for the callback.
      if (transparent) {
        const { w, h } = this.ctx.canvasSize()
        this.renderTransparentInto(this.ctx.composeScreen(), null, w, h)
      } else {
        this.ctx.display()
      }
      const blob = this.ctx.canvasBlob()
      if (transparent) this.ctx.display()
      return blob
    }

    const { bounds, buffer } = composite
    const { gl } = this
    const { width: w, height: h } = buffer

    const out = new AccumulationBuffer(gl, w, h)
    if (transparent) this.renderTransparentInto(buffer.texture, out.fbo, w, h)
    else this.ctx.composePaper(buffer.texture, out.fbo, w, h, bounds)

    const pixels = out.readPixels()
    buffer.destroy()
    out.destroy()

    return this.ctx.encode(pixels, w, h)
  }

  /** PencilEngineAPI.bakePreview, after the paper has loaded and with a live
   *  context. ADR 015 §5 for why it exists.
   *
   *  The old thumbnail path went exportPNG() -> decode -> 2D-canvas shrink ->
   *  re-encode: a full-sheet readPixels (8.7 MB on A4) plus two PNG encodes
   *  and a decode, all on the main thread of the device that is drawing.
   *  Here the only full-size work is the GPU composite exportPNG already
   *  does; the shrink is a chain of 2x box steps on the GPU
   *  (previewDownscaleChain + DOWNSAMPLE_FRAG), and readPixels touches at
   *  most maxSide x maxSide pixels.
   *
   *  Frame: identical to exportPNG — the bounded room's whole sheet, or an
   *  infinite room's content bounds. An infinite room with nothing drawn has
   *  no content bounds; exportPNG falls back to the on-screen view there, and
   *  this falls back to blank paper of the viewport's size, which is the same
   *  picture without touching the visible canvas. */
  bakePreview(maxSide: number): Promise<Blob | null> {
    const rect = this.ctx.infinite ? (this.allContentBounds() ?? this.viewRect()) : this.sheetRect()
    const composite = this.buildContentComposite(rect)
    if (!composite) return Promise.resolve(null)

    const { bounds, buffer } = composite
    const { gl } = this
    const { width: w, height: h } = buffer
    let current = new AccumulationBuffer(gl, w, h)
    this.ctx.composePaper(buffer.texture, current.fbo, w, h, bounds)
    buffer.destroy()

    for (const step of previewDownscaleChain(w, h, Math.max(1, Math.floor(maxSide)))) {
      const next = new AccumulationBuffer(gl, step.width, step.height)
      this.renderDownsampleInto(current.texture, next.fbo, step.width, step.height)
      current.destroy()
      current = next
    }

    const pixels = current.readPixels()
    const { width: pw, height: ph } = current
    current.destroy()
    return this.ctx.encode(pixels, pw, ph, 'image/webp', 0.8)
  }

  /** Builds one unblended (premultiplied-color/coverage-alpha — exactly the
   *  on-screen composite's own convention, see the engine's _composeToFBO)
   *  accumulation buffer covering every layer's ENTIRE resident content in
   *  `rect`, through its own fixed exactFrame (zoom 1, angle 0) rather than
   *  the live camera's.
   *
   *  (#470) An explicit rect is the bounded room's sheet — exported whole,
   *  blank margins and all, because the sheet's own edges are part of the
   *  picture there. Without one (an infinite room) the drawing's content
   *  bounds are the only rect that means anything.
   *
   *  Reuses the engine's _drawCompositeItem/_drawTileComposite unmodified
   *  rather than a second rendering path to keep in sync: a frame whose view
   *  exactly encloses the target makes resolveVisible() return every resident
   *  tile anyway, and the tile draw reads only the frame and the target it is
   *  given. Content bounds are integers (see getContentBounds), so every tile
   *  origin lands on an exact pixel with zero rounding — no seam risk the way
   *  a fractional-zoom on-screen camera has.
   *
   *  Clamped to MAX_EXPORT_DIMENSION_PX per axis. Caller owns the returned
   *  buffer (destroy() once read). Null if every layer is empty. Public for
   *  the engine tests, which assert on these raw pixels: MockGL never
   *  rasterizes the paper/transparent passes, and encoding needs a DOM. */
  buildContentComposite(rect: ExportRect | null = null): { bounds: ExportRect; buffer: AccumulationBuffer } | null {
    const raw = rect ?? this.allContentBounds()
    if (!raw) return null

    const width  = Math.min(Math.ceil(raw.width),  MAX_EXPORT_DIMENSION_PX)
    const height = Math.min(Math.ceil(raw.height), MAX_EXPORT_DIMENSION_PX)
    const bounds = { x: raw.x, y: raw.y, width, height }

    const buffer = new AccumulationBuffer(this.gl, width, height)
    buffer.clear()

    const frame = exactFrame(bounds)
    for (const { id, opacity } of this.ctx.compositeOrder()) {
      this.ctx.drawLayer(frame, id, opacity, buffer.fbo, width, height)
    }

    return { bounds, buffer }
  }

  private sheetRect(): ExportRect {
    const { w, h } = this.ctx.pageSize()
    return { x: 0, y: 0, width: w, height: h }
  }

  /** The live view's world rect at 1:1 — a blank infinite room's thumbnail. */
  private viewRect(): ExportRect {
    const { wx, wy } = this.ctx.cameraCenter()
    const { w, h } = this.ctx.canvasSize()
    return { x: wx - w / 2, y: wy - h / 2, width: Math.max(1, w), height: Math.max(1, h) }
  }

  /** Union of getContentBounds() across every layer in the composite order
   *  — the same set the screen draws (a hidden layer's content is no more
   *  "part of the drawing" here than it is on screen). Null if every one of
   *  them is empty, or there are no layers at all. */
  private allContentBounds(): ExportRect | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const { id } of this.ctx.compositeOrder()) {
      const b = this.ctx.contentBounds(id)
      if (!b) continue
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    }
    if (maxX <= minX) return null
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  /** (#15/#145) DISPLAY_TRANSPARENT_FRAG from `sourceTex` into `targetFbo`
   *  (null: the visible canvas): un-premultiplies the stored color and
   *  writes coverage straight through as alpha, so untouched canvas is
   *  transparent rather than opaque paper. */
  private renderTransparentInto(sourceTex: WebGLTexture, targetFbo: WebGLFramebuffer | null, w: number, h: number): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this.transparentProg)
    const u = this.transparentUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(u.u_accumulation, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const posLoc = this.transparentPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** (#595) One step of bakePreview's downscale chain: `sourceTex` shrunk
   *  into the whole of `targetFbo` (w x h) through DOWNSAMPLE_FRAG. The tap
   *  offset is a quarter of a destination pixel — see the shader's comment for
   *  why that is an exact 2x2 box on a halving step. */
  private renderDownsampleInto(sourceTex: WebGLTexture, targetFbo: WebGLFramebuffer, w: number, h: number): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)
    gl.useProgram(this.downsampleProg)
    const u = this.downsampleUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(u.u_src, 0)
    gl.uniform2f(u.u_tapOffset, 0.25 / w, 0.25 / h)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const posLoc = this.downsamplePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
}

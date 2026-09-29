// (#494) Shapes, out of PencilEngine (half of seam С20′ of the survey): the
// SHAPE_FRAG program, the bake of a `shape` operation into a layer's tiles,
// and the editing session's live float. The geometry — which contour, which
// stroke band — is shapeGeometry.ts' arithmetic; this file is where it meets
// GL and the tile grid.
//
// It never sees the engine, only ShapePassContext below. The program dies
// with the GL context and is rebuilt by initGL (the engine's _initGL runs it
// at construction and again on a restore); nothing else here holds a GL name
// across calls — the live float's tiles belong to LayerPreviews, which
// forgets them itself — so there is no forget().

import type { ShapeFill, ShapeFrame, ShapeGeometry, ShapeOperation, ShapeStroke } from '@grafetto/shared'
import { shapeWorldBounds } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { tileWorldRect, tilesOverlappingRect, type WorldRect } from '../buffers/tileMath'
import { tileBufferAt, type LayerPreviews, type PreviewTile } from './layerPreviews'
import { DISPLAY_VERT, SHAPE_FRAG } from './shaders'
import { shapeDrawParams, type ShapeDrawParams } from './shapeGeometry'
import { createProgram, getUniforms } from './utils'

/** What ShapePass may ask of the engine. */
export interface ShapePassContext {
  readonly gl: WebGLRenderingContext
  /** Whether the room has no sheet — decides whether a shape is clamped to
   *  one. Fixed at construction, like the room itself. */
  readonly infinite: boolean
  /** The floating previews the composite draws in place of real tiles. */
  readonly previews: LayerPreviews
  /** DISPLAY_VERT's -1..1 full-screen quad — rebuilt by _initGL on a
   *  context restore, hence a function. */
  screenBuf(): WebGLBuffer
  layer(id: string): ILayerBuffer | undefined
  /** The room's tile grid — see the engine's _tileSize. */
  tileSize(): { w: number; h: number }
  /** The sheet's size — see the engine's _pageSize. */
  pageSize(): { w: number; h: number }
  /** `layerId`'s pixels changed outside a stroke — the engine drops its
   *  split-composite cache unless that is the active layer (#122). */
  layerPainted(layerId: string): void
  /** Show the current state now. */
  display(): void
}

type Uniforms = Record<string, WebGLUniformLocation | null>

export class ShapePass {
  private readonly gl: WebGLRenderingContext
  private readonly ctx: ShapePassContext

  // (#527) The shape rasterizer — see SHAPE_FRAG.
  private prog!: WebGLProgram
  private uni: Uniforms = {}
  private posLoc = -1

  constructor(ctx: ShapePassContext) {
    this.ctx = ctx
    this.gl = ctx.gl
  }

  /** Builds the program — from the engine's _initGL, at construction and
   *  again on every context restore (the old name died with the context). */
  initGL(): void {
    const { gl } = this
    this.prog = createProgram(gl, DISPLAY_VERT, SHAPE_FRAG)
    this.uni = getUniforms(gl, this.prog, [
      'u_dstSize', 'u_dstOrigin', 'u_center', 'u_rotCS', 'u_half',
      'u_kind', 'u_base', 'u_outer', 'u_inner', 'u_hasInner', 'u_strokeContours', 'u_band',
      'u_ringRatio', 'u_closePath', 'u_sectorMode', 'u_sectorDir', 'u_sectorCS',
      'u_starPoints', 'u_starRot', 'u_lineDir', 'u_lineHalfLen', 'u_lineCap',
      'u_fillColor', 'u_hasFill', 'u_strokeColor', 'u_hasStroke',
    ])
    this.posLoc = gl.getAttribLocation(this.prog, 'a_position')
  }

  destroy(): void {
    this.gl.deleteProgram(this.prog)
  }

  /** The world rect a shape's pixels can reach, clamped to the sheet in a
   *  bounded room.
   *
   *  The clamp is the same one the engine's `_dabsWorldBounds` applies and for
   *  the same reason: a bounded room's tiles are lazily created, and a shape
   *  whose frame merely touches the page edge would otherwise resolve — and
   *  keep forever — a tile of off-page ground nothing can ever make visible
   *  again. */
  private worldRect(geometry: ShapeGeometry, frame: ShapeFrame, stroke: ShapeStroke | null): WorldRect {
    const b = shapeWorldBounds(geometry, frame, stroke)
    if (this.ctx.infinite) return b
    const { w: pageW, h: pageH } = this.ctx.pageSize()
    return {
      minX: Math.max(b.minX, 0), minY: Math.max(b.minY, 0),
      maxX: Math.min(b.maxX, pageW), maxY: Math.min(b.maxY, pageH),
    }
  }

  /** One SHAPE_FRAG pass over one target buffer, whose world origin is
   *  (originX, originY). The shader turns each pixel into a world position
   *  itself, so a real tile, a scratch tile and a preview tile are all drawn
   *  by the same call with nothing translated by the caller — the pattern
   *  `BlitPasses.areaMask` established. */
  private run(
    target: AccumulationBuffer, originX: number, originY: number, params: ShapeDrawParams,
    stroke: ShapeStroke | null, fill: ShapeFill | null,
  ): void {
    const { gl } = this
    target.beginDraw()
    gl.useProgram(this.prog)
    const u = this.uni
    gl.uniform2f(u.u_dstSize, target.width, target.height)
    gl.uniform2f(u.u_dstOrigin, originX, originY)
    gl.uniform2f(u.u_center, params.centerX, params.centerY)
    gl.uniform2f(u.u_rotCS, params.cos, params.sin)
    gl.uniform2f(u.u_half, Math.max(params.halfX, 1e-6), Math.max(params.halfY, 1e-6))
    gl.uniform1i(u.u_kind, params.kind)
    gl.uniform3f(u.u_base, params.base[0], params.base[1], params.base[2])
    gl.uniform3f(u.u_outer, params.outer[0], params.outer[1], params.outer[2])
    gl.uniform3f(u.u_inner, params.inner[0], params.inner[1], params.inner[2])
    gl.uniform1f(u.u_hasInner, params.hasInner ? 1 : 0)
    gl.uniform1f(u.u_strokeContours, params.strokeMode === 'contours' ? 1 : 0)
    gl.uniform2f(u.u_band, params.bandCenter, params.bandHalf)
    gl.uniform1f(u.u_ringRatio, params.ringRatio)
    gl.uniform1f(u.u_closePath, params.closePath ? 1 : 0)
    gl.uniform1f(u.u_sectorMode, params.sectorMode)
    gl.uniform2f(u.u_sectorDir, params.sectorDirX, params.sectorDirY)
    gl.uniform2f(u.u_sectorCS, params.sectorCos, params.sectorSin)
    gl.uniform1f(u.u_starPoints, params.starPoints)
    gl.uniform2f(u.u_starRot, params.starRotCos, params.starRotSin)
    gl.uniform2f(u.u_lineDir, params.lineDirX, params.lineDirY)
    gl.uniform1f(u.u_lineHalfLen, params.lineHalfLen)
    gl.uniform1f(u.u_lineCap, params.lineCap)
    gl.uniform3f(u.u_fillColor, fill ? fill.color[0] : 0, fill ? fill.color[1] : 0, fill ? fill.color[2] : 0)
    gl.uniform1f(u.u_hasFill, fill ? 1 : 0)
    gl.uniform3f(
      u.u_strokeColor, stroke ? stroke.color[0] : 0, stroke ? stroke.color[1] : 0, stroke ? stroke.color[2] : 0,
    )
    gl.uniform1f(u.u_hasStroke, stroke && stroke.width > 0 ? 1 : 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this.posLoc)
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    target.endDraw()
  }

  /** Draws one shape into a layer, touching only the tiles it covers. */
  draw(layerBuf: ILayerBuffer, op: ShapeOperation): void {
    if (!op.stroke && !op.fill) return
    const rect = this.worldRect(op.geometry, op.frame, op.stroke)
    if (!(rect.maxX > rect.minX) || !(rect.maxY > rect.minY)) return
    const params = shapeDrawParams(op.geometry, op.frame, op.stroke)
    for (const { buffer, originX, originY } of layerBuf.resolveForPaint(rect)) {
      this.run(buffer, originX, originY, params, op.stroke, op.fill)
    }
    // (#155 Tier 2) Same as ImageImport's blit: the content bounds have to
    // grow to include what was just painted, or a later transform or export
    // can cut the shape off at the layer's previously-known extent.
    layerBuf.markContentPainted(rect)
    this.ctx.layerPainted(op.layerId)
  }

  /** See PencilEngineAPI.previewShape. The editing session's live preview: the
   *  shape drawn over the layer's own content into scratch tiles, exactly the
   *  way `AreaOps.previewAreaPaste` floats a pasted raster, and cleared by the
   *  same `clearLayerTransformPreview`.
   *
   *  A float rather than an overlay on top of the composite, deliberately: the
   *  shape belongs to a layer, so it has to be hidden by the layers above it
   *  while it is being placed. Drawing it over everything would mean a shape
   *  that jumps behind them at the moment it is confirmed — the preview would
   *  be lying about the one thing it exists to show. */
  preview(
    layerId: string, geometry: ShapeGeometry, frame: ShapeFrame,
    stroke: ShapeStroke | null, fill: ShapeFill | null,
  ): void {
    const { previews } = this.ctx
    const layerBuf = this.ctx.layer(layerId)
    const oldByOrigin = new Map(
      (previews.tiles.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
    )
    const drop = (): void => {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      previews.tiles.delete(layerId)
      previews.areaLayers.delete(layerId)
      this.ctx.display()
    }
    if (!layerBuf || (!stroke && !fill)) { drop(); return }

    const rect = this.worldRect(geometry, frame, stroke)
    if (!(rect.maxX > rect.minX) || !(rect.maxY > rect.minY)
      || !Number.isFinite(rect.minX + rect.minY + rect.maxX + rect.maxY)) { drop(); return }

    const params = shapeDrawParams(geometry, frame, stroke)
    const { w: tw, h: th } = this.ctx.tileSize()
    const tiles: PreviewTile[] = []
    const reused = new Set<string>()
    for (const { tileX, tileY } of tilesOverlappingRect(rect, tw, th)) {
      const tileRect = tileWorldRect(tileX, tileY, tw, th)
      const key = `${tileRect.minX},${tileRect.minY}`
      const old = oldByOrigin.get(key)
      const scratch = old ? old.buffer : new AccumulationBuffer(this.gl, tw, th)
      if (old) reused.add(key)
      const existing = tileBufferAt(layerBuf, tileRect)
      if (existing) existing.copyTo(scratch)
      else scratch.clear()
      this.run(scratch, tileRect.minX, tileRect.minY, params, stroke, fill)
      tiles.push(old ?? { originX: tileRect.minX, originY: tileRect.minY, buffer: scratch })
    }
    for (const [key, t] of oldByOrigin) {
      if (!reused.has(key)) t.buffer.destroy()
    }

    previews.tiles.set(layerId, tiles)
    previews.areaLayers.add(layerId)
    this.ctx.display()
  }
}

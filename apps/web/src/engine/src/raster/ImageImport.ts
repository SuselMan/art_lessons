// (#494) Reference-image import, out of PencilEngine (seam С16 of the
// survey): the decoded-image cache, the preload the replay paths run ahead of
// a room's log, and the blit that lands a straight-alpha raster in a layer's
// tiles. `image_import` uses it directly; `area_paste` and `area_fill` reach
// it dressed as an import (AreaOps' asImportRecord).
//
// It never sees the engine, only ImageImportContext below. The one browser
// object involved — the `Image` a data URL is decoded through — stays in the
// engine and comes in as `decode`; what lives here only ever holds the
// decoded element and hands it to texImage2D. Why the engine's settle of a
// late decode (_settleLateImage) is not here: it is a question about the
// operation log and a layer rebuild, not about pixels.
//
// Nothing here survives a context loss that needs forgetting: the cache holds
// decoded elements, not GL names, and every texture is created and deleted
// inside one blit.

import type { ImageImportOperation, LayerTransformMatrix, Operation } from '@grafetto/shared'
import { toHomography } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import type { BlitPasses } from './blitPasses'
import { applyMatrix, type Matrix3 } from './matrix'

/** What ImageImport may ask of the engine. */
export interface ImageImportContext {
  readonly gl: WebGLRenderingContext
  /** A function, not a value: _initGL builds a fresh BlitPasses on every
   *  context restore, and ImageImport outlives it. */
  passes(): BlitPasses
  /** Decodes a data URL into an element texImage2D accepts, calling back
   *  `onload` or `onerror` — the engine's, because it is the one place a DOM
   *  `Image` is constructed. Callbacks rather than a promise so the decode
   *  resolves on exactly the tick it did before this moved: the replay tests
   *  of #398 are about what lands before what. */
  decode(src: string, onload: (img: HTMLImageElement) => void, onerror: () => void): void
  /** A raster moved by a paste's gizmo, drawn through its matrix into one
   *  tile — AreaOps.drawImageThroughMatrix. */
  drawThroughMatrix(
    target: AccumulationBuffer, originX: number, originY: number,
    img: HTMLImageElement, rect: { x: number; y: number; width: number; height: number }, matrix: Matrix3,
  ): void
  /** The sheet's size — see the engine's _pageSize. */
  pageSize(): { w: number; h: number }
  /** `layerId`'s pixels changed outside a stroke — the engine drops its
   *  split-composite cache unless that is the active layer (#122). */
  layerPainted(layerId: string): void
  /** Show the current state now. */
  display(): void
  /** Show it unless a suspendDisplay span is open. */
  displayIfNotSuspended(): void
}

export class ImageImport {
  private readonly ctx: ImageImportContext

  // Reference-image import (#88) — keyed by the op's own data URL, so
  // replaying the same room twice (e.g. undo/redo rebuilding a layer) never
  // redecodes an image it's already decoded once this session.
  private readonly cache = new Map<string, HTMLImageElement>()

  constructor(ctx: ImageImportContext) {
    this.ctx = ctx
  }

  /** A decoded image, if this session has decoded `src` already. */
  cached(src: string): HTMLImageElement | undefined {
    return this.cache.get(src)
  }

  private load(src: string): Promise<HTMLImageElement> {
    const cached = this.cache.get(src)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      this.ctx.decode(
        src,
        img => { this.cache.set(src, img); resolve(img) },
        () => reject(new Error('failed to decode imported image')),
      )
    })
  }

  /** See PencilEngineAPI.preloadImage. */
  async preloadImage(src: string): Promise<void> {
    await this.load(src).catch(
      // Same reasoning as preloadImages': a raster that will not decode is not
      // a reason to throw at the caller, it is a float that draws nothing.
      err => { console.error('failed to decode pasted image', err) },
    )
  }

  /** See PencilEngineAPI.preloadImages. */
  async preloadImages(ops: Operation[]): Promise<void> {
    const sources = new Set<string>()
    // (#446) `area_paste` carries a raster for the same reason image_import
    // does, so it must be decoded ahead of a replay for the same reason too —
    // an operation painted after its own async decode lands on top of
    // whatever was drawn in the meantime.
    for (const op of ops) {
      if (op.type === 'image_import' || op.type === 'area_paste' || op.type === 'area_fill') sources.add(op.image)
    }
    if (sources.size === 0) return
    await Promise.all([...sources].map(src => this.load(src).catch(
      // Deliberately not rethrown: this is a preparation step for a replay,
      // and an image that cannot be decoded is not a reason to abandon
      // everything else the room drew. The operation itself falls through to
      // the async path and fails there exactly as it did before.
      err => { console.error('failed to decode imported image', err) },
    )))
  }

  /** (#398) Paints `op` immediately if its image is already decoded, leaving
   *  the pixels in `buf` by the time this returns — which is what lets a
   *  replay apply the operations that follow it against the content they
   *  were recorded against. False means nothing was painted and the caller
   *  must fall back to the async path. */
  paintDecoded(buf: ILayerBuffer, op: ImageImportOperation, matrix?: LayerTransformMatrix): boolean {
    const img = this.cache.get(op.image)
    if (!img) return false
    this.blit(buf, op, img, matrix)
    this.ctx.displayIfNotSuspended()
    return true
  }

  /** Paints a reference image into `buf`, fit-centered ("contain") so the
   *  whole image stays visible, letterboxed if its aspect ratio doesn't
   *  match the canvas's. The decode is the only asynchronous step, and it is
   *  the reason `preloadImages` exists: with the image already in the cache,
   *  callers reach `paintDecoded` above directly and this operation lands
   *  synchronously like every other pixel op. This is what remains for the
   *  cases where it cannot — a genuinely new import (local, or a peer's
   *  arriving live), where nothing had a chance to decode it in advance. The
   *  engine settles the late landing afterwards (_settleLateImage). */
  async paint(layerBuf: ILayerBuffer, op: ImageImportOperation, matrix?: LayerTransformMatrix): Promise<void> {
    const img = await this.load(op.image)
    this.blit(layerBuf, op, img, matrix)
    // Unconditional, unlike paintDecoded's: whatever suspendDisplay span was
    // open when this operation was applied is long closed by the time a
    // decode resolves, so there is nothing left to repaint later.
    this.ctx.display()
  }

  private blit(
    layerBuf: ILayerBuffer, op: ImageImportOperation, img: HTMLImageElement,
    // (#446) Where the raster was moved to before it was dropped — see
    // AreaPasteOperation.matrix. Absent (every image_import, and a paste
    // dropped where it landed) takes the plain axis-aligned path below,
    // byte-for-byte as before.
    wireMatrix?: LayerTransformMatrix,
  ): void {
    const { gl } = this.ctx

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Fixed-canvas rooms (op.x/op.y absent): unchanged fit-center-within-
    // the-canvas behavior. Infinite-canvas rooms (op.x/op.y present, world-
    // space top-left — see the shared type's doc comment): natural size,
    // placed wherever the caller chose (current camera center at import
    // time, today) — there's no fixed rect to fit-center within.
    let drawX: number, drawY: number, drawW: number, drawH: number
    if (op.x !== undefined && op.y !== undefined) {
      drawX = op.x; drawY = op.y; drawW = op.width; drawH = op.height
    } else {
      // (#470) Fit-centred within the sheet, which is what this always meant
      // — it read the canvas only because the canvas was the sheet.
      const { w: pageW, h: pageH } = this.ctx.pageSize()
      const scale = Math.min(pageW / op.width, pageH / op.height)
      drawW = op.width * scale
      drawH = op.height * scale
      drawX = (pageW - drawW) / 2
      drawY = (pageH - drawH) / 2
    }

    if (wireMatrix) {
      const matrix = toHomography(wireMatrix)
      const rect = { x: drawX, y: drawY, width: drawW, height: drawH }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [cx, cy] of [
        [drawX, drawY], [drawX + drawW, drawY], [drawX, drawY + drawH], [drawX + drawW, drawY + drawH],
      ] as Array<[number, number]>) {
        const [tx, ty] = applyMatrix(matrix, cx, cy)
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
      }
      if (Number.isFinite(minX + minY + maxX + maxY) && maxX > minX && maxY > minY) {
        const moved: WorldRect = { minX, minY, maxX, maxY }
        for (const { buffer, originX, originY } of layerBuf.resolveForPaint(moved)) {
          this.ctx.drawThroughMatrix(buffer, originX, originY, img, rect, matrix)
        }
        layerBuf.markContentPainted(moved)
      }
      gl.deleteTexture(texture)
      this.ctx.layerPainted(op.layerId)
      return
    }

    const worldRect: WorldRect = { minX: drawX, minY: drawY, maxX: drawX + drawW, maxY: drawY + drawH }
    const passes = this.ctx.passes()
    for (const { buffer, originX, originY } of layerBuf.resolveForPaint(worldRect)) {
      buffer.beginDraw()
      passes.image(texture, buffer.width, buffer.height, drawX - originX, drawY - originY, drawW, drawH)
      buffer.endDraw()
    }
    // (#155 Tier 2) See the engine's _paintDabs' identical call for why.
    layerBuf.markContentPainted(worldRect)

    gl.deleteTexture(texture)
    // #122: single choke point for both callers (appendOperation's live
    // path and _applyPixelOp's replay path) — an image_import can target
    // any layer, so only invalidate when it isn't the active one.
    this.ctx.layerPainted(op.layerId)
  }
}

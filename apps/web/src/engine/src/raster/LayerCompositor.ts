// Layer composition and split-cache invalidation. GPU buffers remain owned by
// the engine and are read through the context after resize/context restore.
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { coarseFactorFor } from '../buffers/tileMath'
import { frameEdgeX, frameEdgeY, type CameraFrame } from './cameraFrame'
import type { LayerPreviews } from './layerPreviews'
import { DISPLAY_VERT, LAYER_COMPOSITE_FRAG } from './shaders'
import { createProgram, getUniforms } from './utils'


export interface CompositeItem {
  id: string
  opacity: number
}

/** One layer tile whose wash just settled (see _revealWash). `before` is a
 *  pooled copy of what the tile showed at that moment; the composite mixes it
 *  back over the tile's real pixels by a hold that runs 1 → 0. */
export interface WashReveal {
  layerId: string
  before: AccumulationBuffer
  /** null while the canonical dry target is still being computed. */
  startedAt: number | null
  /** Intermediate target; only presentation buffers read this. */
  pending?: AccumulationBuffer
  progressive?: boolean
  frameAt?: number
  durationMs?: number
  /** Display-only standing-water/coverage snapshot, never a paint input. */
  wetMask?: AccumulationBuffer
  motionAt?: number
  motionBaseGain?: number
  motionOrigin?: [number, number]
}

export interface LayerCompositorContext {
  readonly gl: WebGLRenderingContext
  screenBuf(): WebGLBuffer
  layers(): ReadonlyMap<string, ILayerBuffer>
  previews(): LayerPreviews
  reveals(): ReadonlyMap<AccumulationBuffer, WashReveal>
  drawReveal(frame: CameraFrame, reveal: WashReveal, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number, opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number, minifying: boolean): void
  activeId(): string | null
  assembly(): AccumulationBuffer
  below(): AccumulationBuffer
  above(): AccumulationBuffer
}

export class LayerCompositor {
  private readonly ctx: LayerCompositorContext
  private _compositeProg!: WebGLProgram
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _compositePosLoc!: number
  private _splitCacheDirty = true
  constructor(ctx: LayerCompositorContext) { this.ctx = ctx }
  // Separate stages keep the engine's existing GL initialization order.
  initProgram(): void { this._compositeProg = createProgram(this.ctx.gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG) }
  initUniforms(): void { this._compositeUni = getUniforms(this.ctx.gl, this._compositeProg, ['u_layer', 'u_opacity']) }
  initAttributes(): void { this._compositePosLoc = this.ctx.gl.getAttribLocation(this._compositeProg, 'a_position') }

  compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void {
    const { gl } = this.ctx

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, targetW, targetH)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._compositeProg)
    const cu = this._compositeUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const posLoc = this._compositePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const { texture, opacity } of items) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(cu.u_layer, 0)
      gl.uniform1f(cu.u_opacity, opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Marks the below/above split cache (#122 — see the field comment on
   *  _belowCache/_aboveCache) stale. Idempotent and cheap: safe to call from
   *  any site that isn't sure whether it actually needs to. The very next
   *  _runComposite() call rebuilds both halves from current buffer state
   *  before reading either. */
  invalidateSplitCache(): void {
    this._splitCacheDirty = true
  }

  /** Draws one CompositeItem's live content into `targetFbo` — a layer
   *  mid-gizmo-drag (#120) composites its scratch transform-preview tile(s)
   *  instead of its real, untouched buffer (see previewLayerTransform);
   *  otherwise every one of its resident/visible tiles goes through
   *  _drawTileComposite (#136 — this used to special-case BoundedLayerBuffer
   *  with a plain fullscreen-quad blit and just skip TiledLayerBuffer
   *  entirely; a bounded room's fixed identity camera, see the constructor,
   *  makes that plain-blit shortcut and the tile-relative draw produce the
   *  same pixels, so there's no reason to keep both paths). #139: a preview
   *  tile is shaped exactly like a real PaintTarget (own originX/originY,
   *  own size — see PreviewTile), so it goes through the exact same
   *  _drawTileComposite loop as a real tile rather than a separate
   *  fullscreen-blit path — that's what makes a multi-tile preview (an
   *  infinite-canvas layer spanning, or transformed to span, more than one
   *  tile) composite correctly instead of only ever showing one tile's
   *  worth. */
  drawCompositeItem(
    frame: CameraFrame, id: string, opacity: number, targetFbo: WebGLFramebuffer,
    targetW: number, targetH: number,
  ): void {
    const viewRect = frame.view
    // (#365) Whether this pass is shrinking tiles on the way to its target.
    // Only then is a mip chain worth having: at or above 1:1 the base level
    // is already the right size, and generating levels nobody samples would
    // be pure cost on the one path (drawing at 100%) that must stay fast.
    // The export's frame is exactly 1:1 for the same reason — see
    // exactFrame.
    const minifying = frame.scale < 1

    const preview = this.ctx.previews().tiles.get(id)
    // (#446) A selection preview shadows only the tiles it holds — the rest of
    // the layer is standing still and must still be drawn. A whole-layer
    // preview keeps the original behaviour of replacing the layer outright:
    // every pixel of it moved, so there is nothing left to draw underneath.
    const areaPreview = preview ? this.ctx.previews().areaLayers.has(id) : false
    if (preview) {
      for (const { originX, originY, buffer } of preview) {
        buffer.setMipSampling(minifying && buffer.ensureMipmaps())
        this.drawTileComposite(
          frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
        )
      }
      if (!areaPreview) return
    }
    const buf = this.ctx.layers().get(id)
    if (!buf) return

    if (areaPreview) {
      // Deliberately the fine tiles, never resolveCoarse: the coarse pyramid
      // has no idea a preview is shadowing anything, so a zoomed-out frame
      // would draw the pre-drag content of the very tiles being previewed,
      // right on top of the preview. A drag is transient; one frame at fine
      // resolution is the cheaper mistake.
      const shadowed = new Set((preview ?? []).map(t => `${t.originX},${t.originY}`))
      for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
        if (shadowed.has(`${originX},${originY}`)) continue
        buffer.setMipSampling(minifying && buffer.ensureMipmaps())
        this.drawTileComposite(
          frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }

    // (#365) Which pyramid level this frame should draw, or null for the fine
    // tiles — see coarseFactorFor. The level is never more than a factor of
    // two off 1:1, so the visible tile count stays flat (~9-16 per layer)
    // across the whole zoom range instead of spiking just above a single
    // level's threshold, which is what made one specific zoom freeze: the
    // fine tiles it fell back to had been evicted while the coarse level was
    // on screen, and recovering hundreds of them at once costs an Operation
    // Log replay plus a readback and re-upload each.
    const factor = coarseFactorFor(frame.scale)
    const coarse = factor === null ? null : buf.resolveCoarse(viewRect, factor)
    // (#503) `coarse.length`, not just `coarse`: an empty array is truthy, so
    // a level holding nothing here used to end the draw outright — the layer
    // vanished at this zoom and came back on zooming in. That state is
    // unreachable while every write marks its tiles (which is what the rest of
    // #503 is about), so this is a guard, not a fix for a seen bug. It is
    // worth having anyway because of the asymmetry: falling through costs one
    // resolveVisible over a region that by construction holds no tiles, while
    // not falling through costs a layer.
    if (coarse?.length && factor !== null) {
      const { w: coarseW, h: coarseH } = buf.coarseWorldSize(factor)
      for (const { buffer, originX, originY } of coarse) {
        buffer.setMipSampling(false)
        this.drawTileComposite(
          frame, buffer.texture, originX, originY, coarseW, coarseH, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }

    for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
      buffer.setMipSampling(minifying && buffer.ensureMipmaps())
      // (#536, §17.12) A tile still converging on a settled wash draws through
      // the reveal — same rect, same blend, its pixels mixed with the kept
      // picture. The coarse levels above draw plain: at that zoom the motion
      // is under a pixel.
      const reveal = this.ctx.reveals().get(buffer)
      if (reveal) {
        this.ctx.drawReveal(
          frame, reveal, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
          minifying,
        )
        continue
      }
      this.drawTileComposite(
        frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
      )
    }
  }

  /** Rebuilds both cache halves from scratch iff _splitCacheDirty — see the
   *  _belowCache/_aboveCache field comment for what "dirty" tracks. Only
   *  ever called with _previews empty (_runComposite bypasses this
   *  entirely otherwise), so _drawCompositeItem always resolves to a real
   *  layer's own current buffer here, never a scratch preview. */
  private rebuildSplitCacheIfDirty(
    frame: CameraFrame, belowItems: CompositeItem[], aboveItems: CompositeItem[],
    targetW: number, targetH: number,
  ): void {
    if (!this._splitCacheDirty) return
    this.rebuildCacheHalf(frame, this.ctx.below(), belowItems, targetW, targetH)
    this.rebuildCacheHalf(frame, this.ctx.above(), aboveItems, targetW, targetH)
    this._splitCacheDirty = false
  }

  private rebuildCacheHalf(
    frame: CameraFrame, target: AccumulationBuffer, items: CompositeItem[], targetW: number, targetH: number,
  ): void {
    target.clear()
    for (const { id, opacity } of items) this.drawCompositeItem(frame, id, opacity, target.fbo, targetW, targetH)
  }

  /** (#365) Draws one fine tile, shrunk, into its slot of a coarse tile —
   *  the TileDownsampler TiledLayerBuffer is handed so it can keep its coarse
   *  level current without owning a shader.
   *
   *  Positions the slot with gl.viewport for the same reason
   *  _drawTileComposite does (see its comment on the ANGLE/D3D dropout), and
   *  refreshes the source's mip chain first so shrinking 1024 texels into 128
   *  reads filtered levels rather than one texel in sixty-four — without that
   *  the coarse level would be built out of exactly the aliasing it exists to
   *  avoid.
   *
   *  Replaces rather than blends: a slot is one fine tile's whole content,
   *  including its transparency, so blending "over" would keep whatever that
   *  tile used to hold before it was erased. */
  downsampleTileInto(
    source: AccumulationBuffer, dest: AccumulationBuffer,
    x: number, y: number, w: number, h: number,
  ): void {
    const { gl } = this.ctx
    // Always minifying by COARSE_FACTOR here, so this wants filtered levels
    // regardless of what the camera is doing.
    source.setMipSampling(source.ensureMipmaps())

    // A partial screen composite may have a screen-space scissor active.
    // Coarse-cache slots have their own coordinates; folding must replace
    // the whole slot before restoring the caller's clipping state.
    const scissored = gl.isEnabled(gl.SCISSOR_TEST)
    if (scissored) gl.disable(gl.SCISSOR_TEST)

    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo)
    // gl.viewport's y is bottom-up; slot coordinates are top-down like every
    // other buffer-pixel value in this file.
    gl.viewport(x, dest.height - (y + h), w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._compositeProg)
    const u = this._compositeUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const posLoc = this._compositePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, source.texture)
    gl.uniform1i(u.u_layer, 0)
    gl.uniform1f(u.u_opacity, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    // Left on a plain filter: the fold runs on every write, at every zoom,
    // so leaving mip sampling on here would quietly make the 1:1 on-screen
    // composite trilinear too — where it is meant to be an exact texel copy.
    source.setMipSampling(false)

    if (scissored) gl.enable(gl.SCISSOR_TEST)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Infinite canvas (#133 Phase 1) — draws one tile's texture into
   *  `targetFbo` at its camera-relative screen position, blended over
   *  whatever's already there (same (ONE, ONE_MINUS_SRC_ALPHA) "over" every
   *  other composite pass in this file uses) — the tile-aware counterpart
   *  to _compositeTextures' fullscreen-quad draw.
   *
   *  Positions the tile via gl.viewport() instead of a per-tile clip-space
   *  computation in a shader — deliberately, and not for simplicity: an
   *  earlier version computed each tile's destination quad and/or source-UV
   *  sub-rect in the shader (a uniform mat3, a dynamically-reuploaded vertex
   *  buffer, even a compile-time constant — every variant tried), and
   *  reproducibly sampled as fully transparent black on a real ANGLE/D3D
   *  backend (confirmed: Chrome/Windows) — but *only* on some draws, not
   *  others, in a pattern that tracked draw-call position within the
   *  composite pass rather than which values were used (bisection ruled out
   *  clip-space magnitude, branching, uniform-vs-attribute-vs-constant, and
   *  program identity in turn). Whatever the underlying driver quirk is,
   *  routing the tile's position through gl.viewport — ordinary WebGL state,
   *  not a shader computation — sidesteps it entirely: this reuses
   *  _compositeProg/DISPLAY_VERT completely unmodified (the same program
   *  every *other* composite pass in this file already relies on) with its
   *  plain full quad, and lets the fixed-function rasterizer do the
   *  positioning instead. Verified stable across a full stroke crossing all
   *  four tile boundaries — no dropout, no seam.
   *
   *  Doesn't itself account for camera rotation (Camera.pose.angle) —
   *  the viewport is always an axis-aligned rect, so a rotated view would
   *  misplace tiles if this drew straight to the real screen. It doesn't:
   *  for infinite rooms _runComposite always targets the unrotated
   *  _assemblyFBO here (see targetW/targetH, always that buffer's own
   *  size in that case) and _finishInfiniteComposite applies the actual
   *  rotation exactly once, afterwards, on the assembled result — see its
   *  own comment (#134).
   *
   *  Rounds each of the tile's four EDGES individually (via
   *  frameEdgeX/Y, src/raster/cameraFrame.ts), rather than rounding a position and a
   *  size independently — two tiles sharing a world-space edge (adjacent
   *  tile origins are always exactly TILE_SIZE apart) compute that shared
   *  edge from the exact same formula and thus the exact same rounded
   *  pixel, however the camera/zoom fraction falls. Rounding position and
   *  size separately (the pre-#140 version of this method) doesn't have
   *  that guarantee — `round(pos) + round(size)` and `round(pos + size)`
   *  disagree for plenty of real zoom/pan combinations (confirmed: e.g.
   *  zoom 1.01 with the camera offset a few hundred world units from a
   *  tile boundary), producing a 1px transparent gap or a 1px overlap
   *  right at the seam — see index.tiledDisplay.test.ts's fractional-zoom
   *  case for a concrete reproduction.
   *
   *  Centers on `frame`'s centerX/Y — the current composite target's own
   *  pixel position for the camera's world point — rather than this
   *  target's own half-size (targetW/2): see CameraFrame.centerX for
   *  why the two aren't the same thing for infinite rooms, and why that
   *  distinction is what keeps an unrotated infinite-room frame pixel-
   *  aligned (no blur) instead of resampled through a fractional offset.
   *
   *  (#301) Scales by frame.scale, not the camera's raw zoom — above
   *  zoom 1 the two differ, and the leftover magnification is applied later,
   *  by the same pass that applies the rotation. See CameraFrame.scale. */
  drawTileComposite(
    frame: CameraFrame, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number,
    opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void {
    const { gl } = this.ctx
    const leftEdge   = frameEdgeX(frame, originX)
    const rightEdge  = frameEdgeX(frame, originX + bw)
    const topEdge    = frameEdgeY(frame, originY)
    const bottomEdge = frameEdgeY(frame, originY + bh)
    const glX = leftEdge
    // gl.viewport's y is measured from the bottom of the target, unlike the
    // top-down (topEdge, bottomEdge) this file uses everywhere else.
    const glY = targetH - bottomEdge

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(glX, glY, rightEdge - leftEdge, bottomEdge - topEdge)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._compositeProg)
    const u = this._compositeUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const posLoc = this._compositePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_layer, 0)
    gl.uniform1f(u.u_opacity, opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.viewport(0, 0, targetW, targetH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** #122: normally recomposites *every* visible layer/folder-child from
   *  `items` into `targetFbo` on every call — cost scaling linearly with
   *  layer count even though a painted move-event only ever changes the
   *  active layer's own texture (see _paintStrokeDabs). Instead, splits
   *  `items` around the active layer and composites:
   *
   *    [ below-cache (opacity 1) ] → [ active layer (its own opacity) ] → [ above-cache (opacity 1) ]
   *
   *  where below-cache/above-cache are the pre-blended result of every
   *  entry strictly below/above the active layer (rebuilt only when
   *  _splitCacheDirty — see _invalidateSplitCache's call sites). Porter-Duff
   *  "over" is associative, so grouping contiguous runs into one
   *  already-composited texture and blending *that* at opacity 1 produces
   *  the exact same result as blending every entry individually in order —
   *  same technique this file already uses for layer_merge
   *  (StructuralOps.mergeLive/replayMergeInto).
   *
   *  Bypassed entirely whenever a layer-transform gizmo preview (#120) is
   *  active: previewLayerTransform can substitute scratch content for *any*
   *  layer, active or not, on every drag frame, and that's rare enough
   *  (drags, not paint dabs) that reasoning about invalidating a persistent
   *  cache through it isn't worth it — this falls back to exactly the old
   *  (pre-#122) per-frame full recompute for as long as any preview exists.
   *
   *  (#136) Same split-cache technique now backs both bounded and infinite
   *  rooms — see _drawCompositeItem and Camera's constructor
   *  pose. No per-mode branch left here. */
  /** Every draw in this method (tiles, split-cache halves, active layer)
   *  targets _assemblyFBO — unrotated, zoom-applied, world-centered —
   *  instead of the real (canvas-sized) `targetFbo` directly.
   *
   *  (#470) Both kinds of room, now that a bounded one is drawn through the
   *  camera too. It used to draw straight into `targetFbo` because its
   *  rotation and zoom were the DOM canvasWrap's CSS transform rather than
   *  this camera's, and its canvas was the whole sheet.
   *
   *  Unlike before #138, this no longer calls _finishInfiniteComposite
   *  itself: _composeToFBO (the only caller) still has the live-tip/
   *  predicted/peer-reveal preview buffers to blend in after real layer
   *  content but *before* the camera's rotation is baked in — those
   *  previews need the exact same unrotated `_assemblyFBO` this method
   *  leaves populated, so _composeToFBO now owns the single call to
   *  _finishInfiniteComposite once everything (real content + previews) is
   *  in place. */
  runComposite(
    frame: CameraFrame, items: CompositeItem[],
    partialWorld: { minX: number; minY: number; maxX: number; maxY: number } | null = null,
  ): void {
    const buildFbo = this.ctx.assembly().fbo
    const targetW  = this.ctx.assembly().width
    const targetH  = this.ctx.assembly().height

    const idx = this.ctx.activeId() !== null ? items.findIndex(it => it.id === this.ctx.activeId()) : -1
    // idx === -1 (no active layer, or it's not currently composited — e.g.
    // hidden): treat everything as "below" and composite no separate active
    // entry, exactly matching what a plain full recompute of `items` would
    // have produced (the active id, absent from `items`, was never going to
    // be drawn either way).
    const belowItems  = idx === -1 ? items : items.slice(0, idx)
    const activeItem  = idx === -1 ? null  : items[idx]
    const aboveItems  = idx === -1 ? []    : items.slice(idx + 1)
    // (§17.46) The split caches are rebuilt (in full) before any scissor.
    if (this.ctx.previews().tiles.size === 0) this.rebuildSplitCacheIfDirty(frame, belowItems, aboveItems, targetW, targetH)
    // (§17.46) A frame whose only change is the live stroke reassembles only
    // its rect (unrotated camera: the assembly is then the screen, padded):
    // clearing and redrawing the whole assembly - the caches and every
    // resident tile of the active layer - was the second-dearest thing in a
    // big stroke's frame on the tablet.
    let scissored = false
    if (partialWorld && frame.angle === 0 && this.ctx.previews().tiles.size === 0) {
      const pad = 8
      const x0 = Math.max(0, frameEdgeX(frame, partialWorld.minX) - pad)
      const x1 = Math.min(targetW, frameEdgeX(frame, partialWorld.maxX) + pad)
      const top = Math.max(0, frameEdgeY(frame, partialWorld.minY) - pad)
      const bottom = Math.min(targetH, frameEdgeY(frame, partialWorld.maxY) + pad)
      if (x1 > x0 && bottom > top) {
        this.ctx.gl.enable(this.ctx.gl.SCISSOR_TEST)
        this.ctx.gl.scissor(x0, targetH - bottom, x1 - x0, bottom - top)
        scissored = true
      }
    }
    this.ctx.assembly().clear()

    if (this.ctx.previews().tiles.size > 0) {
      for (const { id, opacity } of items) this.drawCompositeItem(frame, id, opacity, buildFbo, targetW, targetH)
      return
    }

    if (belowItems.length) {
      this.compositeTextures([{ texture: this.ctx.below().texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
    if (activeItem) {
      this.drawCompositeItem(frame, activeItem.id, activeItem.opacity, buildFbo, targetW, targetH)
    }
    if (aboveItems.length) {
      this.compositeTextures([{ texture: this.ctx.above().texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
    if (scissored) this.ctx.gl.disable(this.ctx.gl.SCISSOR_TEST)
  }
}

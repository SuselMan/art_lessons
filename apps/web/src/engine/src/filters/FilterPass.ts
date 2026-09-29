// (#494) Layer filters on a layer's tiles, out of PencilEngine (the other
// half of seam С20′ of the survey): the bake of a `layer_filter` operation
// and its live preview. The pixel arithmetic is layerFilters.ts next door,
// on the CPU; this file only gathers each tile with its margin off the GPU,
// runs that arithmetic and puts the result back.
//
// It never sees the engine, only FilterPassContext below. It holds no GL
// object across calls — the patch it reads through lives for one filter run,
// and a preview's tiles belong to LayerPreviews — so there is neither
// forget() nor destroy().

import type { LayerFilter } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { tileWorldRect, tilesOverlappingRect, type WorldRect } from '../buffers/tileMath'
import type { BlitPasses } from '../raster/blitPasses'
import { tileBufferAt, type LayerPreviews, type PreviewTile } from '../raster/layerPreviews'
import { translationMatrix } from '../raster/matrix'
import { applyLayerFilter, isKnownLayerFilter, layerFilterReach, normalizeLayerFilter } from './layerFilters'

/** What FilterPass may ask of the engine. */
export interface FilterPassContext {
  readonly gl: WebGLRenderingContext
  /** Whether the room has no sheet — a bounded one grows no tiles past it.
   *  Fixed at construction, like the room itself. */
  readonly infinite: boolean
  /** The floating previews the composite draws in place of real tiles. */
  readonly previews: LayerPreviews
  /** A function, not a value: _initGL builds a fresh BlitPasses on every
   *  context restore, and FilterPass outlives it. */
  passes(): BlitPasses
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

export class FilterPass {
  private readonly ctx: FilterPassContext

  constructor(ctx: FilterPassContext) {
    this.ctx = ctx
  }

  /** Runs `filter` over every tile of `layerBuf` that has content — plus, for
   *  a blur, the neighbouring tiles it spreads into — and returns the results
   *  as fresh tile-sized buffers. Writes nothing into the layer: the caller
   *  either copies these in (`apply`) or floats them as a preview.
   *
   *  Each tile is read with a margin of the filter's reach around it, from
   *  whichever of the layer's tiles overlap that margin. That is what makes a
   *  tile's result equal to filtering the whole layer in one piece, and
   *  therefore independent of where this client's tile grid happens to cut —
   *  the property the recipe-in-the-log design rests on (layerFilters.test.ts
   *  checks it byte for byte).
   *
   *  The pixel math runs on the CPU, not in a shader, because every
   *  participant runs it and all of them have to get the same answer; see the
   *  cross-device determinism rule in `.claude/rules.md`. The price is time on
   *  the main thread, measured in ADR 014.
   *
   *  Eviction must be suspended by the caller: the reads below touch every
   *  content tile and their neighbours, and a trim in the middle would
   *  destroy a tile about to be read. */
  private filterTiles(layerBuf: ILayerBuffer, rawFilter: LayerFilter): Array<PreviewTile & { contentRect: WorldRect }> {
    if (!isKnownLayerFilter(rawFilter)) return []
    const { gl } = this.ctx
    const filter = normalizeLayerFilter(rawFilter)
    const reach = layerFilterReach(filter)
    const { w: tw, h: th } = this.ctx.tileSize()
    const page = this.ctx.infinite ? null : this.ctx.pageSize()

    // Which tiles the result can land on, and how far content reaches in each.
    const targets = new Map<string, { rect: WorldRect; content: WorldRect }>()
    const addTarget = (rect: WorldRect, content: WorldRect): void => {
      const key = `${rect.minX},${rect.minY}`
      const prev = targets.get(key)
      targets.set(key, {
        rect,
        content: prev ? {
          minX: Math.min(prev.content.minX, content.minX), minY: Math.min(prev.content.minY, content.minY),
          maxX: Math.max(prev.content.maxX, content.maxX), maxY: Math.max(prev.content.maxY, content.maxY),
        } : content,
      })
    }
    for (const src of layerBuf.allResident()) {
      if (!src.contentRect) continue
      const srcRect = tileWorldRect(Math.floor(src.originX / tw), Math.floor(src.originY / th), tw, th)
      if (reach === 0) { addTarget(srcRect, src.contentRect); continue }
      const grown: WorldRect = {
        minX: src.contentRect.minX - reach, minY: src.contentRect.minY - reach,
        maxX: src.contentRect.maxX + reach, maxY: src.contentRect.maxY + reach,
      }
      for (const { tileX, tileY } of tilesOverlappingRect(grown, tw, th)) {
        const rect = tileWorldRect(tileX, tileY, tw, th)
        // A bounded room grows no new tiles past its sheet for a blur's
        // spill: nothing could ever show them. Tiles that already exist
        // there (a transform moved content off the page) are still filtered.
        const isSource = rect.minX === srcRect.minX && rect.minY === srcRect.minY
        if (page && !isSource && (rect.minX >= page.w || rect.minY >= page.h || rect.maxX <= 0 || rect.maxY <= 0)) continue
        addTarget(rect, {
          minX: Math.max(rect.minX, grown.minX), minY: Math.max(rect.minY, grown.minY),
          maxX: Math.min(rect.maxX, grown.maxX), maxY: Math.min(rect.maxY, grown.maxY),
        })
      }
    }
    if (targets.size === 0) return []

    const pw = tw + 2 * reach
    const ph = th + 2 * reach
    const passes = this.ctx.passes()
    const patch = new AccumulationBuffer(gl, pw, ph)
    const results: Array<PreviewTile & { contentRect: WorldRect }> = []
    try {
      for (const { rect, content } of targets.values()) {
        const region: WorldRect = {
          minX: rect.minX - reach, minY: rect.minY - reach, maxX: rect.maxX + reach, maxY: rect.maxY + reach,
        }
        patch.clear()
        let any = false
        for (const { buffer, originX, originY } of layerBuf.resolveVisible(region)) {
          passes.transform(buffer, translationMatrix(region.minX - originX, region.minY - originY), pw, ph, patch.fbo)
          any = true
        }
        if (!any) continue
        const filtered = applyLayerFilter(
          patch.readPixels(), pw, ph, filter, { originX: region.minX, originY: region.minY, rowsUp: true },
        )
        // The tile is the patch minus its margin — the same `reach` on every
        // side, so the crop needs no flip even though the rows are bottom-up.
        const tile = new Uint8Array(tw * th * 4)
        let empty = true
        for (let y = 0; y < th; y++) {
          const from = ((y + reach) * pw + reach) * 4
          const row = filtered.subarray(from, from + tw * 4)
          if (empty) for (let i = 3; i < row.length; i += 4) if (row[i] !== 0) { empty = false; break }
          tile.set(row, y * tw * 4)
        }
        // A blur's spill that rounded away to nothing does not earn a tile.
        const existing = tileBufferAt(layerBuf, rect)
        if (empty && !existing) continue
        const buffer = new AccumulationBuffer(gl, tw, th)
        buffer.restorePixels(tile)
        results.push({ originX: rect.minX, originY: rect.minY, buffer, contentRect: content })
      }
    } finally {
      patch.destroy()
    }
    return results
  }

  /** Bakes a `layer_filter` into a layer. */
  apply(layerBuf: ILayerBuffer, filter: LayerFilter): void {
    const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
    tiled?.suspendEviction()
    try {
      // Everything is computed before anything is written: a tile's margin
      // reads its neighbours, and a neighbour already filtered would be
      // filtered twice at the seam.
      const results = this.filterTiles(layerBuf, filter)
      for (const { originX, originY, buffer, contentRect } of results) {
        const rect = tileWorldRect(
          Math.floor(originX / buffer.width), Math.floor(originY / buffer.height), buffer.width, buffer.height,
        )
        const target = layerBuf.resolveForPaint(rect).find(t => t.originX === originX && t.originY === originY)
        if (target) {
          buffer.copyTo(target.buffer)
          layerBuf.markContentPainted(contentRect)
        }
        buffer.destroy()
      }
    } finally {
      tiled?.resumeEviction()
    }
  }

  /** See PencilEngineAPI.previewLayerFilter. */
  preview(layerId: string, filter: LayerFilter | null): void {
    const { previews } = this.ctx
    for (const t of previews.tiles.get(layerId) ?? []) t.buffer.destroy()
    previews.tiles.delete(layerId)
    previews.areaLayers.delete(layerId)
    const layerBuf = this.ctx.layer(layerId)
    if (layerBuf && filter) {
      const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
      tiled?.suspendEviction()
      try {
        const tiles = this.filterTiles(layerBuf, filter)
        previews.tiles.set(layerId, tiles.map(({ originX, originY, buffer }) => ({ originX, originY, buffer })))
        // Drawn in place of the real tiles where a preview tile exists, from
        // the real ones everywhere else — see the engine's _drawCompositeItem.
        previews.areaLayers.add(layerId)
      } finally {
        tiled?.resumeEviction()
      }
    }
    this.ctx.layerPainted(layerId)
    this.ctx.display()
  }
}

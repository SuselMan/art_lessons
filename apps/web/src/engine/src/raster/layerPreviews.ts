// (#494) The engine's floating layer previews, out of PencilEngine — the
// scratch tiles that stand in for a layer's own while a gesture is still
// being placed. Written by AreaOps (layer transform, selection move, paste)
// and, until they get their own seam, by the engine's shape and filter
// previews; read by the composite (_drawCompositeItem, _runComposite).
//
// No GL of its own: the buffers are created by whoever writes a preview, and
// only freed here when the whole set is dropped.

import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'

// One scratch tile of a live gizmo-drag preview (#120/#139) — shaped exactly
// like a real PaintTarget (see ILayerBuffer.ts) so _drawCompositeItem can
// draw it through the same _drawTileComposite call a real resident tile
// goes through, just reading `buffer` instead of a real layer's own.
export interface PreviewTile {
  originX: number
  originY: number
  buffer: AccumulationBuffer
}

export class LayerPreviews {
  // Live layer-transform gizmo preview (#120, generalized to multiple tiles
  // by #139) — one or more scratch tiles per layer currently being dragged,
  // keyed by layerId. Same non-destructive pattern as _previewBuf/_tipBuf:
  // the real layer buffer is never touched until the gizmo is released and
  // a real layer_transform op lands via appendOperation —
  // _drawCompositeItem substitutes these in for their layerId's real
  // tile(s) while present. A layer spread across (or, post-transform,
  // spread across) more than one tile needs more than one scratch buffer,
  // each positioned like a real PaintTarget — see PreviewTile and
  // previewLayerTransform/clearLayerTransformPreview.
  readonly tiles = new Map<string, PreviewTile[]>()
  // (#446) Which of those previews are *selection* previews. The distinction
  // matters exactly once, in _drawCompositeItem: a whole-layer preview is the
  // entire layer and replaces it, while a selection preview covers only the
  // tiles the selection passes through and the rest of the layer must keep
  // drawing from its real buffer. A Set rather than a field on PreviewTile
  // because it is a property of the gesture, not of any one tile.
  readonly areaLayers = new Set<string>()

  /** Frees every preview tile and forgets every preview. */
  clear(): void {
    for (const tiles of this.tiles.values()) {
      for (const { buffer } of tiles) buffer.destroy()
    }
    this.tiles.clear()
    this.areaLayers.clear()
  }

  /** Context loss: the tiles' handles died with the context, so they are
   *  dropped without touching the driver — a mid-drag gizmo just loses its
   *  live preview. */
  forget(): void {
    this.tiles.clear()
    this.areaLayers.clear()
  }
}

/** The resident buffer whose world origin is this tile rect's, or null.
 *  resolveVisible is already "never create", so this is only picking the one
 *  exact tile out of what it returns. */
export function tileBufferAt(layerBuf: ILayerBuffer, rect: WorldRect): AccumulationBuffer | null {
  for (const t of layerBuf.resolveVisible(rect)) {
    if (t.originX === rect.minX && t.originY === rect.minY) return t.buffer
  }
  return null
}

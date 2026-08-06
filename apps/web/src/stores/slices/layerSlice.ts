import type { StateCreator } from 'zustand'
import { BACKGROUND_LAYER_ID, INITIAL_LAYER_ID, type LayerState, type Operation } from '@grafetto/shared'

import { translate } from '../../i18n/translate'
import { replayLayerState, overlayLocalFields } from '../../lib/layers'
import { useSettingsStore } from '../settingsStore'
import type { RulerPoint } from '../../pages/Room/RulerOverlay'
import type { TransformBounds, TransformMatrix } from '../../pages/Room/transformMath'

// (#208) The two baseline layers are the only ones whose names never travel
// through the operation log — they're the implicit state every replay starts
// from, reconstructed locally by each client. So unlike a layer someone
// creates (whose name IS an operation, and reaches everyone in the creator's
// language), these are local chrome and are named in the reader's own
// language. Resolved at construction rather than at render because a
// `layer_rename` op turns the name into shared content from then on — a
// later language switch must not silently undo somebody's rename.
export function makeInitialLayerState(): LayerState {
  const locale = useSettingsStore.getState().locale
  return {
    items: {
      [BACKGROUND_LAYER_ID]: {
        kind: 'layer', id: BACKGROUND_LAYER_ID,
        name: translate(locale, 'layers.backgroundName'), opacity: 1, visible: true,
      },
      [INITIAL_LAYER_ID]: {
        kind: 'layer', id: INITIAL_LAYER_ID,
        name: translate(locale, 'layers.defaultLayerName', { n: 1 }), opacity: 1, visible: true,
      },
    },
    rootOrder:   [INITIAL_LAYER_ID, BACKGROUND_LAYER_ID],
    activeId:    INITIAL_LAYER_ID,
    selectedIds: [],
  }
}

export interface LayerSlice {
  // The store does NOT own layer-mutation logic — `layerState` is a derived
  // cache of the engine's operation log (ADR 002), rebuilt via
  // replayLayerState+overlayLocalFields on every append. `setLayerStateLocal`
  // exists only for LayerPanel's local-view-field writes (selection/
  // collapse/lock), same Dispatch<SetStateAction<LayerState>> calling
  // convention as the useState setter it replaces — LayerPanel's own prop
  // contract needs zero changes.
  layerState: LayerState
  setLayerStateLocal: (updater: LayerState | ((prev: LayerState) => LayerState)) => void
  syncLayerStateFromLog: (base: LayerState, ops: Operation[]) => void

  // Ruler geometry + layer-transform-preview geometry — moved into the
  // store for consistency (#170 follow-up design), but deliberately
  // NEVER persisted: a ruler is for quickly comparing distances mid-
  // drawing, not a saved setting (Ilya, same "gizmo-like, transient"
  // bucket as transform preview) — transformBounds is derived fresh from
  // engine.getContentBounds() at the start of each transform *session* and
  // would go stale the moment a peer/undo changes the layer;
  // transformSessionMatrix is an uncommitted preview that must never survive
  // a reload as a "phantom" transform. All four reset to null on mount.
  //
  // (#405) The line now outlives the ruler tool being selected: switching to
  // the pencil leaves it on screen to draw against (and to snap to, if
  // snapping is on), it just stops being draggable. Only hiding it — the
  // ruler tool's own `show` setting — takes it out of play, and that hides
  // rather than clears, so the same line comes back.
  rulerLine: { a: RulerPoint; b: RulerPoint } | null
  setRulerLine: (line: { a: RulerPoint; b: RulerPoint } | null) => void
  /** Content bounds the open transform session started from, in canvas space.
   *  Deliberately *not* recomputed per gesture (#399): the session's own
   *  matrix carries every gesture since, so re-deriving an axis-aligned box
   *  from pixels mid-session is what used to throw away the frame's rotation. */
  transformBounds: TransformBounds | null
  setTransformBounds: (bounds: TransformBounds | null) => void
  /** Every gesture of the open transform session, composed — null when no
   *  session is open. Rendered straight as the gizmo's `<g transform>` and fed
   *  to previewLayerTransform, which is what keeps the frame glued to the
   *  content instead of snapping back to an upright box on release (#399). */
  transformSessionMatrix: TransformMatrix | null
  setTransformSessionMatrix: (matrix: TransformMatrix | null) => void
  /** Custom rotation pivot, in the session's *local* (pre-matrix) space, so it
   *  rides along with the content the way Photoshop's reference point does
   *  rather than needing to be re-placed after every gesture. */
  transformCenterOverride: { x: number; y: number } | null
  setTransformCenterOverride: (center: { x: number; y: number } | null) => void
}

export const createLayerSlice: StateCreator<LayerSlice> = set => ({
  layerState: makeInitialLayerState(),
  setLayerStateLocal: updater => set(state => ({
    layerState: typeof updater === 'function' ? updater(state.layerState) : updater,
  })),
  syncLayerStateFromLog: (base, ops) => set(state => ({
    layerState: overlayLocalFields(replayLayerState(base, ops), state.layerState),
  })),

  rulerLine: null,
  setRulerLine: line => set({ rulerLine: line }),
  transformBounds: null,
  setTransformBounds: bounds => set({ transformBounds: bounds }),
  transformSessionMatrix: null,
  setTransformSessionMatrix: matrix => set({ transformSessionMatrix: matrix }),
  transformCenterOverride: null,
  setTransformCenterOverride: center => set({ transformCenterOverride: center }),
})

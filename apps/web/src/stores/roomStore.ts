import { create } from 'zustand'

import { createLayerSlice, type LayerSlice } from './slices/layerSlice'
import { createViewportSlice, type ViewportSlice } from './slices/viewportSlice'
import { createToolSlice, type ToolSlice } from './slices/toolSlice'
import { createRoomInfoSlice, type RoomInfoSlice } from './slices/roomSlice'
import { createStrokeSlice, type StrokeSlice } from './slices/strokeSlice'

// The engine ref never enters this file (or any slice under ./slices) —
// enforced by convention, not by TS; see epic #2 and its #25 audit task.
// Store state is always a *reflection* of what's already been applied to
// the engine via an imperative call (e.g. engine.setTool(tool)), never the
// engine's own source of truth — the operation log + engine buffers stay
// exactly where they are today.
//
// Every consumer should read via a single-field selector
// (useRoomStore(s => s.tool)), never whole-store destructuring
// (useRoomStore()) — LayerPanel and ColorPicker both rely on prop-
// reference stability (memo()/a lastEmitted ref) that a naive whole-store
// subscription would break. #25 audits this once everything is wired.
// (#405) There is no overlay slice any more. It held `overlayMode` — the
// eyedropper/ruler/transform modes that used to lie on top of a drawing tool
// — plus the ruler's placement flag and `gridActive`. All four are gone: the
// modes became members of the one `tool` selection in toolSlice, the ruler's
// placement flag died with the two-phase place-then-drag gesture it existed
// for, and the grid's visibility became an ordinary setting on the grid tool.
// Nothing was left to keep in a slice of its own.
export interface RoomStore extends LayerSlice, ViewportSlice, ToolSlice, RoomInfoSlice, StrokeSlice {}

export const useRoomStore = create<RoomStore>()((...a) => ({
  ...createLayerSlice(...a),
  ...createViewportSlice(...a),
  ...createToolSlice(...a),
  ...createRoomInfoSlice(...a),
  ...createStrokeSlice(...a),
}))

const initialRoomStoreState = useRoomStore.getState()

/** The store is a module-level singleton — unlike a component's local
 *  `useState`, it does NOT reset itself just because Room unmounts and
 *  later remounts (e.g. `/room/A` → `/create` → `/room/B`, two genuinely
 *  different mounts of the same component). Room calls this once, as the
 *  very first thing it does on mount (#24), so a fresh room session never
 *  briefly renders with a previous room's stale layerState/viewport/tool/
 *  room data. `true` replaces the whole state rather than merging — action
 *  functions are restored to the same stable references (they close over
 *  this store's own set/get, never over stale data), only the data fields
 *  actually reset. */
export function resetRoomStore(): void {
  useRoomStore.setState(initialRoomStoreState, true)
}

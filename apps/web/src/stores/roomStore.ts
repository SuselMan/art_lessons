import { create } from 'zustand'

import { createLayerSlice, type LayerSlice } from './slices/layerSlice'
import { createViewportSlice, type ViewportSlice } from './slices/viewportSlice'
import { createToolSlice, type ToolSlice } from './slices/toolSlice'
import { createRoomInfoSlice, type RoomInfoSlice } from './slices/roomSlice'

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
export interface RoomStore extends LayerSlice, ViewportSlice, ToolSlice, RoomInfoSlice {}

export const useRoomStore = create<RoomStore>()((...a) => ({
  ...createLayerSlice(...a),
  ...createViewportSlice(...a),
  ...createToolSlice(...a),
  ...createRoomInfoSlice(...a),
}))

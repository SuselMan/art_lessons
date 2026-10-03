import { create, type StateCreator } from 'zustand'

import { createLayerSlice, type LayerSlice } from './slices/layerSlice'
import { createViewportSlice, type ViewportSlice } from './slices/viewportSlice'
import { createToolSlice, type ToolSlice } from './slices/toolSlice'
import { createRoomInfoSlice, type RoomInfoSlice } from './slices/roomSlice'
import { createStrokeSlice, type StrokeSlice } from './slices/strokeSlice'
import { createSelectionSlice, type SelectionSlice } from './slices/selectionSlice'
import { createAnnotationSlice, type AnnotationSlice } from './slices/annotationSlice'

// The engine ref never enters this file (or any slice under ./slices) —
// enforced by convention, not by TS; see epic #2 and its #25 audit task.
// Store state is always a *reflection* of what's already been applied to
// the engine via an imperative call (e.g. engine.setTool(tool)), never the
// engine's own source of truth — the operation log + engine buffers stay
// exactly where they are today. Quick review temporarily projects only
// annotations from the confirmed server stream while the engine restores;
// when pixels are ready that projection returns to engine.getOperations().
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
export interface RoomStore extends LayerSlice, ViewportSlice, ToolSlice, RoomInfoSlice, StrokeSlice, SelectionSlice, AnnotationSlice {}

export const useRoomStore = create<RoomStore>()((...a) => ({
  ...createLayerSlice(...a),
  ...createViewportSlice(...a),
  ...createToolSlice(...a),
  ...createRoomInfoSlice(...a),
  ...createStrokeSlice(...a),
  ...createSelectionSlice(...a),
  ...createAnnotationSlice(...a),
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
export function resetRoomStore(reviewBoardId?: string): void {
  useRoomStore.setState({ ...initialRoomStoreState, reviewBoardId: reviewBoardId ?? null }, true)
}

/** (#176, ADR 014 §4) The content slices' keys — what a page turn resets.
 *  Enumerated from throwaway instances of the slices themselves rather than
 *  listed by hand, so a field added to layerSlice tomorrow is reset tomorrow
 *  without anyone remembering this file. */
function keysOf<T extends object>(creator: StateCreator<T>): string[] {
  return Object.keys(create<T>()(creator).getState())
}

const CONTENT_SLICE_KEYS = new Set<string>([
  ...keysOf(createLayerSlice),
  ...keysOf(createViewportSlice),
  ...keysOf(createStrokeSlice),
  ...keysOf(createSelectionSlice),
  ...keysOf(createAnnotationSlice),
])

/** Content-slice fields that nonetheless describe the *person*, not the page,
 *  and so survive a page turn the way the tool in hand does: the camera (a
 *  sketchbook keeps your zoom when you flip the page — the page itself is
 *  re-fitted by the caller when that is wanted), the rotation lock, and
 *  whether the annotation rail / the notes are shown. Everything else in
 *  those slices is derived from one board's operation log or is a gesture in
 *  progress on it. */
const SURVIVES_PAGE_TURN: ReadonlySet<keyof RoomStore> = new Set<keyof RoomStore>([
  'viewport', 'rotationLocked', 'annotationMode', 'annotationsHidden', 'reviewBoardId',
])

/** (#176, ADR 014 §4) Resets the content slices — layers, selection, stroke,
 *  annotations — for the next board, and leaves `roomSlice` (the lesson:
 *  roster, palette, strip, who is following) and `toolSlice` (the tool,
 *  preset and colour in hand) exactly as they are. `resetRoomStore()` stays
 *  the thing that runs on entering a lesson; this runs on turning a page
 *  inside one.
 *
 *  A merge, not a replace: the kept slices are the majority of the store and
 *  copying them through a replace would only be a second way to get the list
 *  of kept keys wrong. */
export function resetBoardState(): void {
  const fresh: Partial<RoomStore> = {}
  for (const key of CONTENT_SLICE_KEYS) {
    const k = key as keyof RoomStore
    if (SURVIVES_PAGE_TURN.has(k)) continue
    // Actions are the same stable references either way; only data changes.
    Object.assign(fresh, { [k]: initialRoomStoreState[k] })
  }
  useRoomStore.setState(fresh)
}

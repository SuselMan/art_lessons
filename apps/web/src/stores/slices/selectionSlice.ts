import type { StateCreator } from 'zustand'
import type { SelectionShape } from '@grafetto/shared'

// (#446, ADR 008) The selection a user currently holds, and the clipboard it
// can be copied to. Both are *local* — they never travel to other
// participants: a selection is what someone is about to do, not something
// they did, and the operation log records the latter. That is also why this
// sits in the room store next to the viewport rather than being derived from
// anything on the wire.

/** Which layer the selection belongs to, alongside its geometry. A selection
 *  is a region of a *drawing*, and the drawing is on a layer — carrying the
 *  layer here (rather than resolving "the active layer" at use time) is what
 *  keeps a selection made on one layer from silently retargeting itself when
 *  the user clicks another one in the layer panel. Room drops the selection
 *  instead; see `useSelectionSync`. */
export interface ActiveSelection {
  layerId: string
  shape: SelectionShape
}

/** What is on the in-editor clipboard: the pixels, and the world rect they
 *  came from. Straight into an `area_paste` — paste lands where it was cut
 *  from (ADR 008), including onto a different layer, which is the case the
 *  whole feature was asked for. */
export interface ClipboardEntry {
  image: string
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionSlice {
  /** Null when nothing is selected — which is most of the time, and is what
   *  every transform/erase path checks to decide whether it operates on a
   *  region or on the whole layer. */
  selection: ActiveSelection | null
  setSelection: (selection: ActiveSelection | null) => void
  /** The lasso being drawn right now, in layer coordinates, or null between
   *  gestures. Kept in the store rather than in Room's local state because
   *  the overlay that draws it is a separate component from the handlers that
   *  collect the points; a ref would not re-render it.
   *
   *  For the point-by-point lasso this also survives between taps — that
   *  gesture is a sequence of separate pointer events with a live rubber-band
   *  segment between them, so "in progress" genuinely outlives any one of
   *  them. */
  pendingSelection: number[] | null
  setPendingSelection: (points: number[] | null) => void
  clipboard: ClipboardEntry | null
  setClipboard: (entry: ClipboardEntry | null) => void
}

export const createSelectionSlice: StateCreator<SelectionSlice> = set => ({
  selection: null,
  setSelection: selection => set({ selection }),
  pendingSelection: null,
  setPendingSelection: points => set({ pendingSelection: points }),
  clipboard: null,
  setClipboard: entry => set({ clipboard: entry }),
})

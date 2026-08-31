import type { StateCreator } from 'zustand'
import type { SelectionShape } from '@grafetto/shared'

// (#446, ADR 008) The selection a user currently holds. *Local* — it never
// travels to other participants: a selection is what someone is about to do,
// not something they did, and the operation log records the latter. That is
// also why this sits in the room store next to the viewport rather than being
// derived from anything on the wire.
//
// (#521) The clipboard used to live here too, and no longer does — see
// `stores/clipboardStore.ts`. The two parted company for a concrete reason:
// `resetRoomStore()` wipes this store on every Room mount, which is exactly
// right for a selection (it marks a region of *this* drawing) and exactly
// wrong for a clipboard, whose whole point since #521 is being carried into
// the next room.

export interface SelectionSlice {
  /** Null when nothing is selected — which is most of the time, and is what
   *  every transform/erase path checks to decide whether it operates on a
   *  region or on the whole layer.
   *
   *  Deliberately *not* tied to a layer. A selection is a region of the
   *  canvas, and switching layers leaves it exactly where it is — the region
   *  now marks that part of the newly active layer instead (Ilya, 13.08).
   *  Which layer an action touches is therefore answered at the moment of the
   *  action, from the active layer, never from something the selection
   *  remembers.
   *
   *  It was the other way round first — the selection carried a layer id and
   *  was dropped when the active layer changed, on the reasoning that a region
   *  traced against one drawing shouldn't silently retarget onto another. That
   *  is true of the *reason* you drew the outline and false of the thing you
   *  do with it next: mark a region once, then work through the layers under
   *  it — clear it here, copy it there — which is only possible if it stays. */
  selection: SelectionShape | null
  setSelection: (selection: SelectionShape | null) => void
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
}

export const createSelectionSlice: StateCreator<SelectionSlice> = set => ({
  selection: null,
  setSelection: selection => set({ selection }),
  pendingSelection: null,
  setPendingSelection: points => set({ pendingSelection: points }),
})

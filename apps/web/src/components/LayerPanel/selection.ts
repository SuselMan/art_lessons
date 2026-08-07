import { BACKGROUND_LAYER_ID } from '@grafetto/shared'

/**
 * The decisions selection mode makes, kept out of the component so they can be
 * tested (#411).
 *
 * The panel has no React test harness — there is no jsdom or testing-library in
 * this repo, and adding one to cover three list operations would be a poor
 * trade. Extracting them is the same move `flatList.ts` already makes for the
 * flatten/reconstruct pair, and for the same reason: these are where the bugs
 * were, and the surrounding component is where they were invisible.
 */

/** Adds or removes one id. The background is never selectable — it is the
 *  paper (see `isLayerLocked`), and every other rule about it says so too. */
export function toggleSelection(selectedIds: readonly string[], id: string): string[] {
  if (id === BACKGROUND_LAYER_ID) return [...selectedIds]
  return selectedIds.includes(id)
    ? selectedIds.filter(x => x !== id)
    : [...selectedIds, id]
}

/** Whether "select all" has nothing left to add, i.e. the button should now
 *  offer to clear instead. An empty list is not "all selected" — otherwise a
 *  panel showing only the background would offer to deselect nothing. */
export function isAllSelected(selectableIds: readonly string[], selectedIds: readonly string[]): boolean {
  return selectableIds.length > 0 && selectableIds.every(id => selectedIds.includes(id))
}

/** The one button does both jobs; which one depends on where it starts. */
export function toggleSelectAll(selectableIds: readonly string[], selectedIds: readonly string[]): string[] {
  return isAllSelected(selectableIds, selectedIds) ? [] : [...selectableIds]
}

/** Whether emptying the selection should also close the mode.
 *
 *  True only on the transition *out of* a non-empty selection. Entering the
 *  mode from the toolbar starts empty, and closing it immediately would make
 *  that button impossible to use. */
export function shouldExitOnEmpty(before: readonly string[], after: readonly string[]): boolean {
  return after.length === 0 && before.length > 0
}

/** Whether a held pointer has travelled far enough to be a scroll rather than
 *  a long press. */
export function beyondTolerance(
  from: { x: number; y: number },
  to: { x: number; y: number },
  tolerancePx: number,
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > tolerancePx
}

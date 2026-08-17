import type { StateCreator } from 'zustand'

import type { Viewport } from '../../pages/Room/useViewport'
import type { ToolSlice } from './toolSlice'

export interface ViewportSlice {
  // useViewport.ts keeps its entire internal architecture (rAF-throttled
  // updates, a synchronous ref for hot gesture math, direct DOM transform
  // writes bypassing React) — only the target of its already-throttled
  // flush changes, from a local useState setter to this store's setViewport.
  viewport: Viewport
  setViewport: (updater: Viewport | ((prev: Viewport) => Viewport)) => void

  // Hold-to-pan (#319, ADR 007 §4): Space physically down. Stays here, next to
  // the viewport it moves, while the deliberately *chosen* hand went to
  // `tool` in toolSlice (#443) — the two are not one flag split in half, they
  // have different lifetimes and both can be true at once. A hold ends when
  // the key comes up and must put back whatever was in hand before it; a
  // selection persists until something else is selected. Folding the hold into
  // `tool` would lose the thing to go back to, so releasing Space would drop
  // the person into a tool they never picked.
  //
  // It is also why Space is not in the hotkey registry (see lib/hotkeys.ts):
  // the registry has no keyup half, and a rebindable hold is a mode with no
  // guaranteed way out.
  handHeld: boolean
  setHandHeld: (held: boolean) => void

  // (#458) Canvas rotation held where it is. Local and per-user, like the rest
  // of the viewport — nobody else's view turns because this one is pinned.
  //
  // Lives beside `viewport` rather than in settingsStore because it is a
  // property *of this view*, not a preference about the app: the angle it
  // pins is room-local state that `resetRoomStore()` clears on every Room
  // mount, and a lock that outlived the angle it was locking would put the
  // next room's canvas under a lock nobody in that room set.
  //
  // Enforced in useViewport's two write paths (`updateVp`, `setVpTracked`), not
  // by each control refusing to offer rotation: there are five ways to turn the
  // canvas (two-finger twist, shift-drag, the header readout's drag and its
  // click, the reset hotkey) and a lock that each of them has to remember to
  // honour is a lock with a hole in it the next one drills.
  rotationLocked: boolean
  setRotationLocked: (locked: boolean) => void
}

/** True when a drag on the canvas moves the view instead of painting —
 *  whichever of the two routes got it there: the hand selected, or Space held
 *  over whatever else is. Takes the two fields from the two slices they live
 *  in rather than reading the store itself, so it stays callable on a plain
 *  snapshot (which is how `useViewport`'s native listeners use it). */
export function isHandActive(state: Pick<ToolSlice, 'tool'> & Pick<ViewportSlice, 'handHeld'>): boolean {
  return state.tool === 'hand' || state.handHeld
}

export const createViewportSlice: StateCreator<ViewportSlice> = set => ({
  viewport: { cx: 0, cy: 0, zoom: 1, angle: 0 },
  setViewport: updater => set(state => ({
    viewport: typeof updater === 'function' ? updater(state.viewport) : updater,
  })),
  handHeld: false,
  setHandHeld: held => set({ handHeld: held }),
  rotationLocked: false,
  setRotationLocked: locked => set({ rotationLocked: locked }),
})

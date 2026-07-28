import type { StateCreator } from 'zustand'

import type { Viewport } from '../../pages/Room/useViewport'

export interface ViewportSlice {
  // useViewport.ts keeps its entire internal architecture (rAF-throttled
  // updates, a synchronous ref for hot gesture math, direct DOM transform
  // writes bypassing React) — only the target of its already-throttled
  // flush changes, from a local useState setter to this store's setViewport.
  viewport: Viewport
  setViewport: (updater: Viewport | ((prev: Viewport) => Viewport)) => void

  // Hand tool (#319, ADR 007 §5) — a viewport mode, deliberately *not* a
  // member of `DrawingTool`/`ToolType`: ToolType travels inside
  // StrokeOperation into the operation log, and a tool that paints nothing
  // has no business in a serialized contract. It lives here, next to the
  // viewport it moves, for the same reason.
  //
  // Two flags rather than one because they have different lifetimes and both
  // can be true at once: `handTool` is the deliberate choice (toolbar button
  // or its hotkey) and persists until switched off, `handHeld` is Space being
  // physically down and ends when it comes up — the standard hold-to-pan of
  // every graphics editor. Collapsing them into one boolean loses the state
  // to return to: releasing Space while the hand tool is genuinely selected
  // would drop the person out of a tool they chose.
  handTool: boolean
  setHandTool: (updater: boolean | ((prev: boolean) => boolean)) => void
  handHeld: boolean
  setHandHeld: (held: boolean) => void
}

/** True when a drag on the canvas moves the view instead of painting —
 *  whichever of the two routes into the mode got it there. */
export function isHandActive(state: Pick<ViewportSlice, 'handTool' | 'handHeld'>): boolean {
  return state.handTool || state.handHeld
}

export const createViewportSlice: StateCreator<ViewportSlice> = set => ({
  viewport: { cx: 0, cy: 0, zoom: 1, angle: 0 },
  setViewport: updater => set(state => ({
    viewport: typeof updater === 'function' ? updater(state.viewport) : updater,
  })),
  handTool: false,
  setHandTool: updater => set(state => ({
    handTool: typeof updater === 'function' ? updater(state.handTool) : updater,
  })),
  handHeld: false,
  setHandHeld: held => set({ handHeld: held }),
})

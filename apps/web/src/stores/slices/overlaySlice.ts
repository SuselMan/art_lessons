import type { StateCreator } from 'zustand'

/** The editor's one-at-a-time overlay modes (#393).
 *
 *  None of these is a `ToolType`: a ToolType travels inside StrokeOperation
 *  into the operation log, and eyedropper/ruler/transform either paint
 *  nothing at all (eyedropper, ruler) or produce an operation of their own
 *  kind (layer_transform) — same reasoning as the hand tool's in
 *  viewportSlice. They are modes laid *on top of* whichever drawing tool is
 *  selected, which is exactly why "what does the cursor look like right now"
 *  could never be answered from `tool` alone (see cursorController).
 *
 *  One union rather than three booleans because they genuinely exclude each
 *  other: all three take over the same canvas-pointer catcher slot, and the
 *  invariant used to be upheld by every toggle remembering to switch the
 *  other two off by hand. A union makes an impossible state unrepresentable
 *  instead of merely unreached.
 *
 *  The construction grid is deliberately NOT in here (see `gridActive`): it
 *  is a passive display toggle that coexists with any of these. */
export type OverlayMode = 'none' | 'eyedropper' | 'ruler' | 'transform'

export interface OverlaySlice {
  overlayMode: OverlayMode
  setOverlayMode: (updater: OverlayMode | ((prev: OverlayMode) => OverlayMode)) => void
  /** True once the ruler's initial placement drag has actually finished
   *  (pointerup) — deliberately not the same thing as `rulerLine !== null`,
   *  which already has a (degenerate) value from the very first pointerdown
   *  of that drag. See Room's `.rulerPlaceOverlay` render for why the
   *  catcher div's presence has to be gated on this and not on the line. */
  rulerPlaced: boolean
  setRulerPlaced: (placed: boolean) => void
  /** Construction grid (#89) — a passive display toggle: it never intercepts
   *  pointer events and never stops the current tool from painting, so it
   *  coexists with every `overlayMode` and (unlike them) leaves the cursor
   *  completely alone. */
  gridActive: boolean
  setGridActive: (updater: boolean | ((prev: boolean) => boolean)) => void
}

export const createOverlaySlice: StateCreator<OverlaySlice> = set => ({
  overlayMode: 'none',
  setOverlayMode: updater => set(state => ({
    overlayMode: typeof updater === 'function' ? updater(state.overlayMode) : updater,
  })),
  rulerPlaced: false,
  setRulerPlaced: placed => set({ rulerPlaced: placed }),
  gridActive: false,
  setGridActive: updater => set(state => ({
    gridActive: typeof updater === 'function' ? updater(state.gridActive) : updater,
  })),
})

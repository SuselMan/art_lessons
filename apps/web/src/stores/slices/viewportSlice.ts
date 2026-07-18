import type { StateCreator } from 'zustand'

import type { Viewport } from '../../pages/Room/useViewport'

export interface ViewportSlice {
  // useViewport.ts keeps its entire internal architecture (rAF-throttled
  // updates, a synchronous ref for hot gesture math, direct DOM transform
  // writes bypassing React) — only the target of its already-throttled
  // flush changes, from a local useState setter to this store's setViewport.
  viewport: Viewport
  setViewport: (updater: Viewport | ((prev: Viewport) => Viewport)) => void
}

export const createViewportSlice: StateCreator<ViewportSlice> = set => ({
  viewport: { cx: 0, cy: 0, zoom: 1, angle: 0 },
  setViewport: updater => set(state => ({
    viewport: typeof updater === 'function' ? updater(state.viewport) : updater,
  })),
})

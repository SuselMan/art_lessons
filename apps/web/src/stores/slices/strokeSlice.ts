import type { StateCreator } from 'zustand'

export interface StrokeSlice {
  // True from the engine's `strokeStart` to its matching `strokeEnd` — i.e.
  // only while *this* user is actually laying down a stroke. Peers' strokes
  // never set it: what it guards is the local hand holding the device.
  //
  // (#94) A hand resting on a tablet brushes the surrounding chrome (most
  // often the size slider) mid-stroke and corrupts settings partway through
  // drawing, so the chrome stops reacting to touches for the stroke's
  // duration. The UI stays fully visible — pointer-events only, unlike
  // uiHidden's fade.
  //
  // (#309) **Nothing in `Room` may select this field.** It flips twice per
  // stroke and Room is the heaviest component in the app; when this was a
  // `useState` inside Room, those two flips cost a median 55 ms (worst 99 ms)
  // between pen-down and the UI reacting, measured over 40 strokes on a Tab
  // S7+, plus a 60–85 ms dropped frame at every stroke start. The two
  // consumers are deliberately small and neither re-renders Room:
  //
  //   - Room *projects* it onto a `data-stroke-active` attribute on its own
  //     root via a store subscription (no React render involved), and CSS
  //     does the blocking from there — see `.strokeBlockable` in
  //     Room.module.css and FloatingToolPanel.module.css.
  //   - `ChiselAngleDial` selects it, because it genuinely has to unmount
  //     rather than be blocked, and CSS can't express that for a component
  //     that renders a fragment.
  //
  // A third consumer should join one of those two routes rather than adding
  // a selector in Room.
  strokeActive: boolean
  setStrokeActive: (active: boolean) => void
}

export const createStrokeSlice: StateCreator<StrokeSlice> = set => ({
  strokeActive: false,
  setStrokeActive: active => set({ strokeActive: active }),
})

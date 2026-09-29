import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { clamp } from 'lodash-es'

import { useDragToAdjust } from '../../lib/input/useDragToAdjust'
import { ZOOM_MAX, deviceNativeZoom, minZoom } from './viewport/cameraMath'
import type { Viewport } from './viewport/useViewport'

// (#329) Degrees of canvas rotation per pixel of vertical drag on the angle
// readout. Deliberately fine: the gesture has to be able to land on a specific
// angle (a horizon line, a construction axis), and a quarter turn is a click
// away regardless — so precision matters more here than reach.
const ROTATE_DEG_PER_PX = 0.5

export interface ZoomControlsDeps {
  vp: Viewport
  setVp: Dispatch<SetStateAction<Viewport>>
  infinite: boolean
}

/** (#493) The readouts' side of the camera: what "100%" means, the resets, and
 *  the drag-to-adjust gestures on the zoom and angle labels. Out of Room; the
 *  camera itself is useViewport's. */
export function useZoomControls({ vp, setVp, infinite }: ZoomControlsDeps) {
  // Infinite rooms measure "100%" against the device-native 1-world-unit-per-
  // physical-pixel scale rather than against `vp.zoom` directly — see
  // deviceNativeZoom's doc comment. Both the header readout and #362's toast
  // display and reset through these, so the two cannot drift into disagreeing
  // about what 100% means.
  const zoomBase = infinite ? deviceNativeZoom() : 1
  const zoomPercent = Math.round(vp.zoom / zoomBase * 100)
  const resetZoom = useCallback(() => {
    setVp(v => ({ ...v, zoom: zoomBase }))
  }, [setVp, zoomBase])
  // Both values at once, for the toast's single button — and only those two.
  // `fitCanvas` would also re-centre, which in minimal UI means the drawing
  // jumping out from under the fingers that just finished a gesture on it.
  const resetZoomAndRotation = useCallback(() => {
    setVp(v => ({ ...v, zoom: zoomBase, angle: 0 }))
  }, [setVp, zoomBase])

  // Drag up/down on the zoom label to adjust zoom without a two-finger pinch
  // (#97); a plain click still resets to 100%, mirroring angleLabel's
  // click-to-reset-rotation below.
  // Clamped to the same limits as the wheel/pinch gestures (see minZoom) —
  // this control writes vp.zoom directly, so a floor of its own would let a
  // drag reach a zoom no gesture can, which for an infinite room is the
  // per-frame tile cost #363 exists to bound.
  const zoomFloor = minZoom(infinite)
  const { onPointerDown: onZoomDragDown } = useDragToAdjust(
    vp.zoom,
    z => setVp(v => ({ ...v, zoom: clamp(z, zoomFloor, ZOOM_MAX) })),
    { min: zoomFloor, max: ZOOM_MAX, sensitivity: 0.01 },
  )

  // (#329) Rotation by the same drag gesture, on the angle readout — this
  // replaced the two rotate-by-15° buttons, which could only ever step. Worked
  // in degrees rather than radians so the sensitivity is a number that means
  // something: at 0.5°/px a quarter turn is a ~180px drag, and single degrees
  // are still individually reachable. Wrapping, not clamping: half a turn is
  // not a wall anyone rotating a sheet of paper expects to hit.
  const { onPointerDown: onAngleDragDown } = useDragToAdjust(
    vp.angle * 180 / Math.PI,
    deg => setVp(v => ({ ...v, angle: deg * Math.PI / 180 })),
    { min: 0, max: 360, sensitivity: ROTATE_DEG_PER_PX, wrap: true },
  )

  return { zoomPercent, resetZoom, resetZoomAndRotation, onZoomDragDown, onAngleDragDown }
}

import { useCallback, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { rgbToHex } from '../../lib/browser/color'
import { useRoomStore } from '../../stores/roomStore'
import { deviceNativeZoom } from './viewport/cameraMath'
import { clientToCanvas } from './viewport/pointerTransform'
import type { ColorCapableTool } from '../../lib/tools/toolSchemas'
import type { Viewport } from './viewport/useViewport'

export interface EyedropperDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  /** The camera the pointer is read through (Room's, from useViewport). */
  vp: Viewport
  handActive: boolean
  /** Writes a colour into a tool's slot — Room's, since it knows the shape
   *  swatch that decides which slot of a shape a colour lands in. */
  applyToolColor: (toolId: ColorCapableTool, value: [number, number, number]) => void
  /** The tool the picked colour goes to — see its own comment in Room. */
  pickedColorTool: ColorCapableTool
  addPaletteColor: (color: string) => void
}

/** (#493) The eyedropper (#82, #405) on the Room side: its one-shot pick
 *  from the canvas under the pointer, written into the tool the canvas is
 *  handed back to. */
export function useEyedropper({
  engineRef, vpRef, vp, handActive, applyToolColor, pickedColorTool, addPaletteColor,
}: EyedropperDeps) {
  const config = useRoomStore(s => s.room)
  const setTool = useRoomStore(s => s.setTool)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const addToPalette = useRoomStore(s => s.toolSettings.eyedropper.addToPalette) as boolean

  // Eyedropper (#82): consumes the next pointerdown on the canvas catcher
  // (armed only while eyedropperActive) instead of letting it reach the
  // canvas as a stroke. Deliberately NOT switched to clientToRoomPoint/
  // world-space for infinite rooms like the #143 overlays below —
  // engine.pickColor reads whatever's currently on *screen* (a
  // gl.readPixels off the real, already-camera-composited framebuffer, see
  // its own doc comment), not a layer's world-space content, so it needs
  // plain canvas-backing-pixel coordinates in both modes, not world ones.
  // For infinite rooms that's just the pointer's viewport offset scaled to
  // the DPR-sized backing store (the canvas fills the viewport with no CSS
  // pan transform of its own) — this used to go through clientToCanvas with
  // the PLACEHOLDER_INFINITE_CANVAS_SIZE placeholder config, a pre-existing
  // inaccuracy #143 explicitly left alone.
  const handleEyedropperPick = useCallback((e: React.PointerEvent) => {
    // (#405) The hand outranks the tool underneath it — the same precedence
    // resolveCursor states (rule 1) and the gizmo handles follow. With it up, a
    // press on the canvas moves the view; picking a colour instead would both
    // pan and switch tools out from under the drag.
    if (handActive) return
    e.preventDefault()
    const el = vpRef.current
    if (!el || !config) return
    const rect = el.getBoundingClientRect()
    const nz = deviceNativeZoom()
    const { x, y } = config.infinite
      ? { x: (e.clientX - rect.left) / nz, y: (e.clientY - rect.top) / nz }
      : clientToCanvas(
          e.clientX, e.clientY,
          { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle },
          config,
        )
    const engine = engineRef.current
    const picked = engine?.pickColor(x, y)
    if (picked) {
      // Writes the slot of the tool the canvas is being handed back to, not a
      // hardcoded 'pencil' — picking a color while the liner or marker was
      // selected used to silently repaint the pencil's swatch instead, so the
      // picked color never showed up in the stroke that followed. See
      // pickedColorTool for the eraser/smudge case, which owns no color.
      applyToolColor(pickedColorTool, picked)
      // (#405) The eyedropper's one schema field, wired at last. It has been
      // in TOOL_SCHEMAS since #196 with nothing behind it, which was tolerable
      // only because the eyedropper was a mode and its settings never reached
      // a panel — now that it is a tool, selecting it puts this toggle on
      // screen, and a control that provably does nothing is worse than no
      // control (the same rule keepProportions is hidden under in Distort).
      if (addToPalette) addPaletteColor(rgbToHex(picked))
      // (#405) The eyedropper is the one tool with a one-shot gesture: taking
      // a colour is the whole of it, so it hands the canvas straight back to
      // the drawing tool that was in hand rather than staying armed and making
      // the next stroke a second pick. `drawingTool` and not `lastDrawingTool`
      // deliberately — if the eraser was what you were using, the eraser is
      // what you get back.
      setTool(drawingTool)
      // (#542) No longer opens the full picker on top of the drawing. It used
      // to switch the side panel to its Color tab, which was passive — the tab
      // either was already in view or was not. The flyout that replaced that
      // tab is a popover over the canvas, and throwing one up after every pick
      // is a different thing entirely. It costs nothing to drop: the colour is
      // already in the well, and the well is one press away from anywhere,
      // which is exactly what giving it a fixed home bought.
    }
    // `applyToolColor`, not `setToolSetting`: the former is what this actually
    // calls, and it closes over `shapeSwatch`. Listing the setter instead left
    // a stale copy here — with a shape in hand and the fill selected, a pick
    // taken after the swatch was switched wrote the field the swatch used to
    // point at.
  }, [vpRef, vp, config, handActive, applyToolColor, pickedColorTool, setTool, drawingTool, addToPalette, addPaletteColor, engineRef])

  return handleEyedropperPick
}

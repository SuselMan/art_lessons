import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'

import type { ColorFlyoutContent, ColorPairControls } from '../../components/ColorFlyout'
import type { PencilEngineAPI } from '../../engine'
import { useT } from '../../i18n'
import { useRoomStore } from '../../stores/roomStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { colorWellState, effectiveSwatch } from './tools/colorWell'
import {
  getToolColor, isColorCapableTool, isShapeTool, toolColorField, type ColorCapableTool,
} from '../../lib/tools/toolSchemas'

export interface ToolColorDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** Bumped when a new engine exists to sync to — see engineEpoch in Room. */
  engineEpoch: number
  /** The palette's add/remove requests go to the server; it is the only writer. */
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
}

/** (#493) Every colour control in the room, resolved once: whose colour the
 *  picker, the palette, the wells and the eyedropper edit; the colour the
 *  engine draws the next stroke with; what the well shows, with the shape's
 *  stroke/fill pair; the room palette; and where the one colour flyout hangs.
 *  What the well *looks* like is colorWell.ts; this is the state around it.
 *
 *  Out of Room as one piece because the #542 item of the release track — one
 *  way to show and change a tool's colour — is a change to exactly this set,
 *  and it used to sit in three stretches of the component with the tool
 *  groups and the owner's controls between them. */
export function useToolColor({ engineRef, engineEpoch, socketRef }: ToolColorDeps) {
  const t = useT()
  const tool = useRoomStore(s => s.tool)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const lastDrawingTool = useRoomStore(s => s.lastDrawingTool)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const shapeSwatch = useRoomStore(s => s.shapeSwatch)
  const setShapeSwatch = useRoomStore(s => s.setShapeSwatch)

  // Which tool's own color field the "Color" SidePanel tab, the palette
  // swatches, FloatingToolPanel's color dot and the eyedropper all read and
  // write — lastDrawingTool rather than `tool` directly, so it still reflects
  // liner/marker while eraser/smudge is briefly active on top of it, same
  // reasoning as lastDrawingTool itself (see toolSlice.ts). Typed as
  // ColorCapableTool (toolSchemas.ts), the capability these consumers
  // actually depend on — not re-listing pencil/liner/marker by hand here.
  //
  // (#453) The fill broke the "always a drawing tool" assumption: it owns a
  // colour and is not a DrawingTool, so falling through to `lastDrawingTool`
  // pointed every colour control at the pencil while the bucket was in hand —
  // the picker moved a swatch and the next fill came out the old colour. The
  // question this answers is "whose colour am I editing", so it asks the
  // capability (isColorCapableTool) of the tool actually selected, and only
  // falls back for the tools that own no colour at all.
  // (#529) Choosing a colour also switches that swatch back on.
  //
  // Only the shapes have a swatch to switch on, and this is the whole of what
  // "off" means for them — an explicit absence, not a transparent colour. A
  // person who reaches for the palette with an empty fill selected is asking
  // for a fill; making them press the crossed-out circle again first would be
  // an extra step whose only outcome is the one they already chose (Ilya,
  // 05.09).
  //
  // (#542) Through `effectiveSwatch`, not the stored one: with a line in hand
  // and the fill selected the stored value names a colour the tool cannot draw,
  // and a pick landing there would vanish without a trace.
  const applyToolColor = useCallback((toolId: ColorCapableTool, value: [number, number, number]) => {
    const settings = useRoomStore.getState().toolSettings
    const swatch = effectiveSwatch(settings, toolId, shapeSwatch)
    setToolSetting(toolId, toolColorField(toolId, swatch), value)
    if (isShapeTool(toolId)) setToolSetting(toolId, swatch === 'fill' ? 'fillOn' : 'strokeOn', true)
  }, [setToolSetting, shapeSwatch])

  const colorTool: ColorCapableTool = isColorCapableTool(tool) ? tool : lastDrawingTool
  const colorToolColor = getToolColor(toolSettings, colorTool, effectiveSwatch(toolSettings, colorTool, shapeSwatch))
  // (#405) Where a picked colour lands: the tool the eyedropper hands the
  // canvas back to, if that tool owns a colour at all. The issue asks for the
  // colour to be written "into the tool you returned to" — for the eraser or
  // smudge there is no such field, so it falls through to `colorTool`, the
  // same slot the picker and the palette are already editing, rather than
  // being silently dropped. Deliberately the same expression `activeColor`
  // below feeds the engine, so the swatch that lights up is the colour the
  // next stroke will actually use.
  const pickedColorTool: ColorCapableTool = isColorCapableTool(drawingTool) ? drawingTool : colorTool
  // Which shape the picker takes is a per-person preference, so it comes from
  // settingsStore, not the room store — the latter is wiped on every Room
  // mount (#337).
  const colorPickerMode = useSettingsStore(s => s.colorPickerMode)
  const setColorPickerMode = useSettingsStore(s => s.setColorPickerMode)
  // Falls back to colorTool's color for eraser/smudge, which have no color
  // field of their own — the engine keeps one current color regardless of
  // which tool is active, so it should already hold what the next drawing
  // stroke will use.
  const activeColor = getToolColor(toolSettings, pickedColorTool, effectiveSwatch(toolSettings, pickedColorTool, shapeSwatch))
  useEffect(() => { engineRef.current?.setColor(activeColor) }, [activeColor, engineEpoch, engineRef])

  // ── the colour well (#542) ──────────────────────────────────────────────────
  //
  // One glyph and one flyout serve every tool, so what the well shows is
  // resolved once — in colorWell.ts, which is also the only part of this
  // reachable from a unit test — instead of being assembled again at each
  // surface that shows a colour.
  //
  // `colorTool` already falls back to the last drawing tool for the eraser and
  // the smudge, so the well is never empty and never disabled: with a rubber in
  // hand it shows — and edits — the colour the next stroke will use. That is
  // the same slot the picker has always been editing in that state; what
  // changes is only that it is now visible instead of one tab away.
  const well = colorWellState(toolSettings, colorTool, shapeSwatch)
  const wellLabel = well.pair
    ? t(well.pair.active === 'fill' ? 'room.shape.fill' : 'room.shape.stroke')
    : t('room.panel.color')

  const swapShapeColors = useCallback(() => {
    // Trades the colours themselves, not which one is selected — the same
    // thing X does in every other editor, and the reason it is a swap rather
    // than two edits is that the pair is what the user is looking at.
    const settings = useRoomStore.getState().toolSettings
    const stroke = getToolColor(settings, 'shape', 'stroke')
    const fill = getToolColor(settings, 'shape', 'fill')
    const strokeOn = settings.shape.strokeOn !== false
    const fillOn = settings.shape.fillOn === true
    setToolSetting('shape', 'strokeColor', fill)
    setToolSetting('shape', 'fillColor', stroke)
    setToolSetting('shape', 'strokeOn', fillOn)
    setToolSetting('shape', 'fillOn', strokeOn)
  }, [setToolSetting])

  const toggleActiveShapeSwatch = useCallback(() => {
    const settings = useRoomStore.getState().toolSettings
    const swatch = effectiveSwatch(settings, 'shape', useRoomStore.getState().shapeSwatch)
    const key = swatch === 'fill' ? 'fillOn' : 'strokeOn'
    setToolSetting('shape', key, settings.shape[key] === false)
  }, [setToolSetting])

  const colorPair: ColorPairControls | undefined = well.pair ? {
    ...well.pair,
    onSelect: setShapeSwatch,
    onSwap: swapShapeColors,
    onToggleActive: toggleActiveShapeSwatch,
  } : undefined

  // (#190 epic) Room palette — see roomSlice's own doc comment for why this
  // is a plain setter, not a reducer. Add/remove requests round-trip through
  // the server (dedup lives there, see rooms.ts's addPaletteColor) rather
  // than being applied optimistically here — palette_updated is the only
  // thing that ever actually writes this store field.
  const palette = useRoomStore(s => s.palette)
  const addPaletteColor = useCallback((color: string) => {
    socketRef.current?.emit('palette_add_color', { color })
  }, [socketRef])
  const removePaletteColor = useCallback((color: string) => {
    socketRef.current?.emit('palette_remove_color', { color })
  }, [socketRef])

  // Everything the colour surface needs, built once and handed to whichever
  // presentation is up — the popover, or the same body pinned in the panel.
  // One object rather than two prop lists, so the two can never drift apart.
  const colorContent: ColorFlyoutContent = {
    value: colorToolColor,
    onChange: v => applyToolColor(colorTool, v),
    mode: colorPickerMode,
    onModeChange: setColorPickerMode,
    palette,
    onAddPaletteColor: addPaletteColor,
    onRemovePaletteColor: removePaletteColor,
    pair: colorPair,
  }

  // (#542) "Go refine this further than a tap on the well allows." Which well
  // it opens from is the whole of the state: 'rail' is the one pinned at the
  // top of the tool bar, 'panel' the one in the middle of the floating panel.
  //
  // This used to be `setUiHidden(false); setActivePanel('color')` — bringing
  // the whole chrome back was load-bearing, because the picker lived in a tab
  // of a strip that minimal UI fades out. A flyout that hangs off the well
  // that opened it needs none of that: the surface goes where the colour
  // already is, in either chrome state, which is the point of the well having
  // a fixed home in each.
  const [colorFlyoutAt, setColorFlyoutAt] = useState<'rail' | 'panel' | null>(null)
  const railWellRef = useRef<HTMLButtonElement>(null)
  const panelWellRef = useRef<HTMLButtonElement>(null)
  const closeColorFlyout = useCallback(() => setColorFlyoutAt(null), [])
  /** What pressing a colour well in the chrome does: the popover, always. The
   *  side panel's Color tab shows the same surface and is always there too, but
   *  it is a second route rather than a mode this has to branch on — a press on
   *  the well means "the colour, here, now", and answering it by scrolling a
   *  panel into view somewhere else would be a different answer to a different
   *  question (Ilya, 10.09). */
  const openRailColorSurface = useCallback(() => {
    setColorFlyoutAt(at => (at === 'rail' ? null : 'rail'))
  }, [])
  // A colour swatch in the full settings tab opens the *rail's* surface, not
  // one chasing the swatch that was pressed: that tab is only ever on screen
  // beside the rail, and one surface in one fixed place beats a popover that
  // follows whichever copy of a swatch was clicked. Which field was pressed
  // still matters — it points the surface at that colour first, so a shape's
  // fill swatch edits the fill rather than whichever of the two was last
  // selected.
  const expandColorField = useCallback((key: string) => {
    if (key === 'strokeColor') setShapeSwatch('stroke')
    if (key === 'fillColor') setShapeSwatch('fill')
    openRailColorSurface()
  }, [setShapeSwatch, openRailColorSurface])

  // The floating panel's well opens the same flyout, hung off itself.
  const openPanelColorSurface = useCallback(() => setColorFlyoutAt('panel'), [])

  return {
    applyToolColor, colorTool, pickedColorTool, well, wellLabel, colorPair, palette, addPaletteColor,
    colorContent, colorFlyoutAt, openPanelColorSurface, railWellRef, panelWellRef, closeColorFlyout,
    openRailColorSurface, expandColorField,
  }
}

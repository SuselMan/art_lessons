import { useEffect, useRef } from 'react'

import { isModalOpen } from '../../../components/Modal/modalSlot'
import { browserZoomIntent, matchesHotkey, type HotkeyBinding } from '../../../lib/input/hotkeys'
import { isDismissLayerOpen } from '../../../lib/input/useDismissOnOutside'
import { useClipboardStore } from '../../../stores/clipboardStore'
import { useRoomStore } from '../../../stores/roomStore'
import type { DrawingTool, EditorTool } from '../../../stores/slices/toolSlice'
import { ZOOM_KEY_STEP } from '../viewport/cameraMath'
import { editorOwnsKey, isTypingTarget } from './editorKeys'
import { stepEnumOption, stepLinerSize, toolGradeOptions, toolSizeRange } from './toolSchemas'

type SetToolSetting = ReturnType<typeof useRoomStore.getState>['setToolSetting']

/** Everything a keypress can read or do, gathered by Room each render.
 *  What the store owns outright (the open shape, the lasso, the selection,
 *  the clipboard) is read from it at the keypress instead. */
export interface EditorKeyContext {
  tool: EditorTool
  /** The drawing tool the non-drawing ones hand back to — see toolSlice. */
  drawingTool: DrawingTool
  hotkeys: Record<string, HotkeyBinding>
  /** Whether a transform session is open — asked at the keypress, because
   *  the session lives in a ref and opens and closes without a render. */
  isTransformOpen: () => boolean
  /** Whether the transform tool may be picked up — something to transform,
   *  or it is already in hand (see the key's own comment). */
  transformAvailable: boolean
  commitTransform: () => void
  resetTransform: () => void
  commitShape: () => void
  cancelShape: () => void
  finishSelection: (points: number[]) => void
  cancelLasso: () => void
  clearSelection: () => void
  copySelection: () => void
  cutSelection: () => void
  pasteClipboard: () => void
  deleteSelectionContents: () => void
  undo: () => void
  redo: () => void
  zoomBy: (factor: number) => void
  resetZoom: () => void
  /** Turns the view by `radians`; `null` puts it back upright. */
  rotateView: (radians: number | null) => void
  toggleTool: (tool: EditorTool) => void
  setTool: (tool: EditorTool) => void
  setToolSetting: SetToolSetting
}

/** (#493) One keypress the editor owns, routed. Out of Room's keydown effect,
 *  as a function of the event and a context, so the order below — which is
 *  the whole design — can be tested without a page.
 *
 *  The order is precedence: an open gesture (a transform session, a shape, a
 *  lasso) owns Enter and Esc outright, the platform's clipboard keys come
 *  next and only when there is something for them to act on, and the
 *  rebindable registry (#174, lib/input/hotkeys.ts) comes last. */
export function handleEditorKey(e: KeyboardEvent, ctx: EditorKeyContext): void {
  // (#405) Enter and Esc end an open transform session — apply and cancel.
  // Handled here rather than in the registry below because they are not
  // rebindable (see lib/input/hotkeys.ts on why), and checked before the bindings
  // so a rebind can never shadow the only two keys that close a session.
  //
  // Cancel throws the accumulated matrix away whole. Nothing was committed
  // while the session was open, so this leaves no trace on the undo stack
  // either — there is nothing to take back, which is the same reason
  // Ctrl+Z behaves as Esc here (see handleUndo).
  if (ctx.isTransformOpen()) {
    if (e.key === 'Enter') { ctx.commitTransform(); e.preventDefault(); return }
    if (e.key === 'Escape') { ctx.resetTransform(); e.preventDefault(); return }
  }
  // (#530) An open shape answers the same two keys the same way, and for
  // the same reason it is unbindable: Enter and Esc are the platform's
  // confirm and cancel, and an unconfirmed shape must always have a way to
  // be finished or abandoned. Esc leaves no trace on the undo stack —
  // nothing was ever committed.
  if (useRoomStore.getState().shapeFrame) {
    if (e.key === 'Enter') { ctx.commitShape(); e.preventDefault(); return }
    if (e.key === 'Escape') { ctx.cancelShape(); e.preventDefault(); return }
  }
  // (#446) The selection's own three unbindable keys, in the same place
  // and for the same reason as the two above: Enter and Esc are the
  // platform's confirm and cancel, and a rebind able to move them could
  // leave a half-drawn lasso with no way to finish or abandon it.
  //
  // Ordered before the clipboard keys below because an open lasso is a
  // gesture in progress, and a gesture in progress owns Enter and Esc
  // outright.
  const openLasso = useRoomStore.getState().pendingSelection
  if (openLasso) {
    if (e.key === 'Enter') { ctx.finishSelection(openLasso); e.preventDefault(); return }
    if (e.key === 'Escape') { ctx.cancelLasso(); e.preventDefault(); return }
  }
  if (e.key === 'Escape' && useRoomStore.getState().selection) {
    ctx.clearSelection()
    e.preventDefault()
    return
  }
  // Cut/copy/paste and Delete. Not in the hotkey registry either: these
  // are the platform's own clipboard keys, the same ones every text field
  // in this app already answers to, and rebinding Ctrl+C to something else
  // is not a thing a drawing app should offer.
  //
  // The clipboard keys act only when there is something for them to act on
  // — no selection, no interception — so a page-level copy of, say, a room
  // link is never swallowed by the canvas.
  const modKey = e.ctrlKey || e.metaKey
  if (modKey && !e.shiftKey && !e.altKey) {
    const key = e.key.toLowerCase()
    if ((key === 'c' || key === 'x') && useRoomStore.getState().selection) {
      e.preventDefault()
      if (key === 'c') ctx.copySelection()
      else ctx.cutSelection()
      return
    }
    // (#521) The meta, not the raster — the same synchronous "is there
    // anything to paste" the button reads, so Ctrl+V is decided without
    // touching IndexedDB and a page-level paste is swallowed on exactly
    // the same condition the UI shows.
    if (key === 'v' && useClipboardStore.getState().meta) {
      e.preventDefault()
      ctx.pasteClipboard()
      return
    }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && useRoomStore.getState().selection) {
    e.preventDefault()
    ctx.deleteSelectionContents()
    return
  }
  const { tool, drawingTool, toggleTool, setToolSetting } = ctx
  const is = (actionId: string) => {
    const binding = ctx.hotkeys[actionId]
    return !!binding && matchesHotkey(e, binding)
  }
  if (is('undo')) { ctx.undo(); e.preventDefault(); return }
  if (is('redo')) { ctx.redo(); e.preventDefault(); return }
  // (#440) Zoom is settled here, ahead of every other action, because two
  // things have to happen on the same press: our camera moves, and the
  // browser's own page zoom does not. Missing the preventDefault doesn't
  // merely lose a shortcut — it scales the whole editor, canvas and UI
  // together, which is the one thing a drawing app must not do by accident.
  if (is('zoomIn'))  { e.preventDefault(); ctx.zoomBy(ZOOM_KEY_STEP); return }
  if (is('zoomOut')) { e.preventDefault(); ctx.zoomBy(1 / ZOOM_KEY_STEP); return }
  if (is('zoomReset')) { ctx.resetZoom(); return }
  // The same press spelled any of the other ways the browser accepts it —
  // Shift+'=', the numpad, or the '+'/'-' keys of a non-US layout, which
  // sit at physical positions our `code`-based bindings never name (see
  // browserZoomIntent). Not rebindable and not in the registry on purpose:
  // unbinding these would not free the keys, it would hand them back to
  // the browser, which is exactly what this is here to stop.
  const zoomIntent = browserZoomIntent(e)
  if (zoomIntent) {
    e.preventDefault()
    ctx.zoomBy(zoomIntent === 'in' ? ZOOM_KEY_STEP : 1 / ZOOM_KEY_STEP)
    return
  }
  // (#520) Ahead of `toggleEraser` because it is the more specific press on
  // the same key — the two can't actually collide (matchesHotkey compares
  // `shiftKey` exactly, so E and Shift+E are different bindings, and both
  // stay different after a rebind or this would be reachable only by
  // accident), but reading the specific one first is how the rest of this
  // handler is ordered and the one that survives someone rebinding these
  // two onto the same combo.
  //
  // Not a plain flip of the setting: with a pencil in hand that would be a
  // key that appears to do nothing, since the switch it moves only exists
  // in the quick column while the eraser is selected. So a press from
  // another tool means "give me the eraser that goes through layers" — it
  // takes the eraser and turns the mode on — and once the eraser is in
  // hand the same key flips the mode, which is the toggle it says it is.
  // Turning it *off* is therefore always one press, never two.
  if (is('eraseThroughLayers')) {
    if (tool === 'eraser') setToolSetting('eraser', 'throughLayers', prev => !prev)
    else { ctx.setTool('eraser'); setToolSetting('eraser', 'throughLayers', true) }
    return
  }
  if (is('toggleEraser')) { toggleTool('eraser'); return }
  if (is('toggleSmudge')) { toggleTool('smudge'); return }
  if (is('toggleCharcoal')) { toggleTool('charcoal'); return }
  if (is('toggleLiner')) { toggleTool('liner'); return }
  if (is('toggleMarker')) { toggleTool('marker'); return }
  if (is('toggleBrushPen')) { toggleTool('brushPen'); return }
  if (is('toggleWatercolor')) { toggleTool('watercolor'); return }
  if (is('toggleDigitalBrush')) { toggleTool('digitalBrush'); return }
  // (#405) The four that used to be modes, selected through the same
  // registry and the same toggle-off-to-your-drawing-tool rule as the rest.
  if (is('toggleEyedropper')) { toggleTool('eyedropper'); return }
  if (is('toggleRuler')) { toggleTool('ruler'); return }
  // Selectable only with something to transform (the toolbar button is
  // `disabled` on the same condition), but always *de*selectable: making
  // the active layer the background empties the selection, and a key that
  // refused to let go there would leave the canvas locked with no gizmo on
  // it and no obvious way out.
  if (is('toggleTransform')) {
    if (ctx.transformAvailable) toggleTool('transform')
    return
  }
  // (#446) Selectable with nothing selected — unlike transform, the whole
  // point of this tool is to *make* a selection, so there is no
  // precondition to check.
  if (is('toggleSelection')) { toggleTool('selection'); return }
  if (is('toggleGrid')) { toggleTool('grid'); return }
  if (is('resetRotation')) { ctx.rotateView(null); return }
  // (#443) The same toggle-off-to-your-drawing-tool rule as every other
  // tool key, replacing a boolean of its own. `H` used to flip a modifier;
  // now pressing it twice puts back what you were drawing with, which is
  // what the other eight keys here already do.
  if (is('toggleHand')) { toggleTool('hand'); return }
  // Both size hotkeys clamp to the tool's own schema range (toolSizeRange)
  // rather than to literals — see its comment for why (#336).
  // (#405) `drawingTool`, not the selection: with the ruler in hand there
  // is no size to step, and silently resizing the pencil behind it would
  // be a key that appears to do nothing. Sizing the tool you will go back
  // to is the useful reading of the same press.
  if (is('decreaseSize')) {
    // Liner's own 'size' field is a fixed-label enum (ADR 003), not the
    // plain px number every other tool's 'size' field holds (marker
    // included) — step through the ladder instead of subtracting 1.
    if (drawingTool === 'liner') setToolSetting('liner', 'size', prev => stepLinerSize(prev as string, -1))
    else {
      const range = toolSizeRange(drawingTool)
      if (range) setToolSetting(drawingTool, 'size', prev => Math.max(range.min, (prev as number) - 1))
    }
    return
  }
  if (is('increaseSize')) {
    if (drawingTool === 'liner') setToolSetting('liner', 'size', prev => stepLinerSize(prev as string, 1))
    else {
      const range = toolSizeRange(drawingTool)
      if (range) setToolSetting(drawingTool, 'size', prev => Math.min(range.max, (prev as number) + 1))
    }
    return
  }
  if (is('rotateCCW')) { ctx.rotateView(-Math.PI / 12); return }
  if (is('rotateCW')) { ctx.rotateView(Math.PI / 12); return }
  // (#440) One notch along the 6H..6B ladder, replacing the five keys that
  // jumped to five hand-picked grades. `drawingTool` and no `setTool`, for
  // the same reason the size keys above use it: with the ruler or the
  // eraser in hand this prepares the pencil you are about to go back to
  // rather than yanking it out mid-gesture. Silently does nothing for a
  // tool with no hardness at all (charcoal picks a stick, not a grade —
  // see toolGradeOptions), which is the honest answer to "harder" there.
  if (is('gradeHarder') || is('gradeSofter')) {
    const grades = toolGradeOptions(drawingTool)
    if (grades) {
      const direction = is('gradeSofter') ? 1 : -1
      setToolSetting(drawingTool, 'grade', prev => stepEnumOption(grades, String(prev), direction))
    }
    return
  }
}

/** (#174/#493) The editor's keyboard: one listener on `window` for the life
 *  of the page, routing every keypress the editor owns to handleEditorKey.
 *
 *  Installed once and fed the latest context through a ref, rather than
 *  re-installed whenever any of the dozen callbacks in it changes identity —
 *  which, with the context rebuilt on every render, would be every render. */
export function useEditorHotkeys(ctx: EditorKeyContext): void {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // (#310/#405) Who owns this keypress — see editorKeys.ts for the whole
      // precedence and why each layer outranks the canvas. This listener is on
      // `window` in the bubble phase, so a key pressed inside a dialog or a
      // dropdown reaches it too; without the check, typing in a dialog would
      // still be switching tools behind it.
      if (!editorOwnsKey({
        defaultPrevented: e.defaultPrevented,
        modalOpen: isModalOpen(),
        typing: isTypingTarget(e.target),
        popoverOpen: isDismissLayerOpen(),
      })) return
      handleEditorKey(e, ctxRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../../lib/browser/roomStorage'
import { DRAWING_TOOLS, type DrawingTool, type EditorTool } from '../../../stores/slices/toolSlice'

/** (#682) The tools a room re-entered on this device may open with — what
 *  someone was working *with*, as opposed to a step they were half-way
 *  through. The eyedropper, the transform gizmo, the selection, the hand, the
 *  ruler and the grid are gestures on top of the work: coming back to a room
 *  with a gizmo armed, or with a hand that pans instead of drawing, reads as a
 *  broken editor rather than a remembered one — the same judgement #391 made
 *  about the transform tool's own mode. The annotation tools are left out for
 *  a different reason: they belong to the annotation mode, which is not
 *  restored, and a pen of that set outside it has nowhere to draw. */
const RESTORABLE_TOOLS: readonly EditorTool[] = [...DRAWING_TOOLS, 'fill', 'shape']

interface StoredSelectedTool {
  selectedTool: string
  drawingTool: string
}

export interface RememberedTool {
  tool: EditorTool
  /** What the engine is configured from while `tool` names the fill or a
   *  shape — kept too, so the room does not reopen with the fill in hand and a
   *  pencil behind it that nobody chose. */
  drawingTool: DrawingTool | null
}

function asRestorable(value: unknown): EditorTool | null {
  return RESTORABLE_TOOLS.find(tool => tool === value) ?? null
}

function asDrawingTool(value: unknown): DrawingTool | null {
  return DRAWING_TOOLS.find(tool => tool === value) ?? null
}

/** Which tool this device had in hand in this room last time — null if none
 *  was stored or the stored one is not restorable (a name from an older build,
 *  or a tool that stopped being restorable).
 *
 *  Nothing here asks whether the room still offers it — the room's toolset is
 *  not known before `room_state` arrives. `useToolChoice`'s toolset effect
 *  answers that, the same way it does for a tool withdrawn mid-session. */
export function loadSelectedTool(storage: KeyValueStorage, roomId: string): RememberedTool | null {
  const stored = readRoomSettings<Partial<StoredSelectedTool>>(storage, roomId)
  const tool = asRestorable(stored?.selectedTool)
  if (!tool) return null
  return { tool, drawingTool: asDrawingTool(stored?.drawingTool) }
}

/** Stores only restorable tools: picking up the eyedropper for a moment must
 *  not make the room forget the brush it was picked up from. */
export function saveSelectedTool(
  storage: KeyValueStorage, roomId: string, tool: EditorTool, drawingTool: DrawingTool,
): void {
  if (!asRestorable(tool)) return
  writeRoomSettings<StoredSelectedTool>(storage, roomId, { selectedTool: tool, drawingTool })
}

import type { ToggleableTool } from '@grafetto/shared'
import { isToolEnabledInRoom, TOOLSET_MATERIAL_TOOLS } from '@grafetto/shared'

import { PRIMARY_DRAWING_TOOLS, type EditorTool, type PrimaryDrawingTool } from '../../../stores/slices/toolSlice'

type EnabledTools = readonly ToggleableTool[] | undefined

/** (#548) Where a hand goes when what it was holding stops being offered. The
 *  first material the room still has — never the first *tool*, which could be
 *  the ruler, i.e. a hand that cannot draw. A toolset always keeps one material
 *  (sanitizeEnabledTools refuses the ones that don't), so this cannot come up
 *  empty; the pencil is the fallback for the unrestricted room. */
export function fallbackToolFor(enabledTools: EnabledTools): EditorTool {
  return enabledTools?.find(candidate => TOOLSET_MATERIAL_TOOLS.includes(candidate)) ?? 'pencil'
}

/** (#544) What the rail's one drawing button wears and what a plain tap takes.
 *  It follows `lastDrawingTool` — the last *material* in hand — so the rail
 *  cannot disagree with the hand. The fallback covers the one case that can: a
 *  room whose toolset no longer offers what this person last drew with (#548).
 *  The button then shows what the room does offer rather than a material it
 *  has withdrawn. */
export function drawingGroupToolFor(lastDrawingTool: PrimaryDrawingTool, enabledTools: EnabledTools): PrimaryDrawingTool {
  if (isToolEnabledInRoom(enabledTools, lastDrawingTool)) return lastDrawingTool
  return PRIMARY_DRAWING_TOOLS.find(candidate => isToolEnabledInRoom(enabledTools, candidate)) ?? 'pencil'
}

/** The hotkey toggle: a second press of the key for the tool already in hand
 *  goes back to the tool that was being drawn with — or, (#548) when that one
 *  has since been switched off, to the fallback. `drawingTool` remembers what
 *  was drawn with, not what is still on the desk. */
export function toggledTool(
  prev: EditorTool, next: EditorTool, drawingTool: EditorTool, enabledTools: EnabledTools,
): EditorTool {
  if (prev !== next) return next
  return isToolEnabledInRoom(enabledTools, drawingTool) ? drawingTool : fallbackToolFor(enabledTools)
}

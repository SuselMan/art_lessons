// Which tools the floating panel's two slots can hold, and what each one
// looks like. A data registry rather than markup, and its own module rather
// than a block at the top of index.tsx for two reasons: the guard below is a
// function, and a component file that exports one loses Fast Refresh; and
// this is exactly the shape colorFlyout.ts already established next door —
// the panel's non-rendering knowledge lives beside it, not inside it.

import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'

/** The material-laying tools that can occupy the top slot, in the order its
 *  fan lays them out. Structurally the same set as toolSlice.ts's
 *  PrimaryDrawingTool, but written out here rather than imported: nothing
 *  under components/ imports from stores/, and this panel is a presentational
 *  component that shouldn't be the first to.
 *
 *  The type below is derived from this list rather than declared beside it, so
 *  adding a tool — charcoal was #304 — is one edit here plus whatever the
 *  compiler then demands (TOOL_DISPLAY is a total Record over it, so a tool
 *  with no icon or label is a typecheck error, not a blank button). */
export const FLOATING_PRIMARY_TOOLS = ['pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor'] as const

export type FloatingPrimaryTool = (typeof FLOATING_PRIMARY_TOOLS)[number]

/** The tools that can occupy the bottom slot — toolSlice.ts's SecondaryTool,
 *  mirrored here for the same reason the list above is. They work on marks
 *  already down rather than laying new ones; see that type's own comment for
 *  why the eyedropper belongs with the eraser and the smudge despite painting
 *  nothing at all. */
export const FLOATING_SECONDARY_TOOLS = ['eraser', 'smudge', 'eyedropper'] as const

export type FloatingSecondaryTool = (typeof FLOATING_SECONDARY_TOOLS)[number]

/** Everything either slot can hold. The panel highlights a slot only when the
 *  tool really in hand is one of these — a ruler or a transform gizmo lights
 *  neither, which is the honest answer and not the one the panel used to give
 *  (it folded every non-eraser into the drawing slot, so the pencil button lit
 *  up while the ruler was selected). */
export type FloatingPanelTool = FloatingPrimaryTool | FloatingSecondaryTool

const FLOATING_PANEL_TOOLS: readonly string[] = [...FLOATING_PRIMARY_TOOLS, ...FLOATING_SECONDARY_TOOLS]

/** Narrows an arbitrary editor tool to the ones this panel can show as
 *  selected, so Room does not have to keep its own copy of the list to decide
 *  what to pass as `tool`. */
export function isFloatingPanelTool(tool: string): tool is FloatingPanelTool {
  return FLOATING_PANEL_TOOLS.includes(tool)
}

interface ToolFace { icon: IconName; labelKey: TranslationKey }

/** Icon + label per tool — the same icon each tool's own left-toolbar button
 *  already uses (Room/index.tsx), so the floating panel and the toolbar never
 *  disagree about what a tool "looks like". A total Record over both lists
 *  above, which is what makes an unfaced tool fail to compile. */
export const TOOL_DISPLAY: Record<FloatingPanelTool, ToolFace> = {
  pencil: { icon: 'edit', labelKey: 'tool.pencil' },
  charcoal: { icon: 'charcoal', labelKey: 'tool.charcoal' },
  liner: { icon: 'stylus', labelKey: 'tool.liner' },
  marker: { icon: 'ink_highlighter', labelKey: 'tool.marker' },
  brushPen: { icon: 'brush', labelKey: 'tool.brushPen' },
  watercolor: { icon: 'water_drop', labelKey: 'tool.watercolor' },
  eraser: { icon: 'ink_eraser', labelKey: 'tool.eraser' },
  smudge: { icon: 'smudge', labelKey: 'tool.smudge' },
  eyedropper: { icon: 'colorize', labelKey: 'tool.eyedropper' },
}

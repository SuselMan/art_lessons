// Which tools the floating panel can hold, and what each one looks like. A
// data registry rather than markup, and its own module rather than a block at
// the top of index.tsx for two reasons: the guard below is a function, and a
// component file that exports one loses Fast Refresh; and this is exactly the
// shape colorFlyout.ts already established next door — the panel's
// non-rendering knowledge lives beside it, not inside it.
//
// (slots.ts is the other half of that knowledge: this file says which tools
// exist for the panel and how they are drawn, that one says what a slot can
// hold and where the slots are.)

import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'

/** The material-laying tools, in the order the chooser lays them out.
 *  Structurally the same set as toolSlice.ts's PrimaryDrawingTool, but written
 *  out here rather than imported: nothing under components/ imports from
 *  stores/, and this panel is a presentational component that shouldn't be the
 *  first to.
 *
 *  Still named as a set of its own even though every slot can now hold any
 *  tool, because the `drawing` role resolves into exactly this set — it is
 *  what "whichever one I was last drawing with" ranges over. */
export const FLOATING_PRIMARY_TOOLS = ['pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor'] as const

export type FloatingPrimaryTool = (typeof FLOATING_PRIMARY_TOOLS)[number]

/** The tools that work on marks already down — toolSlice.ts's SecondaryTool,
 *  mirrored here for the same reason the list above is, and the range of the
 *  `secondary` role. See that type's own comment for why the eyedropper
 *  belongs with the eraser and the smudge despite painting nothing at all. */
export const FLOATING_SECONDARY_TOOLS = ['eraser', 'smudge', 'eyedropper'] as const

export type FloatingSecondaryTool = (typeof FLOATING_SECONDARY_TOOLS)[number]

/** The tools that are neither: they neither lay material nor work on material
 *  already laid, and no role ranges over them — a slot holds one of these only
 *  because someone put it there.
 *
 *  This is where the panel stopped being a shortcut to two of the toolbar's
 *  buttons and became something that can replace the toolbar. Until the slots
 *  were user-assignable there was no reason to name these at all: no fixed
 *  slot could have shown them, so minimal UI simply had no ruler. */
export const FLOATING_UTILITY_TOOLS = ['hand', 'ruler', 'transform', 'selection', 'fill', 'grid'] as const

export type FloatingUtilityTool = (typeof FLOATING_UTILITY_TOOLS)[number]

/** Every tool a slot can hold, in the left toolbar's own order — the panel and
 *  the toolbar offer the same set, so that "the tools" means one thing in this
 *  app rather than two.
 *
 *  Two deliberate absences. The annotation tools (#509/#510) are the compact
 *  shell's, and Room hides this whole panel in that shell — a tool that cannot
 *  be in hand while the panel is on screen has no business in its chooser.
 *  And there is no entry for "the color", because the color is not a tool: it
 *  has the center dot and its own fan already. */
export const FLOATING_TOOLS = [
  ...FLOATING_PRIMARY_TOOLS, ...FLOATING_SECONDARY_TOOLS, ...FLOATING_UTILITY_TOOLS,
] as const

/** Everything a slot can hold. Derived from the three lists above rather than
 *  declared beside them, so adding a tool is one edit plus whatever the
 *  compiler then demands (TOOL_DISPLAY is a total Record over it, so a tool
 *  with no icon or label is a typecheck error, not a blank button). */
export type FloatingPanelTool = (typeof FLOATING_TOOLS)[number]

/** Narrows an arbitrary editor tool to the ones this panel can show as
 *  selected, so Room does not have to keep its own copy of the list to decide
 *  what to pass as `tool`. Now that every toolbar tool is in the list, the
 *  only thing this still excludes is the annotation set — which is exactly
 *  what the panel cannot be on screen alongside. */
export function isFloatingPanelTool(tool: string): tool is FloatingPanelTool {
  return (FLOATING_TOOLS as readonly string[]).includes(tool)
}

interface ToolFace { icon: IconName; labelKey: TranslationKey }

/** Icon + label per tool — the same icon each tool's own left-toolbar button
 *  already uses (Room/index.tsx), so the floating panel and the toolbar never
 *  disagree about what a tool "looks like". A total Record over the list
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
  hand: { icon: 'pan_tool', labelKey: 'tool.hand' },
  ruler: { icon: 'square_foot', labelKey: 'tool.ruler' },
  transform: { icon: 'free-transform', labelKey: 'tool.transform' },
  selection: { icon: 'highlight_alt', labelKey: 'tool.selection' },
  fill: { icon: 'format_color_fill', labelKey: 'tool.fill' },
  grid: { icon: 'grid_on', labelKey: 'tool.grid' },
}

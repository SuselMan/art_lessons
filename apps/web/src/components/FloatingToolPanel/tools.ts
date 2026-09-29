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

//
// (#650) The tool lists themselves moved to lib/browser/panelLayout.ts, below
// the store that persists a layout naming them; they are re-exported here so
// the panel's own importers keep one place to look.

import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'
import type { FloatingPanelTool } from '../../lib/browser/panelLayout'

export {
  FLOATING_PRIMARY_TOOLS, FLOATING_SECONDARY_TOOLS, FLOATING_UTILITY_TOOLS, FLOATING_TOOLS,
  SLOT_FIXED_TOOLS, isFloatingPanelTool,
  type FloatingPrimaryTool, type FloatingSecondaryTool, type FloatingUtilityTool, type FloatingPanelTool,
} from '../../lib/browser/panelLayout'

interface ToolFace { icon: IconName; labelKey: TranslationKey }

/** Icon + label per tool — the same icon each tool's own left-toolbar button
 *  already uses (Room/index.tsx), so the floating panel and the toolbar never
 *  disagree about what a tool "looks like". A total Record over the list
 *  above, which is what makes an unfaced tool fail to compile.
 *
 *  (#544) One deliberate exception, the shape. The rail's shape button wears
 *  whichever shape is currently set, because it can also offer the choice; a
 *  slot here holds *the shape tool* and has no way to offer one, so it keeps
 *  the composite glyph, which is the honest picture of "shapes" rather than a
 *  promise of a chooser that is not behind it. */
export const TOOL_DISPLAY: Record<FloatingPanelTool, ToolFace> = {
  pencil: { icon: 'edit', labelKey: 'tool.pencil' },
  charcoal: { icon: 'charcoal', labelKey: 'tool.charcoal' },
  liner: { icon: 'stylus', labelKey: 'tool.liner' },
  marker: { icon: 'ink_highlighter', labelKey: 'tool.marker' },
  brushPen: { icon: 'brush', labelKey: 'tool.brushPen' },
  watercolor: { icon: 'water_drop', labelKey: 'tool.watercolor' },
  digitalBrush: { icon: 'format_paint', labelKey: 'tool.digitalBrush' },
  eraser: { icon: 'ink_eraser', labelKey: 'tool.eraser' },
  smudge: { icon: 'smudge', labelKey: 'tool.smudge' },
  eyedropper: { icon: 'colorize', labelKey: 'tool.eyedropper' },
  hand: { icon: 'pan_tool', labelKey: 'tool.hand' },
  ruler: { icon: 'square_foot', labelKey: 'tool.ruler' },
  transform: { icon: 'free-transform', labelKey: 'tool.transform' },
  selection: { icon: 'highlight_alt', labelKey: 'tool.selection' },
  fill: { icon: 'format_color_fill', labelKey: 'tool.fill' },
  shape: { icon: 'shapes', labelKey: 'tool.shape' },
  grid: { icon: 'grid_on', labelKey: 'tool.grid' },
}

// (#548, first step of #544) The tools a room may offer, and the only list
// the wire knows about. Ordered exactly as the left toolbar and the floating
// panel lay them out — materials, then the tools that work on marks already
// down, then the utilities — so "the tools" means one thing in this app
// rather than three.
//
// The three annotation tools are deliberately absent: they are a rail of
// their own (#509/#510), shown *instead* of these rather than alongside them,
// and a room's toolset has no say over a mode it never competes with.
export const TOGGLEABLE_TOOLS = [
  'pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor', 'digitalBrush',
  'eraser', 'smudge', 'eyedropper',
  // (#525) The shape tool is one entry, not four: which of the four shapes it
  // draws is a setting on the tool, so a room cannot offer the ellipse and
  // withhold the star, and there is nothing here to say if it could.
  'hand', 'ruler', 'transform', 'selection', 'fill', 'shape', 'grid',
] as const

export type ToggleableTool = (typeof TOGGLEABLE_TOOLS)[number]

/** The tools that actually lay material. At least one of them has to survive
 *  every toolset — see `sanitizeEnabledTools`.
 *
 *  The eraser and the smudge are deliberately not here despite being drawing
 *  tools in every other sense: neither can put a mark on an empty sheet, so a
 *  room offering only those is exactly as unusable as one offering nothing. */
export const TOOLSET_MATERIAL_TOOLS: readonly ToggleableTool[] = [
  'pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor',
  // #547 — the digital brush lays material like the rest, and a room offering
  // only it is a perfectly good digital-painting lesson. That it imitates no
  // physical material is a fact about the mark, not about whether the tool can
  // start a drawing from an empty sheet, which is the only question this list
  // asks.
  'digitalBrush',
]

export function isToggleableTool(value: unknown): value is ToggleableTool {
  return typeof value === 'string' && (TOGGLEABLE_TOOLS as readonly string[]).includes(value)
}

/** Reads an arbitrary value — a socket payload, a REST body, a column written
 *  by an older build — into a toolset, or into `undefined` meaning "no
 *  restriction".
 *
 *  Three things it enforces, in this order, and each of them is the answer to
 *  a way the feature could quietly break a room:
 *
 *  - unknown ids are dropped rather than rejected, so a room created by a
 *    build that had one more tool than this one still opens (with that tool
 *    simply not offered) instead of failing to parse;
 *  - the result is deduped and reordered into `TOGGLEABLE_TOOLS` order, so a
 *    toolset compares as data rather than as the order someone clicked;
 *  - a list with no material left in it is *not* a toolset. A room nobody can
 *    draw in is read-only, which is its own setting (`closedAt`), and arriving
 *    at it by unchecking boxes would be an accident, never a decision. Such a
 *    list — and an empty one — reads as no restriction.
 *
 *  "No restriction" is deliberately `undefined` rather than a spelled-out list
 *  of all fifteen: the next tool this app ships has to appear in every room
 *  whose owner never restricted anything, and a stored full list would keep it
 *  out of all of them forever.
 */
export function sanitizeEnabledTools(value: unknown): ToggleableTool[] | undefined {
  if (!Array.isArray(value)) return undefined
  const picked = new Set(value.filter(isToggleableTool))
  if (picked.size === 0) return undefined
  const ordered = TOGGLEABLE_TOOLS.filter(tool => picked.has(tool))
  if (!ordered.some(tool => TOOLSET_MATERIAL_TOOLS.includes(tool))) return undefined
  // Every tool enabled is not a restriction, it is the default spelled out —
  // store it as the default so a later-added tool is not excluded by it.
  if (ordered.length === TOGGLEABLE_TOOLS.length) return undefined
  return ordered
}

/** Whether a room offers this tool. The one place the `undefined = all` rule
 *  is read, so no call site has to remember it — and the one place that knows
 *  a toolset has no opinion about tools outside `TOGGLEABLE_TOOLS`.
 *
 *  That second part is not a detail: the annotation tools are not toggleable,
 *  and reading a restricted list as "everything not in it is off" would have
 *  taken the annotation rail away from every room that restricted anything. */
export function isToolEnabledInRoom(enabledTools: readonly ToggleableTool[] | undefined, tool: string): boolean {
  if (!enabledTools) return true
  if (!isToggleableTool(tool)) return true
  return enabledTools.includes(tool)
}

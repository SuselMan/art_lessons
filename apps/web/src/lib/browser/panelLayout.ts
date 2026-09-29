// The floating panel's layout as a stored preference: which tools a slot can
// name, what a slot can hold, the default layout, and how a stored one is read
// back. Moved out of components/FloatingToolPanel (#650): stores/settingsStore
// persists the layout, and a store may not import a component. Everything the
// panel *draws* — icons, labels, geometry, the chooser — stays with the panel.

/** The material-laying tools, in the order the chooser lays them out.
 *  Structurally the same set as toolSlice.ts's PrimaryDrawingTool, but written
 *  out here rather than imported: this file sits below the store (#650), so
 *  the store can read a layout without importing the panel, and a store type
 *  imported back up would turn that into a cycle.
 *
 *  Still named as a set of its own even though every slot can now hold any
 *  tool, because the `drawing` role resolves into exactly this set — it is
 *  what "whichever one I was last drawing with" ranges over. */
export const FLOATING_PRIMARY_TOOLS = [
  'pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor', 'digitalBrush',
] as const

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
export const FLOATING_UTILITY_TOOLS = ['hand', 'ruler', 'transform', 'selection', 'fill', 'shape', 'grid'] as const

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

/** (#544) The tools a slot can be *pinned* to, which is now a smaller set than
 *  the tools the panel can *show*.
 *
 *  The difference is the groups. A material is still displayed here — a slot
 *  holding the drawing group wears whichever one is in hand — but it can no
 *  longer be put in a slot on its own, because the rail does not offer that
 *  either and the panel and the rail offer one set of tools between them, not
 *  two. Same for the shape: four shapes behind one entry.
 *
 *  Written as a filter rather than a second hand-kept list so that a tool
 *  added above lands here automatically unless it belongs to a group. */
export const SLOT_FIXED_TOOLS = FLOATING_TOOLS.filter(
  (tool): tool is FloatingPanelTool =>
    !(FLOATING_PRIMARY_TOOLS as readonly string[]).includes(tool) && tool !== 'shape',
)

/** Narrows an arbitrary editor tool to the ones this panel can show as
 *  selected, so Room does not have to keep its own copy of the list to decide
 *  what to pass as `tool`. Now that every toolbar tool is in the list, the
 *  only thing this still excludes is the annotation set — which is exactly
 *  what the panel cannot be on screen alongside. */
export function isFloatingPanelTool(tool: string): tool is FloatingPanelTool {
  return (FLOATING_TOOLS as readonly string[]).includes(tool)
}

/** Eight, laid out as a compass: index 0 is straight up and they run
 *  clockwise, so 0/2/4/6 are the four the panel has always had (N/E/S/W) and
 *  the odd indices are the diagonals added alongside them. The old layout is
 *  therefore a sub-sequence of this one rather than a thing that was replaced,
 *  which is what lets DEFAULT_PANEL_LAYOUT below reproduce it exactly. */
export const SLOT_COUNT = 8

/** (#544) A group of tools behind one slot, exactly as the left rail has them:
 *  `drawing` is every material, `shape` is the four shapes.
 *
 *  This replaced the two *roles* the panel used to have (`drawing` and
 *  `secondary` — "whichever one I last used"). A group does everything a role
 *  did and one thing more: a role could only hand back what you had already
 *  picked somewhere else, so the panel could remember the watercolor but never
 *  reach it; a group's own chooser reaches all of them. And it does it without
 *  the thing that made a role hard to explain — a slot whose meaning changed
 *  under you, marked with a badge nobody read.
 *
 *  The secondary role has no successor and needs none: the eraser, the smudge
 *  and the eyedropper are three separate buttons in the rail too, so a slot
 *  that wants the eraser holds the eraser. */
export type SlotGroup = 'drawing' | 'shape'

export const SLOT_GROUPS = ['drawing', 'shape'] as const satisfies readonly SlotGroup[]

/** The two things the panel does that are not tools. They sit in slots like
 *  everything else so that "move undo somewhere my thumb reaches" is a layout
 *  edit rather than a feature request. */
export type SlotAction = 'undo' | 'redo'

export const SLOT_ACTIONS = ['undo', 'redo'] as const satisfies readonly SlotAction[]

/** What a slot holds. `null` (used everywhere a SlotContent is optional) is
 *  the fourth case: an empty slot, drawn as a dot. */
export type SlotContent =
  | { kind: 'tool'; tool: FloatingPanelTool }
  | { kind: 'group'; group: SlotGroup }
  | { kind: 'action'; action: SlotAction }

/** Always SLOT_COUNT long — enforced by the parser below rather than by the
 *  type, since TypeScript's fixed-length tuple would have to be written out
 *  eight times at every call site that maps over it. */
export type PanelLayout = readonly (SlotContent | null)[]

/** The panel exactly as it was before it had eight slots: the drawing group on
 *  top, the eraser on the bottom, undo and redo on the sides, and the four
 *  diagonals empty.
 *
 *  Deliberately not "a sensible new default that uses all eight". Someone who
 *  never opens the chooser should not discover that their panel has been
 *  rearranged under them, and four dots that do nothing until held are a much
 *  smaller thing to explain than four buttons that were chosen for you. */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = [
  { kind: 'group', group: 'drawing' },
  null,
  { kind: 'action', action: 'redo' },
  null,
  // The eraser by name, where the `secondary` role used to sit. The role meant
  // "the eraser, or the smudge, or the eyedropper — whichever you touched
  // last", and what it did in practice was be the eraser while occasionally
  // being something else without warning.
  { kind: 'tool', tool: 'eraser' },
  null,
  { kind: 'action', action: 'undo' },
  null,
]

/** One entry in the fan that opens when a slot is held: everything a slot can
 *  be set to, plus the one thing that is not a content at all. `clear` is a
 *  choice rather than a separate gesture on purpose — putting something in a
 *  slot and taking it back out are the same decision seen twice, and a user
 *  who found the fan has already found the way to empty the slot. */
export type SlotChoice = { kind: 'clear' } | SlotContent

/** Stable React key / test handle for a choice or a slot's content. */
export function slotChoiceKey(choice: SlotChoice): string {
  switch (choice.kind) {
    case 'clear': return 'clear'
    case 'tool': return `tool:${choice.tool}`
    case 'group': return `group:${choice.group}`
    case 'action': return `action:${choice.action}`
  }
}

// ── persistence ─────────────────────────────────────────────────────────────

function isSlotContent(value: unknown): value is SlotContent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { kind?: unknown; tool?: unknown; group?: unknown; action?: unknown }
  if (v.kind === 'tool') return (SLOT_FIXED_TOOLS as readonly unknown[]).includes(v.tool)
  if (v.kind === 'group') return (SLOT_GROUPS as readonly unknown[]).includes(v.group)
  if (v.kind === 'action') return (SLOT_ACTIONS as readonly unknown[]).includes(v.action)
  return false
}

/** (#544) What a slot stored by an older build becomes.
 *
 *  Not a nicety: the layout this replaces is the *default* one, so the drawing
 *  role sits in slot 0 of every panel anyone has ever rearranged, and the
 *  generic "an entry I don't recognise becomes an empty slot" rule below would
 *  quietly delete the top and bottom buttons off all of them. Three legacy
 *  shapes, and each maps to the thing that does the same job:
 *
 *   - the drawing role → the drawing group, which is its successor exactly;
 *   - the secondary role → the eraser, which is what it was in practice;
 *   - a pinned material or the shape tool → the group it now lives in, since
 *     materials and shapes are no longer things a slot can hold on its own.
 *
 *  Returns null for anything else, which is the old rule, still the right
 *  answer for a tool that has genuinely gone away. */
function migrateSlotContent(value: unknown): SlotContent | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { kind?: unknown; tool?: unknown; role?: unknown }
  if (v.kind === 'role') {
    if (v.role === 'drawing') return { kind: 'group', group: 'drawing' }
    if (v.role === 'secondary') return { kind: 'tool', tool: 'eraser' }
    return null
  }
  if (v.kind === 'tool') {
    if ((FLOATING_PRIMARY_TOOLS as readonly unknown[]).includes(v.tool)) {
      return { kind: 'group', group: 'drawing' }
    }
    if (v.tool === 'shape') return { kind: 'group', group: 'shape' }
  }
  return null
}

/** Drops every repeat of a content after its first appearance.
 *
 *  Needed only by the migration above, and needed by it because migration is
 *  the one thing that can *create* a duplicate: a panel with both the drawing
 *  role and a pinned marker was two useful buttons and becomes two identical
 *  ones. `assignSlot` prevents duplicates going forward; this cleans up the
 *  ones that arrive already made. */
function dedupeLayout(layout: PanelLayout): PanelLayout {
  const seen = new Set<string>()
  return layout.map(content => {
    if (content === null) return null
    const key = slotChoiceKey(content)
    if (seen.has(key)) return null
    seen.add(key)
    return content
  })
}

/** Reads a stored layout, falling back to the default for anything that is not
 *  exactly one.
 *
 *  Validated entry by entry rather than trusted, for the reason every other
 *  localStorage-backed preference in this app gives (see settingsStore's
 *  pressure calibration): this is user-writable text that outlives deploys.
 *  Here it also outlives the *tool list* — a tool renamed or dropped in a
 *  later release leaves a stored slot naming something that no longer exists,
 *  and the honest answer to that is an empty slot, not a button whose icon
 *  lookup returns undefined. What #544 dropped is the exception, and it goes
 *  through migrateSlotContent instead: those entries have a successor, so
 *  emptying the slot would be throwing away a layout we can still read. */
export function parsePanelLayout(raw: string | null): PanelLayout {
  if (raw === null) return DEFAULT_PANEL_LAYOUT
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return DEFAULT_PANEL_LAYOUT }
  if (!Array.isArray(parsed) || parsed.length !== SLOT_COUNT) return DEFAULT_PANEL_LAYOUT
  return dedupeLayout(parsed.map(entry => (
    isSlotContent(entry) ? entry : migrateSlotContent(entry)
  )))
}

export function serializePanelLayout(layout: PanelLayout): string {
  return JSON.stringify(layout)
}

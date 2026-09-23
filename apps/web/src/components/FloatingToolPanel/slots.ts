// What each of the floating panel's eight slots can hold, where the slots sit,
// and how a layout survives a reload. Pure data and geometry, DOM-free, for
// the same reason colorFlyout.ts next door is: the interesting parts here are
// decidable without a browser, and a slot model that cannot be unit-tested is
// a slot model nobody will change twice.
//
// The panel used to be four fixed things — a drawing tool, an eraser, undo,
// redo — and the only question it could answer was "which tool is in hand".
// It is now eight slots the user lays out themselves, which turns that into
// two questions: what is *in* a slot, and what does that resolve to right
// now. Everything below exists to keep those two apart.

import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'
import {
  FLOATING_PRIMARY_TOOLS, SLOT_FIXED_TOOLS, TOOL_DISPLAY,
  type FloatingPanelTool,
} from './tools'

/** Eight, laid out as a compass: index 0 is straight up and they run
 *  clockwise, so 0/2/4/6 are the four the panel has always had (N/E/S/W) and
 *  the odd indices are the diagonals added alongside them. The old layout is
 *  therefore a sub-sequence of this one rather than a thing that was replaced,
 *  which is what lets DEFAULT_PANEL_LAYOUT below reproduce it exactly. */
export const SLOT_COUNT = 8

/** Distance (px) from the panel's center to a slot button's center.
 *
 *  Bounded from both sides and there is not much room between the bounds. Too
 *  small and neighbouring buttons overlap: eight of them 45° apart sit a chord
 *  of 2·r·sin(22.5°) ≈ 0.765·r apart, so a 44 px button needs r ≥ 58. Too
 *  large and a button crosses the panel's own rim: r + 22 must stay inside
 *  PANEL_SIZE/2 = 92. 62 clears both with a couple of px to spare on each
 *  side, which is the whole reason PANEL_SIZE grew from 152 to 184 — at the
 *  old diameter no radius satisfies both at once, and the arithmetic is worth
 *  writing down because "just make the buttons a bit smaller" is the tempting
 *  wrong answer (see CLAUDE.md on 40–48 px touch targets). */
export const SLOT_RADIUS = 62

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

/** Offset (px) of slot `index`'s center from the panel's own center. Index 0
 *  points straight up and they run clockwise; y grows downward, which is why
 *  the cosine is negated. */
export function slotOffset(index: number): { x: number; y: number } {
  const angle = (2 * Math.PI * index) / SLOT_COUNT
  return { x: Math.sin(angle) * SLOT_RADIUS, y: -Math.cos(angle) * SLOT_RADIUS }
}

// ── the chooser ─────────────────────────────────────────────────────────────

/** One entry in the fan that opens when a slot is held: everything a slot can
 *  be set to, plus the one thing that is not a content at all. `clear` is a
 *  choice rather than a separate gesture on purpose — putting something in a
 *  slot and taking it back out are the same decision seen twice, and a user
 *  who found the fan has already found the way to empty the slot. */
export type SlotChoice = { kind: 'clear' } | SlotContent

/** Every choice, in the order the fan lays them out: clear first (the fan's
 *  first ray, the same place the palette fan puts its own odd-one-out), then
 *  the groups, then the fixed tools in the left rail's own order, then
 *  undo/redo.
 *
 *  Groups ahead of tools because the drawing group is what most panels get
 *  built around; undo/redo last because they are the two entries that were
 *  never in question.
 *
 *  (#544) Fourteen entries, down from twenty-two: seven materials became one
 *  and the four shapes were already one. That shrinkage is most of the point —
 *  a fan of twenty-two rays around a 184 px panel is a ring of targets too
 *  fine to hit with the thumb that opened it. */
export const SLOT_CHOICES: readonly SlotChoice[] = [
  { kind: 'clear' },
  ...SLOT_GROUPS.map((group): SlotChoice => ({ kind: 'group', group })),
  ...SLOT_FIXED_TOOLS.map((tool): SlotChoice => ({ kind: 'tool', tool })),
  ...SLOT_ACTIONS.map((action): SlotChoice => ({ kind: 'action', action })),
]

/** Stable React key / test handle for a choice or a slot's content. */
export function slotChoiceKey(choice: SlotChoice): string {
  switch (choice.kind) {
    case 'clear': return 'clear'
    case 'tool': return `tool:${choice.tool}`
    case 'group': return `group:${choice.group}`
    case 'action': return `action:${choice.action}`
  }
}

export function sameSlotContent(a: SlotContent | null, b: SlotContent | null): boolean {
  if (a === null || b === null) return a === b
  return slotChoiceKey(a) === slotChoiceKey(b)
}

// ── resolving a slot ────────────────────────────────────────────────────────

/** Every tool the layout pins to a slot of its own. */
export function pinnedTools(layout: PanelLayout): ReadonlySet<string> {
  const pinned = new Set<string>()
  for (const content of layout) if (content?.kind === 'tool') pinned.add(content.tool)
  return pinned
}

/** What one group stands for at this moment: the tool a plain tap on its slot
 *  takes, and the icon that slot wears.
 *
 *  Resolved by the caller (Room) rather than here, for the same reason the
 *  roles were before it — this file, like the rest of components/, does not
 *  import from stores/, and the answer comes from tool state. Note that the
 *  two groups answer it from different places and that the difference never
 *  reaches this file: the drawing group's tool *is* its choice, while the
 *  shape group's choice is a setting on a tool that is always the shape tool.
 *
 *  `members` is the list its chooser fans out, already translated, because a
 *  member is a tool for one group and a setting value for the other and there
 *  is no type this file could give both. */
export interface SlotGroupState {
  tool: FloatingPanelTool
  icon: IconName
  members: readonly SlotGroupMember[]
  /** Which member is current — matched against `SlotGroupMember.value`. */
  value: string
}

export interface SlotGroupMember {
  value: string
  icon: IconName
  label: string
}

export type PanelGroups = Record<SlotGroup, SlotGroupState>

/** Which tool a slot stands for right now — the tool itself for a fixed slot,
 *  the group's current member for a group slot, and null for the two slots
 *  that are not about tools at all (an action, or nothing). */
export function resolveSlotTool(
  content: SlotContent | null, groups: PanelGroups,
): FloatingPanelTool | null {
  if (content === null) return null
  if (content.kind === 'tool') return content.tool
  if (content.kind === 'group') return groups[content.group].tool
  return null
}

/** A group the room has switched off entirely (#548) — no members left to
 *  choose from, so its slot is drawn dim and inert exactly like a slot pinned
 *  to a withdrawn tool. Only the shapes can reach this: a toolset always keeps
 *  one material. */
export function isGroupWithdrawn(group: SlotGroup, groups: PanelGroups): boolean {
  return groups[group].members.length === 0
}

export interface SlotFace {
  icon: IconName
  labelKey: TranslationKey
  /** True for a group slot, which wears the same corner mark the rail's group
   *  buttons wear. The icon itself is the current member's — a group slot
   *  showing a generic "this is a group" glyph would tell you it is a group
   *  and not tell you what a tap would give you, which is the only thing
   *  anyone taps it for. */
  isGroup: boolean
}

const ACTION_FACE: Record<SlotAction, SlotFace> = {
  undo: { icon: 'undo', labelKey: 'room.undo', isGroup: false },
  redo: { icon: 'redo', labelKey: 'room.redo', isGroup: false },
}

const GROUP_LABEL: Record<SlotGroup, TranslationKey> = {
  drawing: 'tool.drawing',
  shape: 'tool.shape',
}

/** How to draw a slot's content (or a chooser entry). Null for an empty slot
 *  and for `clear`, both of which the caller draws as a dot rather than as an
 *  icon. */
export function slotFace(choice: SlotChoice | null, groups: PanelGroups): SlotFace | null {
  if (choice === null || choice.kind === 'clear') return null
  if (choice.kind === 'action') return ACTION_FACE[choice.action]
  if (choice.kind === 'group') {
    return { icon: groups[choice.group].icon, labelKey: GROUP_LABEL[choice.group], isGroup: true }
  }
  return { ...TOOL_DISPLAY[choice.tool], isGroup: false }
}

/** The label a group is *named* by in the chooser, as opposed to the member it
 *  happens to be showing — "Drawing tool", not "Pencil". Both are true and the
 *  chooser needs the first: what the slot will hold is the group, not today's
 *  answer from it. */
export function slotChoiceLabelKey(choice: SlotChoice): TranslationKey | null {
  switch (choice.kind) {
    case 'clear': return 'palette.slotClear'
    case 'group': return GROUP_LABEL[choice.group]
    case 'tool': return TOOL_DISPLAY[choice.tool].labelKey
    case 'action': return ACTION_FACE[choice.action].labelKey
  }
}

// ── editing a layout ────────────────────────────────────────────────────────

/** Puts `choice` into slot `index`, and takes it out of wherever else it was.
 *
 *  The de-duplication is the point, not a nicety. With eight slots and twenty
 *  things to put in them, "move undo to where my thumb is" is a far more
 *  common intent than "give me a second undo", and without this it silently
 *  produces the second one — the user then has to notice the old slot and
 *  clear it by hand, having already done the only gesture that felt like
 *  moving. Groups de-duplicate for the same reason and more strongly: two
 *  slots following the same group are guaranteed to always show the same
 *  icon, which is a panel that has quietly lost a slot. */
export function assignSlot(layout: PanelLayout, index: number, choice: SlotChoice): PanelLayout {
  const content: SlotContent | null = choice.kind === 'clear' ? null : choice
  return layout.map((existing, i) => {
    if (i === index) return content
    if (content !== null && sameSlotContent(existing, content)) return null
    return existing
  })
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

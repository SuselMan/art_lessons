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
//
// (#650) What a slot can hold and how a layout is stored live in
// lib/browser/panelLayout.ts, below the store that persists it; this file is
// the panel's half — geometry, the chooser, faces — and re-exports the model.

import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'
import {
  SLOT_ACTIONS, SLOT_COUNT, SLOT_FIXED_TOOLS, SLOT_GROUPS, slotChoiceKey,
  type FloatingPanelTool, type PanelLayout, type SlotAction, type SlotChoice, type SlotContent, type SlotGroup,
} from '../../lib/browser/panelLayout'
import { TOOL_DISPLAY } from './tools'

export {
  DEFAULT_PANEL_LAYOUT, SLOT_ACTIONS, SLOT_COUNT, SLOT_GROUPS, parsePanelLayout, serializePanelLayout,
  slotChoiceKey,
  type PanelLayout, type SlotAction, type SlotChoice, type SlotContent, type SlotGroup,
} from '../../lib/browser/panelLayout'

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

/** Offset (px) of slot `index`'s center from the panel's own center. Index 0
 *  points straight up and they run clockwise; y grows downward, which is why
 *  the cosine is negated. */
export function slotOffset(index: number): { x: number; y: number } {
  const angle = (2 * Math.PI * index) / SLOT_COUNT
  return { x: Math.sin(angle) * SLOT_RADIUS, y: -Math.cos(angle) * SLOT_RADIUS }
}

// ── the chooser ─────────────────────────────────────────────────────────────


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

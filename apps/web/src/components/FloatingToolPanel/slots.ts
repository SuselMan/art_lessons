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
  FLOATING_TOOLS, TOOL_DISPLAY,
  type FloatingPanelTool, type FloatingPrimaryTool, type FloatingSecondaryTool,
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

/** Which of the two remembered tools a role slot follows. Not tools in their
 *  own right: a role resolves, at the moment it is drawn or tapped, to
 *  whichever tool currently occupies it.
 *
 *  This is the concept that keeps the panel useful once slots are hand-laid.
 *  A panel made only of fixed tools cannot answer "I was painting in
 *  watercolor a second ago and switched to minimal UI" — the watercolor is
 *  simply not on it. A role slot is the way back, and it is exactly what the
 *  panel's top and bottom buttons already were before any of this: `drawing`
 *  is the old top slot, `secondary` the old bottom one. */
export type SlotRole = 'drawing' | 'secondary'

export const SLOT_ROLES = ['drawing', 'secondary'] as const satisfies readonly SlotRole[]

/** The two things the panel does that are not tools. They sit in slots like
 *  everything else so that "move undo somewhere my thumb reaches" is a layout
 *  edit rather than a feature request. */
export type SlotAction = 'undo' | 'redo'

export const SLOT_ACTIONS = ['undo', 'redo'] as const satisfies readonly SlotAction[]

/** What a slot holds. `null` (used everywhere a SlotContent is optional) is
 *  the fourth case: an empty slot, drawn as a dot. */
export type SlotContent =
  | { kind: 'tool'; tool: FloatingPanelTool }
  | { kind: 'role'; role: SlotRole }
  | { kind: 'action'; action: SlotAction }

/** Always SLOT_COUNT long — enforced by the parser below rather than by the
 *  type, since TypeScript's fixed-length tuple would have to be written out
 *  eight times at every call site that maps over it. */
export type PanelLayout = readonly (SlotContent | null)[]

/** The panel exactly as it was before it had eight slots: the drawing role on
 *  top, the secondary role on the bottom, undo and redo on the sides, and the
 *  four diagonals empty.
 *
 *  Deliberately not "a sensible new default that uses all eight". Someone who
 *  never opens the chooser should not discover that their panel has been
 *  rearranged under them, and four dots that do nothing until held are a much
 *  smaller thing to explain than four buttons that were chosen for you. */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = [
  { kind: 'role', role: 'drawing' },
  null,
  { kind: 'action', action: 'redo' },
  null,
  { kind: 'role', role: 'secondary' },
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
 *  the two roles, then the tools in the left toolbar's own order, then
 *  undo/redo.
 *
 *  Roles ahead of tools because a role is the more common thing to want and
 *  the harder one to find; undo/redo last because they are the two entries
 *  that were never in question. */
export const SLOT_CHOICES: readonly SlotChoice[] = [
  { kind: 'clear' },
  ...SLOT_ROLES.map((role): SlotChoice => ({ kind: 'role', role })),
  ...FLOATING_TOOLS.map((tool): SlotChoice => ({ kind: 'tool', tool })),
  ...SLOT_ACTIONS.map((action): SlotChoice => ({ kind: 'action', action })),
]

/** Stable React key / test handle for a choice or a slot's content. */
export function slotChoiceKey(choice: SlotChoice): string {
  switch (choice.kind) {
    case 'clear': return 'clear'
    case 'tool': return `tool:${choice.tool}`
    case 'role': return `role:${choice.role}`
    case 'action': return `action:${choice.action}`
  }
}

export function sameSlotContent(a: SlotContent | null, b: SlotContent | null): boolean {
  if (a === null || b === null) return a === b
  return slotChoiceKey(a) === slotChoiceKey(b)
}

// ── resolving a slot ────────────────────────────────────────────────────────

/** Which tool a slot stands for right now — the tool itself for a fixed slot,
 *  the currently-remembered one for a role, and null for the two slots that
 *  are not about tools at all (an action, or nothing).
 *
 *  The two remembered tools are passed in rather than read from a store
 *  because this file, like the rest of components/, does not import from
 *  stores/ — and because a pure function of them is what makes the role
 *  behaviour testable at all. */
export function resolveSlotTool(
  content: SlotContent | null,
  primaryTool: FloatingPrimaryTool,
  secondaryTool: FloatingSecondaryTool,
): FloatingPanelTool | null {
  if (content === null) return null
  if (content.kind === 'tool') return content.tool
  if (content.kind === 'role') return content.role === 'drawing' ? primaryTool : secondaryTool
  return null
}

export interface SlotFace {
  icon: IconName
  labelKey: TranslationKey
  /** True for a role slot, which wears the history badge over its icon. The
   *  icon itself is the resolved tool's — a role slot showing a generic
   *  "last used" glyph would tell you it is a role and not tell you what it
   *  would give you, which is the only thing anyone taps it for. */
  isRole: boolean
}

const ACTION_FACE: Record<SlotAction, SlotFace> = {
  undo: { icon: 'undo', labelKey: 'room.undo', isRole: false },
  redo: { icon: 'redo', labelKey: 'room.redo', isRole: false },
}

const ROLE_LABEL: Record<SlotRole, TranslationKey> = {
  drawing: 'palette.roleDrawing',
  secondary: 'palette.roleSecondary',
}

/** How to draw a slot's content (or a chooser entry). Null for an empty slot
 *  and for `clear`, both of which the caller draws as a dot rather than as an
 *  icon. */
export function slotFace(
  choice: SlotChoice | null,
  primaryTool: FloatingPrimaryTool,
  secondaryTool: FloatingSecondaryTool,
): SlotFace | null {
  if (choice === null || choice.kind === 'clear') return null
  if (choice.kind === 'action') return ACTION_FACE[choice.action]
  const tool = resolveSlotTool(choice, primaryTool, secondaryTool)
  if (tool === null) return null
  return { ...TOOL_DISPLAY[tool], isRole: choice.kind === 'role' }
}

/** The label a role is *named* by in the chooser, as opposed to the tool it
 *  currently resolves to — "Last drawing tool", not "Pencil". Both are true
 *  and the chooser needs the first: two entries showing a pencil are told
 *  apart by their titles as much as by the badge. */
export function slotChoiceLabelKey(choice: SlotChoice): TranslationKey | null {
  switch (choice.kind) {
    case 'clear': return 'palette.slotClear'
    case 'role': return ROLE_LABEL[choice.role]
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
 *  moving. Roles de-duplicate for the same reason and more strongly: two
 *  slots following the same remembered tool are guaranteed to always show the
 *  same icon, which is a panel that has quietly lost a slot. */
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
  const v = value as { kind?: unknown; tool?: unknown; role?: unknown; action?: unknown }
  if (v.kind === 'tool') return (FLOATING_TOOLS as readonly unknown[]).includes(v.tool)
  if (v.kind === 'role') return (SLOT_ROLES as readonly unknown[]).includes(v.role)
  if (v.kind === 'action') return (SLOT_ACTIONS as readonly unknown[]).includes(v.action)
  return false
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
 *  lookup returns undefined. */
export function parsePanelLayout(raw: string | null): PanelLayout {
  if (raw === null) return DEFAULT_PANEL_LAYOUT
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return DEFAULT_PANEL_LAYOUT }
  if (!Array.isArray(parsed) || parsed.length !== SLOT_COUNT) return DEFAULT_PANEL_LAYOUT
  return parsed.map(entry => (isSlotContent(entry) ? entry : null))
}

export function serializePanelLayout(layout: PanelLayout): string {
  return JSON.stringify(layout)
}

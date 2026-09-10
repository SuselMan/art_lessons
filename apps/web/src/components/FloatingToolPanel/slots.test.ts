import { describe, expect, it } from 'vitest'

import { PANEL_SIZE } from '../../pages/Room/panelPosition'
import {
  DEFAULT_PANEL_LAYOUT, SLOT_CHOICES, SLOT_COUNT, SLOT_RADIUS, assignSlot, isGroupWithdrawn,
  parsePanelLayout, pinnedTools, resolveSlotTool, sameSlotContent,
  serializePanelLayout, slotChoiceKey, slotChoiceLabelKey, slotFace, slotOffset,
  type PanelGroups, type PanelLayout,
} from './slots'
import { FLOATING_PRIMARY_TOOLS, SLOT_FIXED_TOOLS } from './tools'

const BUTTON_SIZE = 44

describe('slot geometry', () => {
  // The two bounds SLOT_RADIUS sits between. Both are checked rather than
  // asserted on the literal 62, because what matters is that the radius
  // still satisfies them after the next change to either the panel diameter
  // or the button size — a test pinned to 62 would pass while the buttons
  // overlapped.
  it('keeps neighbouring slots from overlapping', () => {
    const a = slotOffset(0)
    const b = slotOffset(1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(BUTTON_SIZE)
  })

  it('keeps every slot inside the panel', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const { x, y } = slotOffset(i)
      expect(Math.hypot(x, y) + BUTTON_SIZE / 2).toBeLessThanOrEqual(PANEL_SIZE / 2)
    }
  })

  it('starts straight up and runs clockwise', () => {
    expect(slotOffset(0)).toEqual({ x: 0, y: -SLOT_RADIUS })
    expect(slotOffset(2).x).toBeCloseTo(SLOT_RADIUS)
    expect(slotOffset(4).y).toBeCloseTo(SLOT_RADIUS)
    expect(slotOffset(6).x).toBeCloseTo(-SLOT_RADIUS)
  })
})

describe('the default layout', () => {
  // The whole promise of the redesign: someone who never opens a chooser sees
  // the panel they already had. If this test has to be edited, that promise is
  // what is being broken.
  //
  // (#544) It was edited, once, and this is what changed: the two role slots
  // became the drawing group and the eraser. The promise survives it — the
  // top slot still hands you what you were drawing with and the bottom one
  // still erases — because migratePanelLayout carries every stored panel
  // across the same way.
  it('reproduces the four-button panel exactly', () => {
    expect(DEFAULT_PANEL_LAYOUT).toEqual([
      { kind: 'group', group: 'drawing' },
      null,
      { kind: 'action', action: 'redo' },
      null,
      { kind: 'tool', tool: 'eraser' },
      null,
      { kind: 'action', action: 'undo' },
      null,
    ])
  })

  it('has one entry per slot', () => {
    expect(DEFAULT_PANEL_LAYOUT).toHaveLength(SLOT_COUNT)
  })
})

describe('pinnedTools', () => {
  it('ignores groups and actions when deciding what is pinned', () => {
    const layout = assignSlot(DEFAULT_PANEL_LAYOUT, 1, { kind: 'action', action: 'undo' })
    expect(pinnedTools(layout)).toEqual(new Set(['eraser']))
  })
})

// A stand-in for what Room resolves per render. The drawing group is on the
// marker, the shape group on the ellipse, and both carry the members their
// fans would offer.
const GROUPS: PanelGroups = {
  drawing: {
    tool: 'marker',
    icon: 'ink_highlighter',
    value: 'marker',
    members: [
      { value: 'pencil', icon: 'edit', label: 'Pencil' },
      { value: 'marker', icon: 'ink_highlighter', label: 'Marker' },
    ],
  },
  shape: {
    tool: 'shape',
    icon: 'circle',
    value: 'ellipse',
    members: [
      { value: 'rectangle', icon: 'rectangle', label: 'Rectangle' },
      { value: 'ellipse', icon: 'circle', label: 'Ellipse' },
    ],
  },
}

describe('resolveSlotTool', () => {
  it('gives a fixed slot its own tool, whatever the groups say', () => {
    expect(resolveSlotTool({ kind: 'tool', tool: 'ruler' }, GROUPS)).toBe('ruler')
  })

  it('gives a group slot whatever that group currently stands for', () => {
    expect(resolveSlotTool({ kind: 'group', group: 'drawing' }, GROUPS)).toBe('marker')
    // The shape group always resolves to the shape tool: which shape it draws
    // is a setting, not a different tool. That difference lives in Room and
    // this file must not learn it.
    expect(resolveSlotTool({ kind: 'group', group: 'shape' }, GROUPS)).toBe('shape')
  })

  it('gives an empty or action slot no tool at all', () => {
    expect(resolveSlotTool(null, GROUPS)).toBeNull()
    expect(resolveSlotTool({ kind: 'action', action: 'undo' }, GROUPS)).toBeNull()
  })
})

describe('isGroupWithdrawn', () => {
  it('calls a group with no members left withdrawn', () => {
    const emptied: PanelGroups = { ...GROUPS, shape: { ...GROUPS.shape, members: [] } }
    expect(isGroupWithdrawn('shape', emptied)).toBe(true)
    expect(isGroupWithdrawn('drawing', emptied)).toBe(false)
  })
})

describe('slotFace', () => {
  it('draws a group with its current member’s own icon, marked', () => {
    const group = slotFace({ kind: 'group', group: 'drawing' }, GROUPS)
    const fixed = slotFace({ kind: 'tool', tool: 'marker' }, GROUPS)
    // Same picture — which is exactly why the corner mark has to exist.
    expect(group?.icon).toBe(fixed?.icon)
    expect(group?.isGroup).toBe(true)
    expect(fixed?.isGroup).toBe(false)
  })

  it('names a group by the group, not by the member it is showing', () => {
    expect(slotChoiceLabelKey({ kind: 'group', group: 'drawing' })).toBe('tool.drawing')
    expect(slotChoiceLabelKey({ kind: 'tool', tool: 'marker' })).toBe('tool.marker')
  })

  it('has nothing to draw for an empty slot or for `clear`', () => {
    expect(slotFace(null, GROUPS)).toBeNull()
    expect(slotFace({ kind: 'clear' }, GROUPS)).toBeNull()
  })
})

describe('the chooser', () => {
  it('offers clear, both groups, every pinnable tool and both actions', () => {
    expect(SLOT_CHOICES.map(slotChoiceKey)).toEqual([
      'clear', 'group:drawing', 'group:shape',
      ...SLOT_FIXED_TOOLS.map(tool => `tool:${tool}`),
      'action:undo', 'action:redo',
    ])
  })

  // (#544) The materials and the shape tool are reachable through their group
  // and nowhere else — the same rule the left rail follows, and the reason the
  // fan shrank from twenty-two rays to fourteen.
  it('offers no material and no shape tool of its own', () => {
    const keys = SLOT_CHOICES.map(slotChoiceKey)
    for (const material of FLOATING_PRIMARY_TOOLS) expect(keys).not.toContain(`tool:${material}`)
    expect(keys).not.toContain('tool:shape')
  })

  it('gives every entry a distinct key', () => {
    const keys = SLOT_CHOICES.map(slotChoiceKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('assignSlot', () => {
  it('puts the choice in the named slot', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 1, { kind: 'tool', tool: 'ruler' })
    expect(next[1]).toEqual({ kind: 'tool', tool: 'ruler' })
  })

  it('empties the slot for `clear`', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 0, { kind: 'clear' })
    expect(next[0]).toBeNull()
  })

  // Assignment moves rather than copies — see assignSlot's own comment. Two
  // undos is never what "put undo where my thumb is" meant.
  it('takes the same content out of wherever else it was', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 1, { kind: 'action', action: 'undo' })
    expect(next[1]).toEqual({ kind: 'action', action: 'undo' })
    expect(next[6]).toBeNull()
    expect(next.filter(c => sameSlotContent(c, { kind: 'action', action: 'undo' }))).toHaveLength(1)
  })

  it('de-duplicates groups too', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 3, { kind: 'group', group: 'drawing' })
    expect(next[0]).toBeNull()
    expect(next[3]).toEqual({ kind: 'group', group: 'drawing' })
  })

  it('leaves a slot re-assigned to what it already held alone', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 6, { kind: 'action', action: 'undo' })
    expect(next).toEqual(DEFAULT_PANEL_LAYOUT)
  })

  it('never changes the number of slots', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 5, { kind: 'tool', tool: 'fill' })
    expect(next).toHaveLength(SLOT_COUNT)
  })
})

describe('parsePanelLayout', () => {
  it('round-trips a layout', () => {
    const layout: PanelLayout = assignSlot(DEFAULT_PANEL_LAYOUT, 7, { kind: 'tool', tool: 'grid' })
    expect(parsePanelLayout(serializePanelLayout(layout))).toEqual(layout)
  })

  it('falls back to the default for nothing stored', () => {
    expect(parsePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT)
  })

  it.each([
    ['malformed JSON', '{['],
    ['not an array', '{"kind":"tool"}'],
    ['the wrong length', '[null,null]'],
  ])('falls back to the default for %s', (_name, raw) => {
    expect(parsePanelLayout(raw)).toEqual(DEFAULT_PANEL_LAYOUT)
  })

  // A stored layout outlives the tool list. A slot naming a tool a later
  // release dropped has to come back empty, not as a button whose icon lookup
  // returns undefined.
  it('empties a slot naming something that no longer exists', () => {
    const raw = JSON.stringify([
      { kind: 'tool', tool: 'airbrush' },
      { kind: 'role', role: 'tertiary' },
      { kind: 'action', action: 'delete-everything' },
      'pencil',
      42,
      null,
      { kind: 'tool', tool: 'fill' },
      null,
    ])
    expect(parsePanelLayout(raw)).toEqual([
      null, null, null, null, null, null, { kind: 'tool', tool: 'fill' }, null,
    ])
  })

  // (#544) The panels people already have. Every one of them was laid out on
  // top of a default that put the two roles in slots 0 and 4, so "an entry I
  // no longer recognise becomes an empty slot" would have quietly stripped the
  // top and bottom buttons off all of them.
  it('carries the two old roles across to their successors', () => {
    const raw = JSON.stringify([
      { kind: 'role', role: 'drawing' },
      null,
      { kind: 'action', action: 'redo' },
      null,
      { kind: 'role', role: 'secondary' },
      null,
      { kind: 'action', action: 'undo' },
      null,
    ])
    expect(parsePanelLayout(raw)).toEqual(DEFAULT_PANEL_LAYOUT)
  })

  it('carries a pinned material or shape tool into its group', () => {
    const raw = JSON.stringify([
      { kind: 'tool', tool: 'watercolor' },
      { kind: 'tool', tool: 'shape' },
      null, null, null, null, null, null,
    ])
    expect(parsePanelLayout(raw)).toEqual([
      { kind: 'group', group: 'drawing' },
      { kind: 'group', group: 'shape' },
      null, null, null, null, null, null,
    ])
  })

  // Migration is the one thing that can *create* a duplicate: a panel with the
  // drawing role and a pinned marker was two useful buttons, and both of them
  // now name the same group. The second one loses.
  it('keeps only the first of two slots that migrate to the same thing', () => {
    const raw = JSON.stringify([
      { kind: 'role', role: 'drawing' },
      { kind: 'tool', tool: 'marker' },
      { kind: 'tool', tool: 'liner' },
      null, null, null, null, null,
    ])
    expect(parsePanelLayout(raw)).toEqual([
      { kind: 'group', group: 'drawing' },
      null, null, null, null, null, null, null,
    ])
  })
})

import { describe, expect, it } from 'vitest'

import { PANEL_SIZE } from '../../pages/Room/panelPosition'
import {
  DEFAULT_PANEL_LAYOUT, SLOT_CHOICES, SLOT_COUNT, SLOT_RADIUS, assignSlot, parsePanelLayout,
  resolveSlotTool, sameSlotContent, serializePanelLayout, slotChoiceKey, slotFace, slotOffset,
  type PanelLayout,
} from './slots'
import { FLOATING_TOOLS } from './tools'

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
  it('reproduces the four-button panel exactly', () => {
    expect(DEFAULT_PANEL_LAYOUT).toEqual([
      { kind: 'role', role: 'drawing' },
      null,
      { kind: 'action', action: 'redo' },
      null,
      { kind: 'role', role: 'secondary' },
      null,
      { kind: 'action', action: 'undo' },
      null,
    ])
  })

  it('has one entry per slot', () => {
    expect(DEFAULT_PANEL_LAYOUT).toHaveLength(SLOT_COUNT)
  })
})

describe('resolveSlotTool', () => {
  it('gives a fixed slot its own tool, whatever was last used', () => {
    expect(resolveSlotTool({ kind: 'tool', tool: 'ruler' }, 'marker', 'smudge')).toBe('ruler')
  })

  it('gives a role slot whichever tool currently fills the role', () => {
    expect(resolveSlotTool({ kind: 'role', role: 'drawing' }, 'watercolor', 'eraser')).toBe('watercolor')
    expect(resolveSlotTool({ kind: 'role', role: 'secondary' }, 'watercolor', 'eyedropper')).toBe('eyedropper')
  })

  it('gives an empty or action slot no tool at all', () => {
    expect(resolveSlotTool(null, 'pencil', 'eraser')).toBeNull()
    expect(resolveSlotTool({ kind: 'action', action: 'undo' }, 'pencil', 'eraser')).toBeNull()
  })
})

describe('slotFace', () => {
  it('draws a role with the resolved tool’s own icon, badged', () => {
    const role = slotFace({ kind: 'role', role: 'drawing' }, 'marker', 'eraser')
    const fixed = slotFace({ kind: 'tool', tool: 'marker' }, 'marker', 'eraser')
    // Same picture — which is exactly why the badge has to exist.
    expect(role?.icon).toBe(fixed?.icon)
    expect(role?.isRole).toBe(true)
    expect(fixed?.isRole).toBe(false)
  })

  it('has nothing to draw for an empty slot or for `clear`', () => {
    expect(slotFace(null, 'pencil', 'eraser')).toBeNull()
    expect(slotFace({ kind: 'clear' }, 'pencil', 'eraser')).toBeNull()
  })
})

describe('the chooser', () => {
  it('offers clear, both roles, every tool and both actions', () => {
    expect(SLOT_CHOICES.map(slotChoiceKey)).toEqual([
      'clear', 'role:drawing', 'role:secondary',
      ...FLOATING_TOOLS.map(tool => `tool:${tool}`),
      'action:undo', 'action:redo',
    ])
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

  it('de-duplicates roles too', () => {
    const next = assignSlot(DEFAULT_PANEL_LAYOUT, 3, { kind: 'role', role: 'drawing' })
    expect(next[0]).toBeNull()
    expect(next[3]).toEqual({ kind: 'role', role: 'drawing' })
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
      { kind: 'tool', tool: 'pencil' },
      null,
    ])
    expect(parsePanelLayout(raw)).toEqual([
      null, null, null, null, null, null, { kind: 'tool', tool: 'pencil' }, null,
    ])
  })
})

import { describe, it, expect } from 'vitest'

import { colorWellState, effectiveSwatch } from './colorWell'
import { defaultToolSettings, type ToolSettingsMap } from './toolSchemas'

// (#542) The rule behind the one colour glyph. Everything visual about the well
// is rendering, which this repo's node-run tests cannot reach — what they can
// reach, and what actually decides whether the well tells the truth, is this.

function settings(shape: Record<string, unknown> = {}): ToolSettingsMap {
  const map = defaultToolSettings()
  map.shape = { ...map.shape, ...shape }
  return map
}

describe('colorWellState (#542)', () => {
  it('leaves the ring absent for a tool carrying one colour', () => {
    const well = colorWellState(settings(), 'liner', 'stroke')
    // Absent, not null: `null` is a ring deliberately switched off and draws a
    // struck-through band, where absent collapses the band entirely and gives
    // back the plain swatch every one-colour tool has always had.
    expect('stroke' in well).toBe(false)
    expect(well.pair).toBeNull()
    expect(well.highlight).toBeNull()
  })

  it('shows a one-colour tool its own colour, not the shape tool state', () => {
    const map = settings()
    map.liner = { ...map.liner, color: [1, 0, 0] }
    expect(colorWellState(map, 'liner', 'fill').fill).toEqual([1, 0, 0])
  })

  it('puts a shape stroke in the ring and its fill in the core', () => {
    const well = colorWellState(
      settings({ kind: 'rectangle', strokeColor: [1, 0, 0], fillColor: [0, 0, 1], strokeOn: true, fillOn: true }),
      'shape', 'stroke',
    )
    expect(well.stroke).toEqual([1, 0, 0])
    expect(well.fill).toEqual([0, 0, 1])
  })

  it('draws a switched-off colour as "no colour" rather than as white paint', () => {
    const well = colorWellState(settings({ kind: 'rectangle', fillOn: false }), 'shape', 'stroke')
    expect(well.fill).toBeNull()
    // The pair still carries the colour it would come back to — switching a
    // fill off and on again is not meant to lose it.
    expect(well.pair?.fillColor).not.toBeNull()
    expect(well.pair?.fillOn).toBe(false)
  })

  it('highlights the part the picker is pointed at', () => {
    const map = settings({ kind: 'rectangle' })
    expect(colorWellState(map, 'shape', 'stroke').highlight).toBe('outer')
    expect(colorWellState(map, 'shape', 'fill').highlight).toBe('core')
  })

  it('gives a line no fill well at all', () => {
    const well = colorWellState(settings({ kind: 'line' }), 'shape', 'stroke')
    expect(well.pair?.fillColor).toBeNull()
  })

  it('keeps a line pointed at its stroke even when fill is the stored swatch', () => {
    // The regression this exists for: `fill` stays selected from the last
    // rectangle, the tool switches to a line, and every colour control is then
    // aimed at a field the drawing never shows.
    const well = colorWellState(settings({ kind: 'line' }), 'shape', 'fill')
    expect(well.pair?.active).toBe('stroke')
    expect(well.highlight).toBe('outer')
  })
})

describe('effectiveSwatch (#542)', () => {
  it('answers stroke for every tool that carries one colour', () => {
    expect(effectiveSwatch(settings(), 'pencil', 'fill')).toBe('stroke')
  })

  it('honours the stored swatch on a shape that has a fill', () => {
    expect(effectiveSwatch(settings({ kind: 'ellipse' }), 'shape', 'fill')).toBe('fill')
  })

  it('overrides it on a shape that has none', () => {
    expect(effectiveSwatch(settings({ kind: 'line' }), 'shape', 'fill')).toBe('stroke')
  })
})

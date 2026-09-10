import { describe, expect, it } from 'vitest'

import {
  isToolEnabledInRoom, sanitizeEnabledTools, TOGGLEABLE_TOOLS, TOOLSET_MATERIAL_TOOLS,
} from './index.js'

// (#548) The room toolset contract. Everything here is about one rule: a
// toolset is data the server stores and every client obeys, so the shapes it
// can legally hold have to be decided in one place rather than defended at
// each call site.

describe('sanitizeEnabledTools', () => {
  it('reads a normal toolset back, in the canonical order', () => {
    expect(sanitizeEnabledTools(['eraser', 'pencil'])).toEqual(['pencil', 'eraser'])
  })

  it('dedupes', () => {
    expect(sanitizeEnabledTools(['pencil', 'pencil', 'eraser'])).toEqual(['pencil', 'eraser'])
  })

  it('drops ids it does not know instead of rejecting the whole list', () => {
    // A room created by a build that ships one more tool than this one still
    // opens, simply without that tool — the alternative is a room that fails
    // to parse and cannot be entered at all.
    expect(sanitizeEnabledTools(['pencil', 'hologram', 42, null])).toEqual(['pencil'])
  })

  it('treats a list with no material as no restriction at all', () => {
    // A room nobody can draw in is a closed room, which is its own setting.
    expect(sanitizeEnabledTools(['eraser', 'smudge', 'hand'])).toBeUndefined()
  })

  it('treats the empty list, a non-list and every-tool-listed as no restriction', () => {
    expect(sanitizeEnabledTools([])).toBeUndefined()
    expect(sanitizeEnabledTools(undefined)).toBeUndefined()
    expect(sanitizeEnabledTools('pencil')).toBeUndefined()
    // The full list is the default spelled out. Storing it would exclude the
    // *next* tool this app ships from every room saved today.
    expect(sanitizeEnabledTools([...TOGGLEABLE_TOOLS])).toBeUndefined()
  })

  it('keeps a single material as a legal toolset', () => {
    expect(sanitizeEnabledTools(['pencil'])).toEqual(['pencil'])
  })

  it('every material alone is a legal toolset', () => {
    for (const material of TOOLSET_MATERIAL_TOOLS) {
      expect(sanitizeEnabledTools([material])).toEqual([material])
    }
  })
})

describe('isToolEnabledInRoom', () => {
  it('offers everything when the room does not restrict', () => {
    for (const tool of TOGGLEABLE_TOOLS) expect(isToolEnabledInRoom(undefined, tool)).toBe(true)
  })

  it('offers only what is listed', () => {
    expect(isToolEnabledInRoom(['pencil'], 'pencil')).toBe(true)
    expect(isToolEnabledInRoom(['pencil'], 'eraser')).toBe(false)
  })

  it('has no opinion about tools outside the toggleable set', () => {
    // The annotation rail (#509/#510) is shown *instead* of these tools, never
    // alongside them. Reading a restricted list as "everything not in it is
    // off" would have taken annotation away from every restricted room.
    expect(isToolEnabledInRoom(['pencil'], 'annotatePen')).toBe(true)
    expect(isToolEnabledInRoom(['pencil'], 'annotateText')).toBe(true)
    expect(isToolEnabledInRoom(['pencil'], 'annotateEraser')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { drawingGroupToolFor, fallbackToolFor, toggledTool } from './toolChoice'

describe('fallbackToolFor', () => {
  it('is the pencil for an unrestricted room', () => {
    expect(fallbackToolFor(undefined)).toBe('pencil')
  })

  it('is the first material the room offers, never a tool that cannot draw', () => {
    expect(fallbackToolFor(['eyedropper', 'eraser', 'watercolor', 'charcoal'])).toBe('watercolor')
  })
})

describe('drawingGroupToolFor', () => {
  it('follows the last material in hand while the room offers it', () => {
    expect(drawingGroupToolFor('marker', undefined)).toBe('marker')
    expect(drawingGroupToolFor('marker', ['marker', 'pencil'])).toBe('marker')
  })

  it('shows what the room does offer once that material is withdrawn', () => {
    expect(drawingGroupToolFor('pencil', ['eraser', 'liner', 'charcoal'])).toBe('charcoal')
  })
})

describe('toggledTool', () => {
  it('takes the pressed tool when another one is in hand', () => {
    expect(toggledTool('pencil', 'eraser', 'pencil', undefined)).toBe('eraser')
  })

  it('goes back to the drawing tool on a second press', () => {
    expect(toggledTool('eraser', 'eraser', 'charcoal', undefined)).toBe('charcoal')
  })

  it('goes to the fallback when the drawing tool has been switched off since', () => {
    expect(toggledTool('eraser', 'eraser', 'pencil', ['eraser', 'liner'])).toBe('liner')
  })
})

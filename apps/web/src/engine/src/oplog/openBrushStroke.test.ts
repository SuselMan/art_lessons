import { describe, expect, it } from 'vitest'
import type { LayerOpacityOperation, Operation, StrokeOperation } from '@grafetto/shared'

import { hasOpenBrushStroke } from './openBrushStroke'

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id: 'chunk', type: 'stroke', userId: 'alice', layerId: 'ink', timestamp: 0,
    tool: 'digitalBrush', color: [0, 0, 0], dabs: [], strokeId: 'gesture-a',
    ...overrides,
  }
}

function opacity(): LayerOpacityOperation {
  return { id: 'opacity', type: 'layer_opacity', userId: 'alice', layerId: 'ink', timestamp: 1, opacity: .5 }
}

describe('hasOpenBrushStroke', () => {
  it.each(['digitalBrush', 'smudge'] as const)('refuses a %s chunk prefix until explicit pen-up arrives', tool => {
    const first = stroke({ tool })
    const middle = stroke({ id: 'middle', tool })
    const end = stroke({ id: 'end', tool, strokeEnd: true })
    expect(hasOpenBrushStroke([first], 'ink')).toBe(true)
    expect(hasOpenBrushStroke([first, middle], 'ink')).toBe(true)
    expect(hasOpenBrushStroke([first, middle, end], 'ink')).toBe(false)
  })

  it('does not treat a metadata operation as the end of a brush gesture', () => {
    expect(hasOpenBrushStroke([stroke(), opacity()], 'ink')).toBe(true)
  })

  it('replaces a lost pen-up with the next gesture of the same user on the layer', () => {
    expect(hasOpenBrushStroke([stroke(), stroke({ strokeId: 'gesture-b', strokeEnd: true })], 'ink')).toBe(false)
    expect(hasOpenBrushStroke([stroke(), stroke({ strokeId: 'gesture-b' })], 'ink')).toBe(true)
    expect(hasOpenBrushStroke([stroke(), stroke({ strokeId: 'pencil-gesture', tool: 'pencil' })], 'ink')).toBe(false)
  })

  it('keeps interleaved peers independent even if their strokeIds collide', () => {
    const alice = stroke()
    const bob = stroke({ id: 'bob-start', userId: 'bob' })
    const aliceEnd = stroke({ id: 'alice-end', strokeEnd: true })
    const bobEnd = stroke({ id: 'bob-end', userId: 'bob', strokeEnd: true })
    expect(hasOpenBrushStroke([alice, bob, aliceEnd], 'ink')).toBe(true)
    expect(hasOpenBrushStroke([alice, bob, aliceEnd, bobEnd], 'ink')).toBe(false)
  })

  it('does not let a final chunk on another layer close this layer', () => {
    const ops: Operation[] = [stroke(), stroke({ id: 'other-end', layerId: 'other', strokeEnd: true })]
    expect(hasOpenBrushStroke(ops, 'ink')).toBe(true)
    expect(hasOpenBrushStroke(ops, 'other')).toBe(false)
    expect(hasOpenBrushStroke(ops, 'empty')).toBe(false)
  })

  it('does not block legacy standalone strokes or ordinary grouped pencil strokes', () => {
    expect(hasOpenBrushStroke([], 'ink')).toBe(false)
    expect(hasOpenBrushStroke([stroke({ strokeId: undefined })], 'ink')).toBe(false)
    expect(hasOpenBrushStroke([stroke({ strokeId: undefined, tool: 'smudge' })], 'ink')).toBe(false)
    expect(hasOpenBrushStroke([stroke({ tool: 'pencil' })], 'ink')).toBe(false)
    expect(hasOpenBrushStroke([stroke(), stroke({ id: 'legacy-next', strokeId: undefined })], 'ink')).toBe(false)
  })

  it('accepts an isolated final chunk without needing its older prefix', () => {
    expect(hasOpenBrushStroke([stroke({ strokeEnd: true })], 'ink')).toBe(false)
  })
})

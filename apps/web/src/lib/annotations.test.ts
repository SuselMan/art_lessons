import { describe, it, expect } from 'vitest'

import type { Operation } from '@grafetto/shared'

import {
  applyAnnotationOp, inkPathData, isMeaningfulShape, makeInitialAnnotationState,
  prepareInkPoints, replayAnnotations, simplifyPoints,
} from './annotations'

let seq = 0
function op(partial: Omit<Operation, 'id' | 'userId' | 'timestamp'>, userId = 'u1'): Operation {
  return { ...partial, id: `op${++seq}`, userId, timestamp: seq } as Operation
}

const textShape = { kind: 'text', x: 10, y: 20, color: '#ff0000', size: 48, text: 'wrong angle' } as const
const inkShape = { kind: 'ink', color: '#00ff00', size: 8, points: [0, 0, 10, 10] } as const

describe('applyAnnotationOp', () => {
  it('adds an annotation, stamping id and author from the operation', () => {
    const state = applyAnnotationOp(makeInitialAnnotationState(),
      op({ type: 'annotation_add', annotationId: 'a1', shape: textShape }, 'teacher'))
    expect(state.order).toEqual(['a1'])
    expect(state.items.a1).toEqual({ ...textShape, id: 'a1', authorId: 'teacher' })
  })

  it('leaves unrelated operations alone', () => {
    const before = replayAnnotations([op({ type: 'annotation_add', annotationId: 'a1', shape: textShape })])
    const after = applyAnnotationOp(before, op({ type: 'layer_rename', layerId: 'layer-1', name: 'x' }))
    expect(after).toBe(before)
  })

  it('patches only the fields the patch names', () => {
    const state = replayAnnotations([
      op({ type: 'annotation_add', annotationId: 'a1', shape: textShape }),
      op({ type: 'annotation_update', annotationId: 'a1', patch: { text: 'fixed' } }),
    ])
    expect(state.items.a1).toMatchObject({ text: 'fixed', x: 10, y: 20, color: '#ff0000' })
  })

  it('ignores patch fields that do not belong to the target kind', () => {
    const state = replayAnnotations([
      op({ type: 'annotation_add', annotationId: 'a1', shape: inkShape }),
      // `text` on an ink annotation: legible field, wrong kind. Must not
      // produce an annotation that is neither kind.
      op({ type: 'annotation_update', annotationId: 'a1', patch: { text: 'nope', color: '#0000ff' } }),
    ])
    expect(state.items.a1).toEqual({ ...inkShape, id: 'a1', authorId: 'u1', color: '#0000ff' })
    expect('text' in state.items.a1).toBe(false)
  })

  it('drops an update for an annotation that is gone', () => {
    const state = replayAnnotations([
      op({ type: 'annotation_add', annotationId: 'a1', shape: textShape }),
      op({ type: 'annotation_delete', annotationIds: ['a1'] }),
      op({ type: 'annotation_update', annotationId: 'a1', patch: { text: 'ghost' } }),
    ])
    expect(state.order).toEqual([])
    expect(state.items).toEqual({})
  })

  it('deletes several at once and keeps the rest in order', () => {
    const state = replayAnnotations([
      op({ type: 'annotation_add', annotationId: 'a1', shape: textShape }),
      op({ type: 'annotation_add', annotationId: 'a2', shape: inkShape }),
      op({ type: 'annotation_add', annotationId: 'a3', shape: textShape }),
      op({ type: 'annotation_delete', annotationIds: ['a1', 'a3'] }),
    ])
    expect(state.order).toEqual(['a2'])
    expect(Object.keys(state.items)).toEqual(['a2'])
  })
})

describe('replayAnnotations', () => {
  it('is idempotent — folding the same log twice lands on the same state', () => {
    const log = [
      op({ type: 'annotation_add', annotationId: 'a1', shape: textShape }),
      op({ type: 'annotation_add', annotationId: 'a2', shape: inkShape }),
      op({ type: 'annotation_update', annotationId: 'a1', patch: { x: 99 } }),
    ]
    expect(replayAnnotations([...log, ...log])).toEqual(replayAnnotations(log))
  })

  it('keeps z-order stable when an add is replayed on top of itself', () => {
    // The property this protects: which annotation is drawn on top must not
    // depend on how many times the log was folded.
    const add1 = op({ type: 'annotation_add', annotationId: 'a1', shape: textShape })
    const add2 = op({ type: 'annotation_add', annotationId: 'a2', shape: inkShape })
    expect(replayAnnotations([add1, add2, add1]).order).toEqual(['a1', 'a2'])
  })

  it('produces nothing for a log with no annotation operations', () => {
    expect(replayAnnotations([op({ type: 'layer_add', layerId: 'l2', name: 'L2' })]))
      .toEqual(makeInitialAnnotationState())
  })
})

describe('simplifyPoints', () => {
  it('collapses collinear points', () => {
    expect(simplifyPoints([0, 0, 1, 0, 2, 0, 3, 0], 0.5)).toEqual([0, 0, 3, 0])
  })

  it('keeps a point that deviates past the tolerance', () => {
    expect(simplifyPoints([0, 0, 1, 5, 2, 0], 1)).toEqual([0, 0, 1, 5, 2, 0])
  })

  it('keeps both endpoints of a closed gesture', () => {
    const closed = [0, 0, 5, 5, 0, 0]
    expect(simplifyPoints(closed, 1)).toEqual(closed)
  })

  it('passes short inputs through untouched', () => {
    expect(simplifyPoints([1, 2], 1)).toEqual([1, 2])
    expect(simplifyPoints([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4])
  })
})

describe('prepareInkPoints', () => {
  it('holds a long scribble under the ceiling and keeps its last point', () => {
    // Zig-zag: every point deviates, so simplification alone cannot shrink it
    // and the stride ceiling is what has to.
    const raw: number[] = []
    for (let i = 0; i < 6000; i++) raw.push(i, i % 2 === 0 ? 0 : 40)
    const out = prepareInkPoints(raw, 1)
    expect(out.length >> 1).toBeLessThanOrEqual(2000)
    expect(out.slice(-2)).toEqual(raw.slice(-2))
  })
})

describe('inkPathData', () => {
  it('draws a tap as a zero-length segment so a round cap shows it', () => {
    expect(inkPathData([7, 9])).toBe('M 7 9 L 7 9')
  })

  it('draws a polyline', () => {
    expect(inkPathData([0, 0, 1, 2, 3, 4])).toBe('M 0 0 L 1 2 L 3 4')
  })

  it('draws nothing for no points', () => {
    expect(inkPathData([])).toBe('')
  })
})

describe('isMeaningfulShape', () => {
  it('rejects an empty or whitespace-only note', () => {
    expect(isMeaningfulShape({ ...textShape, text: '   ' })).toBe(false)
    expect(isMeaningfulShape({ ...textShape, text: 'x' })).toBe(true)
  })

  it('rejects an ink gesture with no points', () => {
    expect(isMeaningfulShape({ ...inkShape, points: [] })).toBe(false)
    expect(isMeaningfulShape(inkShape)).toBe(true)
  })
})

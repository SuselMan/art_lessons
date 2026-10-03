import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { mergeReviewHistory, reviewDoneOperations, isReviewAnnotationDraft } from './reviewHistory'

const add: Operation = { id: 'a', seq: 1, userId: 'u', timestamp: 1, type: 'annotation_add', annotationId: 'note', shape: { kind: 'text', x: -12, y: 30, color: '#000000', size: 16, text: 'Note' } }
const undo: Operation = { id: 'undo', seq: 2, userId: 'u', timestamp: 2, type: 'operation_undo', targetOpId: 'a' }
const redo: Operation = { id: 'redo', seq: 3, userId: 'u', timestamp: 3, type: 'operation_redo', targetOpId: 'a' }

describe('early review annotation history', () => {
  it('keeps confirmed notes from before and during restore, once and in server order', () => {
    const update: Operation = { ...add, id: 'update', seq: 4, type: 'annotation_update', annotationId: 'note', patch: { text: 'Corrected' } }
    const history = mergeReviewHistory([update], [add, undo, redo, update])
    expect(history.map(op => op.id)).toEqual(['a', 'undo', 'redo', 'update'])
    expect(reviewDoneOperations(history)).toEqual([add, update])
    expect(mergeReviewHistory(history, [update])).toEqual(history)
  })
  it('folds undo and redo without letting another author undo the note', () => {
    expect(reviewDoneOperations([add, undo])).toEqual([])
    expect(reviewDoneOperations([add, undo, redo])).toEqual([add])
    expect(reviewDoneOperations([add, { ...undo, userId: 'other' }])).toEqual([add])
  })
  it('never resurrects a revoked note', () => {
    const revoke: Operation = { ...undo, id: 'revoke', type: 'operation_revoke' }
    expect(reviewDoneOperations([add, revoke, redo])).toEqual([])
  })
  it('lets only annotations and their own undo/redo bypass the pixel gate', () => {
    expect(isReviewAnnotationDraft(add, [add])).toBe(true)
    expect(isReviewAnnotationDraft(undo, [add])).toBe(true)
    expect(isReviewAnnotationDraft({ ...undo, targetOpId: 'stroke' }, [add])).toBe(false)
    expect(isReviewAnnotationDraft({ type: 'layer_add', layerId: 'layer', name: 'Layer' }, [add])).toBe(false)
  })
})

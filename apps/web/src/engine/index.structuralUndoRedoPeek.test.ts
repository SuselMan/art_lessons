// Engine-level tests for #263: peekUndo()/peekRedo() must give the caller
// (Room's handleUndo/handleRedo, see its own doc comment) a read-only look
// at whether the pending undo/redo is about to act on a structural op
// (layer_add/layer_delete/layer_merge) whose layer(s) currently carry done
// pixel content from ANY author — the exact scenario reproduced by #263's
// issue body (a teacher's own layer_add undo silently wiping students'
// strokes painted onto that layer since). Neither method may mutate
// anything: they're peeks, not the real undo()/redo().
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, fillStroke, hasLayerBuffer, makeLayerAdd, makeLayerDelete, makeLayerMerge, makeStroke,
  readLayerPixels,
} from './testing/engineTestUtils'

describe('#263: peekUndo/peekRedo', () => {
  it('reports content-at-risk when undoing a layer_add that has other-authored strokes on it, without mutating anything', () => {
    const { engine } = createTestEngine({ userId: 'teacher' }, { width: 8, height: 8 })

    engine.appendOperation(makeLayerAdd('teacher', 'L'))
    engine.appendOperation(fillStroke('student-1', 'L', 4, 4, 3))
    engine.appendOperation(fillStroke('student-2', 'L', 2, 2, 2))
    const painted = readLayerPixels(engine, 'L')!
    expect(painted.some(v => v > 0)).toBe(true)

    const peek = engine.peekUndo()
    expect(peek).toEqual({ layerId: 'L', hasOtherContent: true })

    // Purely a peek: the layer/pixels/log are all untouched.
    expect(hasLayerBuffer(engine, 'L')).toBe(true)
    expect(readLayerPixels(engine, 'L')).toEqual(painted)
    expect(engine.getOperations().some(op => op.type === 'layer_add')).toBe(true)

    // The real undo() still behaves exactly as before.
    expect(engine.undo()?.type).toBe('layer_add')
    expect(hasLayerBuffer(engine, 'L')).toBe(false)
  })

  it('reports no content-at-risk for an empty layer_add (nothing painted on it yet)', () => {
    const { engine } = createTestEngine({ userId: 'teacher' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('teacher', 'L'))

    expect(engine.peekUndo()).toEqual({ layerId: 'L', hasOtherContent: false })
  })

  it('returns null for a plain stroke undo target — the common case must never show a spurious confirm', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))

    expect(engine.peekUndo()).toBeNull()
  })

  it('returns null cleanly when there is no history at all', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    expect(engine.peekUndo()).toBeNull()
    expect(engine.peekRedo()).toBeNull()
  })

  it('peekRedo reports content-at-risk for a redo that would re-delete a layer another participant has since repainted', () => {
    const { engine } = createTestEngine({ userId: 'teacher' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('teacher', 'L'))
    engine.appendOperation(makeLayerDelete('teacher', ['L']))
    expect(hasLayerBuffer(engine, 'L')).toBe(false)

    // Undo the delete: L comes back. peekRedo now sees the still-undone
    // layer_delete as the redo candidate.
    expect(engine.undo()?.type).toBe('layer_delete')
    expect(hasLayerBuffer(engine, 'L')).toBe(true)

    // Another participant paints onto the restored layer before the delete
    // is redone.
    engine.appendOperation(makeStroke('student-1', 'L', [dab(4, 4, { size: 6, opacity: 1 })]))
    expect(readLayerPixels(engine, 'L')!.some(v => v > 0)).toBe(true)

    const peek = engine.peekRedo()
    expect(peek).toEqual({ layerId: 'L', hasOtherContent: true })

    // Still just a peek.
    expect(hasLayerBuffer(engine, 'L')).toBe(true)
  })

  it('peekUndo reports content-at-risk for a layer_merge whose merged result has since been painted on', () => {
    const { engine } = createTestEngine({ userId: 'teacher' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('teacher', 'A'))
    engine.appendOperation(makeLayerAdd('teacher', 'B'))
    engine.appendOperation(makeLayerMerge('teacher', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))
    expect(hasLayerBuffer(engine, 'M')).toBe(true)

    engine.appendOperation(fillStroke('student-1', 'M', 8, 8, 3))

    expect(engine.peekUndo()).toEqual({ layerId: 'M', hasOtherContent: true })
  })
})

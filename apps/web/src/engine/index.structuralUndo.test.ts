// Engine-level integration tests for #101: structural-operation undo/redo
// (layer_add / layer_delete / layer_merge / layer_move / folder_add) exercised
// against a *real* PencilEngine with actual pixel buffers (via MockGL — see
// testing/mockGL.ts), not just the pure LayerState reducer (lib/layers.test.ts)
// or the generic done/undone/gone mechanics (OperationLog.test.ts).
//
// These specifically target the gap identified in #101: nothing previously
// verified that after a structural op + undo/redo, the *pixels* in the
// affected buffers are actually correct — which is exactly where checkpoint
// invalidation bugs or recursive-merge-replay bugs would hide silently.
import { describe, expect, it } from 'vitest'

import { nanoid } from 'nanoid'

import {
  checkpointCountFor, clearCheckpoints, createTestEngine, dab, expectPixelsClose, expectPixelsEqual,
  fillStroke, hasLayerBuffer, makeLayerAdd, makeLayerDelete, makeLayerMerge, makeStroke, readLayerPixels,
} from './testing/engineTestUtils'

describe('layer_add: undo/redo buffer lifecycle and pixels', () => {
  it('creates, destroys, and recreates the buffer in lockstep with undo/redo, replaying pixels correctly at every step', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    expect(hasLayerBuffer(engine, 'L1')).toBe(true)
    expect(readLayerPixels(engine, 'L1')!.every(v => v === 0)).toBe(true)

    engine.appendOperation(fillStroke('user-a', 'L1', 4, 4, 3))
    const painted = readLayerPixels(engine, 'L1')!
    expect(painted.some(v => v > 0)).toBe(true)

    // undo the stroke: buffer survives, pixels revert to empty
    expect(engine.undo()?.type).toBe('stroke')
    expect(hasLayerBuffer(engine, 'L1')).toBe(true)
    expect(readLayerPixels(engine, 'L1')!.every(v => v === 0)).toBe(true)

    // undo the layer_add: buffer is destroyed entirely
    expect(engine.undo()?.type).toBe('layer_add')
    expect(hasLayerBuffer(engine, 'L1')).toBe(false)

    // redo layer_add: buffer recreated, still empty (stroke still undone)
    expect(engine.redo()?.type).toBe('layer_add')
    expect(hasLayerBuffer(engine, 'L1')).toBe(true)
    expect(readLayerPixels(engine, 'L1')!.every(v => v === 0)).toBe(true)

    // redo the stroke: pixels exactly match the original paint
    expect(engine.redo()?.type).toBe('stroke')
    expectPixelsEqual(readLayerPixels(engine, 'L1'), painted)
  })
})

describe('layer_delete: undo restores prior pixel content, redo removes it again', () => {
  it('restores the deleted layer\'s actual painted content on undo, not an empty buffer', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.appendOperation(fillStroke('user-a', 'L1', 4, 4, 3))
    const painted = readLayerPixels(engine, 'L1')!
    expect(painted.some(v => v > 0)).toBe(true)

    engine.appendOperation(makeLayerDelete('user-a', ['L1']))
    expect(hasLayerBuffer(engine, 'L1')).toBe(false)

    expect(engine.undo()?.type).toBe('layer_delete')
    expect(hasLayerBuffer(engine, 'L1')).toBe(true)
    // The critical assertion: restored content, not a blank buffer.
    expectPixelsEqual(readLayerPixels(engine, 'L1'), painted)

    expect(engine.redo()?.type).toBe('layer_delete')
    expect(hasLayerBuffer(engine, 'L1')).toBe(false)
  })
})

describe('layer_merge: undo restores sources, redo restores the merged result', () => {
  it('undo destroys the merged layer and restores both sources with their original content', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    const paintedA = readLayerPixels(engine, 'A')!

    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'B', 12, 12, 3))
    const paintedB = readLayerPixels(engine, 'B')!

    engine.appendOperation(makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))
    expect(hasLayerBuffer(engine, 'A')).toBe(false)
    expect(hasLayerBuffer(engine, 'B')).toBe(false)
    const mergedPixels = readLayerPixels(engine, 'M')!
    expect(mergedPixels.some(v => v > 0)).toBe(true)

    expect(engine.undo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'M')).toBe(false)
    expect(hasLayerBuffer(engine, 'A')).toBe(true)
    expect(hasLayerBuffer(engine, 'B')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A'), paintedA)
    expectPixelsEqual(readLayerPixels(engine, 'B'), paintedB)

    expect(engine.redo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'A')).toBe(false)
    expect(hasLayerBuffer(engine, 'B')).toBe(false)
    expectPixelsEqual(readLayerPixels(engine, 'M'), mergedPixels)
  })
})

describe('layer_merge of a merge result: recursive _replayMergeInto reproduces the live composite exactly', () => {
  it('rebuilding a merge-of-a-merge from scratch (no checkpoints available) matches the original live composite bit-for-bit', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 3, 3, 3))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'B', 12, 3, 3))
    engine.appendOperation(makeLayerMerge('user-a', 'M1', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))

    engine.appendOperation(makeLayerAdd('user-a', 'C'))
    engine.appendOperation(fillStroke('user-a', 'C', 7, 12, 3))
    engine.appendOperation(makeLayerMerge('user-a', 'M2', [{ id: 'M1', opacity: 1 }, { id: 'C', opacity: 1 }]))

    const liveM2 = readLayerPixels(engine, 'M2')!
    expect(liveM2.some(v => v > 0)).toBe(true)
    // Sanity: the live merge path took its own immediate checkpoints for
    // both M1 and M2 (see _execMergeLive) — that's what would normally
    // short-circuit a rebuild and hide the recursive replay path entirely.
    expect(checkpointCountFor(engine, 'M1')).toBe(1)
    expect(checkpointCountFor(engine, 'M2')).toBe(1)

    // Undo M2 (destroys M2, restores M1 [via its checkpoint] and C).
    expect(engine.undo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'M2')).toBe(false)
    expect(hasLayerBuffer(engine, 'M1')).toBe(true)
    expect(hasLayerBuffer(engine, 'C')).toBe(true)

    // Simulate checkpoint eviction (the real trigger is CHECKPOINT_BUDGET_BYTES
    // pressure in a long real session with large canvases — impractical to
    // reach honestly with an 16x16 test canvas) so redoing M2 is forced
    // through _replayMergeInto's from-scratch recursive path for both M2 and
    // its M1 source, instead of the checkpoint fast path.
    clearCheckpoints(engine)

    expect(engine.redo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'M2')).toBe(true)
    expect(hasLayerBuffer(engine, 'M1')).toBe(false)
    expect(hasLayerBuffer(engine, 'C')).toBe(false)

    // No checkpoints were used anywhere in this rebuild (start===0 replay all
    // the way down), so this must be byte-for-byte identical to the live
    // composite — no quantization round-trip is involved on either side.
    expectPixelsEqual(readLayerPixels(engine, 'M2'), liveM2)
  })
})

describe('checkpoint invalidation: stale prefixes are rejected, valid ones are reused correctly', () => {
  it('undoing below a checkpoint boundary forces full replay (not a stale/deeper snapshot); redoing past it revalidates and reuses the same checkpoint', async () => {
    const CHECKPOINT_INTERVAL = 20
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    const strokeAt = (): ReturnType<typeof makeStroke> =>
      makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.2 })])

    const totalStrokes = CHECKPOINT_INTERVAL + 5 // 25: crosses one checkpoint boundary
    // Checkpointing is deferred off the stroke-completion path (#121) — flush
    // right at the #20 boundary, before the remaining 5 strokes, so the
    // checkpoint this test depends on actually bakes at op #20 and not later
    // (a real interactive session always yields between strokes; only this
    // tight synchronous loop needs the explicit flush).
    for (let i = 0; i < CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeAt())
    await new Promise(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < totalStrokes - CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeAt())

    expect(checkpointCountFor(engine, 'L')).toBe(1) // taken exactly once, at op #20
    const pixelsAt25 = readLayerPixels(engine, 'L')!
    expect(pixelsAt25.some(v => v > 0 && v < 255)).toBe(true) // meaningfully non-saturated, non-empty

    // Independent ground truth: a fresh engine painting only the first 15
    // strokes, with no checkpoint involved at all (15 < CHECKPOINT_INTERVAL).
    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    for (let i = 0; i < totalStrokes - 10; i++) refEngine.appendOperation(strokeAt())
    const referenceAt15 = readLayerPixels(refEngine, 'L')!

    // Undo 10 strokes (25 -> 15), crossing back below the op #20 checkpoint.
    for (let i = 0; i < 10; i++) expect(engine.undo()?.type).toBe('stroke')

    // The checkpoint (opIds.length === 20) is now deeper than the current
    // done-ops tail (15) and MUST be rejected outright (_bestCheckpoint's
    // `cp.opIds.length > ops.length` guard) rather than used as some
    // approximation — falling back to a full from-scratch replay of the 15
    // done strokes. That replay never restores any 8-bit snapshot, so this
    // must match the independent reference exactly.
    expectPixelsEqual(readLayerPixels(engine, 'L'), referenceAt15)
    // The stale checkpoint itself is untouched (not evicted, not mutated) —
    // it becomes usable again once done-ops reach 20.
    expect(checkpointCountFor(engine, 'L')).toBe(1)

    // Redo all 10 back. Once the done-prefix reaches exactly the checkpoint's
    // 20 recorded op ids again, _bestCheckpoint must revalidate and reuse
    // that same checkpoint (id-for-id match) for the last 5 redos' replay
    // base, rather than continuing to replay from scratch or picking nothing.
    for (let i = 0; i < 10; i++) expect(engine.redo()?.type).toBe('stroke')

    // This final state is reached via checkpoint-restore + a 5-stroke replay
    // tail, i.e. one 8-bit quantize/dequantize round-trip at the boundary —
    // an inherent property of an 8-bit-texture-backed snapshot, not a bug.
    // A real checkpoint-selection bug (wrong id, wrong layer, wrong prefix)
    // would produce a gross mismatch, far outside this tolerance.
    expectPixelsClose(readLayerPixels(engine, 'L'), pixelsAt25, 2)
    expect(checkpointCountFor(engine, 'L')).toBe(1)
  })
})

describe('layer_move / folder_add interleaved with pixel-op undo: structure ops never touch buffers', () => {
  it('undoing/redoing across intervening structure-only ops leaves pixel replay unaffected and never crashes', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 2))
    const afterStroke1 = readLayerPixels(engine, 'L')!

    engine.appendOperation({ id: 'folder-1', type: 'folder_add', userId: 'user-a', timestamp: 100, layerId: 'F', name: 'Folder' })
    engine.appendOperation({ id: 'move-1', type: 'layer_move', userId: 'user-a', timestamp: 101, layerId: 'L', parentId: 'F', index: 0 })

    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 2))
    const afterStroke2 = readLayerPixels(engine, 'L')!
    expect(afterStroke2).not.toEqual(afterStroke1)

    // undo stroke2 -> layer_move -> folder_add -> stroke1 -> layer_add
    expect(engine.undo()?.type).toBe('stroke')
    expectPixelsEqual(readLayerPixels(engine, 'L'), afterStroke1)

    expect(engine.undo()?.type).toBe('layer_move')
    // Structure-only: buffer/pixels for L must be completely unaffected.
    expect(hasLayerBuffer(engine, 'L')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), afterStroke1)
    expect(engine.getOperations().some(op => op.type === 'layer_move')).toBe(false)

    expect(engine.undo()?.type).toBe('folder_add')
    expect(hasLayerBuffer(engine, 'L')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), afterStroke1)
    expect(engine.getOperations().some(op => op.type === 'folder_add')).toBe(false)

    expect(engine.undo()?.type).toBe('stroke')
    expect(readLayerPixels(engine, 'L')!.every(v => v === 0)).toBe(true)

    expect(engine.undo()?.type).toBe('layer_add')
    expect(hasLayerBuffer(engine, 'L')).toBe(false)

    // Redo everything back; final state matches the original.
    expect(engine.redo()?.type).toBe('layer_add')
    expect(engine.redo()?.type).toBe('stroke')
    expect(engine.redo()?.type).toBe('folder_add')
    expect(engine.getOperations().some(op => op.type === 'folder_add')).toBe(true)
    expect(engine.redo()?.type).toBe('layer_move')
    expect(engine.getOperations().some(op => op.type === 'layer_move')).toBe(true)
    expect(engine.redo()?.type).toBe('stroke')
    expectPixelsEqual(readLayerPixels(engine, 'L'), afterStroke2)
  })
})

describe('per-user isolation: layer_add / stroke', () => {
  it('one user\'s undo only ever touches their own latest done op, never another user\'s layer/pixel state', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })

    engine.appendOperation(makeLayerAdd('user-a', 'LA'))
    engine.appendOperation(fillStroke('user-a', 'LA', 4, 4, 2))

    engine.appendOperation(makeLayerAdd('user-b', 'LB'))
    engine.appendOperation(fillStroke('user-b', 'LB', 4, 4, 2))
    const pixelsLB = readLayerPixels(engine, 'LB')!
    expect(pixelsLB.some(v => v > 0)).toBe(true)

    // engine is user-a's session: undo() must only ever unwind user-a's ops.
    expect(engine.undo()?.userId).toBe('user-a') // undoes user-a's stroke
    expect(hasLayerBuffer(engine, 'LB')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'LB'), pixelsLB)

    expect(engine.undo()?.userId).toBe('user-a') // undoes user-a's layer_add
    expect(hasLayerBuffer(engine, 'LA')).toBe(false)
    expect(hasLayerBuffer(engine, 'LB')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'LB'), pixelsLB)

    // No more done ops for user-a: undo() must return null, not reach into user-b's history.
    expect(engine.undo()).toBeNull()
    expect(hasLayerBuffer(engine, 'LB')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'LB'), pixelsLB)

    // Switching the engine's identity to user-b now correctly unwinds *their* op.
    engine.setUserId('user-b')
    expect(engine.undo()?.userId).toBe('user-b')
    expect(hasLayerBuffer(engine, 'LB')).toBe(true)
    expect(readLayerPixels(engine, 'LB')!.every(v => v === 0)).toBe(true)
  })
})

describe('per-user isolation: layer_merge / layer_delete', () => {
  it('user A undoing their own ops never disturbs user B\'s independently-authored merge', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))

    engine.appendOperation(makeLayerAdd('user-b', 'B1'))
    engine.appendOperation(fillStroke('user-b', 'B1', 4, 4, 3))
    const paintedB1 = readLayerPixels(engine, 'B1')!
    engine.appendOperation(makeLayerAdd('user-b', 'B2'))
    engine.appendOperation(fillStroke('user-b', 'B2', 12, 12, 3))
    const paintedB2 = readLayerPixels(engine, 'B2')!
    engine.appendOperation(makeLayerMerge('user-b', 'BM', [{ id: 'B1', opacity: 1 }, { id: 'B2', opacity: 1 }]))
    const paintedBM = readLayerPixels(engine, 'BM')!

    // user-a undoes their own two ops; user-b's merge must be untouched throughout.
    expect(engine.undo()?.userId).toBe('user-a') // stroke on A
    expectPixelsEqual(readLayerPixels(engine, 'BM'), paintedBM)
    expect(engine.undo()?.userId).toBe('user-a') // layer_add A
    expect(hasLayerBuffer(engine, 'A')).toBe(false)
    expect(hasLayerBuffer(engine, 'BM')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'BM'), paintedBM)

    // Now switch to user-b and undo their merge: BM destroyed, B1/B2 restored
    // with their original content (not blank buffers).
    engine.setUserId('user-b')
    expect(engine.undo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'BM')).toBe(false)
    expect(hasLayerBuffer(engine, 'B1')).toBe(true)
    expect(hasLayerBuffer(engine, 'B2')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'B1'), paintedB1)
    expectPixelsEqual(readLayerPixels(engine, 'B2'), paintedB2)
  })
})

describe('checkpoint invalidation: a mid-history operation_revoke shifts the done prefix', () => {
  it('rejects a checkpoint baked before a revoke removed one of its ops from the middle of the sequence', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    const strokeAt = (): ReturnType<typeof makeStroke> =>
      makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.2 })])

    const strokes = Array.from({ length: 20 }, () => strokeAt())
    for (const s of strokes) engine.appendOperation(s)
    // Checkpointing is deferred off the stroke-completion path (#121) —
    // flush the pending macrotask so the checkpoint this test depends on has
    // actually been taken before asserting.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(checkpointCountFor(engine, 'L')).toBe(1) // baked at op #20, opIds = all 20 strokes

    // A teacher revokes the 10th stroke (not the latest — the middle of the
    // sequence). This is not the author's undo: it goes straight to 'gone'
    // and permanently removes that op from every future done-ops prefix.
    const revoked = strokes[9]
    engine.appendOperation({ id: nanoid(10), type: 'operation_revoke', userId: 'teacher', timestamp: 999, targetOpId: revoked.id })
    expect(engine.getOperations().some(op => op.id === revoked.id)).toBe(false)

    // Independent ground truth: fresh engine painting the same 19 surviving
    // strokes (skipping the revoked one), no checkpoint involved.
    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    for (const s of strokes) if (s.id !== revoked.id) refEngine.appendOperation(s)
    const reference = readLayerPixels(refEngine, 'L')!

    // The stale checkpoint (baked when stroke #10 was still in the prefix)
    // must be rejected — its opIds no longer match the post-revoke done
    // sequence at every index from #10 onward — falling back to full replay.
    expectPixelsEqual(readLayerPixels(engine, 'L'), reference)
  })
})

describe('network race: a pixel op racing layer destruction must not resurface on undo (#101 bug fix)', () => {
  it('a stroke that arrives (in true seq order) after its layer was deleted is revoked, not silently replayed once the delete is undone', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    const beforeDelete = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeLayerDelete('user-a', ['L']))
    expect(hasLayerBuffer(engine, 'L')).toBe(false)

    // A stroke for L authored before the delete was known to its author,
    // but landing after it in the shared log's true total order (a real
    // possibility over the network — the server never validates a pixel
    // op's target against current layer existence, see socketHandlers.ts).
    const orphan = makeStroke('user-b', 'L', [dab(1, 1, { size: 4, opacity: 1 })])
    engine.appendOperation(orphan)
    // It had no live effect (buffer didn't exist)...
    expect(engine.getOperations().some(op => op.id === orphan.id)).toBe(false)

    // ...and undoing the delete must restore L exactly as it was at deletion
    // time — not also replay the orphan stroke it never actually applied.
    expect(engine.undo()?.type).toBe('layer_delete')
    expectPixelsEqual(readLayerPixels(engine, 'L'), beforeDelete)

    // The orphan is permanently gone: its own author can't redo it either.
    expect(engine.getOperations().some(op => op.id === orphan.id)).toBe(false)
  })

  it('a stroke that arrives after its layer was consumed as a merge source is revoked, not replayed once the merge is undone', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    const beforeMergeA = readLayerPixels(engine, 'A')!
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'B', 12, 12, 3))

    engine.appendOperation(makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))
    expect(hasLayerBuffer(engine, 'A')).toBe(false)

    const orphan = makeStroke('user-b', 'A', [dab(1, 1, { size: 4, opacity: 1 })])
    engine.appendOperation(orphan)
    expect(engine.getOperations().some(op => op.id === orphan.id)).toBe(false)

    expect(engine.undo()?.type).toBe('layer_merge')
    expect(hasLayerBuffer(engine, 'A')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A'), beforeMergeA)
  })
})

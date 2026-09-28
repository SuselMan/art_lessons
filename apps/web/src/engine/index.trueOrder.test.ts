// (#537) Every client's layers converge to the server's order — including the
// client whose own operation painted before the server had ordered it.
//
// Each test builds the same room twice: once the way a client actually lives
// it (its own operations optimistic, a peer's arriving later with an *earlier*
// seq), and once as a reference engine that received everything already in
// seq order — what a fresh joiner replays. The layer pixels must match.
//
// Pencil and eraser only, on purpose: MockGL rasterizes their dabs and blends
// them faithfully (see testing/mockGL.ts), so order is observable in its
// pixels. The marker's is not — the e2e spec (e2e/specs/trueOrder.spec.ts)
// covers the real GPU.
import type { Dab, Operation } from '@grafetto/shared'
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { PencilEngine, PeerLivePacket } from './index'
import {
  createTestEngine, dab, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerMerge, makeStroke,
  paperReady, readLayerPixels, simulateStrokeEnd, simulateStrokeMove, simulateStrokeStart,
} from './testing/engineTestUtils'

const SIZE = { width: 16, height: 16 }
const ME = 'me'
const PEER = 'peer'

/** A horizontal ink bar through the middle of the canvas. */
function bar(userId: string, layerId: string, overrides: Partial<Parameters<typeof makeStroke>[3]> = {}) {
  const dabs: Dab[] = []
  for (let x = 2; x <= 14; x += 2) dabs.push(dab(x, 8, { size: 4, pressure: 1, opacity: 1 }))
  return makeStroke(userId, layerId, dabs, overrides)
}

/** A vertical erase through the middle of the canvas — crosses the bar. */
function erase(userId: string, layerId: string, overrides: Partial<Parameters<typeof makeStroke>[3]> = {}) {
  const dabs: Dab[] = []
  for (let y = 2; y <= 14; y += 2) dabs.push(dab(8, y, { size: 4, pressure: 1, opacity: 1 }))
  return makeStroke(userId, layerId, dabs, { tool: 'eraser', ...overrides })
}

const seq = <T extends Operation>(op: T, n: number): T => ({ ...op, seq: n })

/** What a joiner replays: every operation, from the server, in seq order. */
function reference(ops: Operation[], layerId: string): Uint8Array | null {
  const { engine } = createTestEngine({ userId: 'joiner' }, SIZE)
  for (const op of [...ops].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) engine.appendOperation(op, 'remote')
  return readLayerPixels(engine, layerId)
}

function client(): PencilEngine {
  const { engine } = createTestEngine({ userId: ME }, SIZE)
  return engine
}

const ids = (engine: PencilEngine) => engine.getOperations().map(op => op.id)

describe('a peer operation ordered before this client’s own pending one', () => {
  it('goes under it, not over it: the erase the room put first does not cut the later line', () => {
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    const peerErase = erase(PEER, 'L')
    const mine = bar(ME, 'L')

    const engine = client()
    engine.appendOperation(add, 'remote')
    engine.appendOperation(mine) // painted at pen-up, seq unknown
    engine.appendOperation(seq(peerErase, 2), 'remote') // the room ordered it first

    const truth = reference([add, seq(peerErase, 2), seq(mine, 3)], 'L')
    expect(readLayerPixels(engine, 'L')!.some(v => v > 0)).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), truth)
    expect(ids(engine)).toEqual([add.id, peerErase.id, mine.id])

    // And its own confirmation, arriving right after, changes nothing more.
    expect(engine.confirmOperation(mine.id, 3)).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), truth)
    expect(ids(engine)).toEqual([add.id, peerErase.id, mine.id])
  })

  it('a layer_clear the room put first leaves this client’s later stroke on the layer', () => {
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    const clear: Operation = { id: 'clear-1', type: 'layer_clear', userId: PEER, layerId: 'L', timestamp: 0 }
    const mine = fillStroke(ME, 'L', 8, 8, 6)

    const engine = client()
    engine.appendOperation(add, 'remote')
    engine.appendOperation(mine)
    engine.appendOperation(seq(clear, 2), 'remote')

    const truth = reference([add, seq(clear, 2), seq(mine, 3)], 'L')
    expect(truth!.some(v => v > 0)).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), truth)
  })

  it('re-settles only the layer they share — another layer is left alone', () => {
    const addL = seq(makeLayerAdd(PEER, 'L'), 1)
    const addM = seq(makeLayerAdd(PEER, 'M'), 2)
    const engine = client()
    engine.appendOperation(addL, 'remote')
    engine.appendOperation(addM, 'remote')
    engine.appendOperation(bar(ME, 'L'))
    engine.appendOperation(seq(erase(PEER, 'M'), 3), 'remote')
    expect(engine.resettleCount()).toBe(0)
    engine.appendOperation(seq(erase(PEER, 'L'), 4), 'remote')
    expect(engine.resettleCount()).toBe(1)
  })
})

describe('this client’s own operations confirmed out of the order they were made', () => {
  // The outbox retries: an earlier operation can reach the server after a
  // later one and be ordered after it.
  it('end up in the server’s order, pixels included', () => {
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    const line = bar(ME, 'L')
    const rub = erase(ME, 'L')

    const engine = client()
    engine.appendOperation(add, 'remote')
    engine.appendOperation(line)
    engine.appendOperation(rub)
    engine.confirmOperation(rub.id, 2)
    engine.confirmOperation(line.id, 3)

    expect(ids(engine)).toEqual([add.id, rub.id, line.id])
    expectPixelsEqual(readLayerPixels(engine, 'L'), reference([add, seq(rub, 2), seq(line, 3)], 'L'))
  })

  it('a second confirmation of the same operation (ack and broadcast) is a no-op', () => {
    const engine = client()
    engine.appendOperation(seq(makeLayerAdd(PEER, 'L'), 1), 'remote')
    const line = bar(ME, 'L')
    engine.appendOperation(line)
    expect(engine.confirmOperation(line.id, 2)).toBe(true)
    expect(engine.confirmOperation(line.id, 2)).toBe(false)
    expect(engine.resettleCount()).toBe(0)
  })
})

describe('an operation the server refused', () => {
  it('comes back off the canvas and out of the history', () => {
    const engine = client()
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    engine.appendOperation(add, 'remote')
    const line = bar(ME, 'L')
    engine.appendOperation(line)
    expect(readLayerPixels(engine, 'L')!.some(v => v > 0)).toBe(true)

    expect(engine.discardOperation(line.id)).toBe(true)
    expect(readLayerPixels(engine, 'L')!.every(v => v === 0)).toBe(true)
    expect(ids(engine)).toEqual([add.id])
  })

  it('only ever means one of this client’s own pending operations', () => {
    const engine = client()
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    engine.appendOperation(add, 'remote')
    expect(engine.discardOperation(add.id)).toBe(false)
    expect(ids(engine)).toEqual([add.id])
  })

  // An undo paints nothing itself: refusing it has to bring back what it hid.
  it('a refused undo puts its target back on the canvas', () => {
    const engine = client()
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    engine.appendOperation(add, 'remote')
    const line = bar(ME, 'L')
    engine.appendOperation(line)
    engine.confirmOperation(line.id, 2)
    const before = readLayerPixels(engine, 'L')
    expect(engine.undo()?.id).toBe(line.id)
    expect(readLayerPixels(engine, 'L')!.every(v => v === 0)).toBe(true)

    const undoOp = engine.getOperations().find(op => op.type === 'operation_undo')!
    expect(engine.discardOperation(undoOp.id)).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
    expect(ids(engine)).toEqual([add.id, line.id])
  })
})

describe('a merge ordered before this client’s pending stroke on its source', () => {
  // The server will refuse the stroke (its layer is gone by then), but until
  // it does, the merge result must not have baked it in: every other client's
  // merge result never saw it.
  it('does not carry the stroke into the merged layer', () => {
    const addA = seq(makeLayerAdd(PEER, 'A'), 1)
    const addB = seq(makeLayerAdd(PEER, 'B'), 2)
    const peerInk = seq(fillStroke(PEER, 'A', 4, 4, 3), 3)
    const merge = seq(makeLayerMerge(PEER, 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]), 4)

    const engine = client()
    for (const op of [addA, addB, peerInk]) engine.appendOperation(op, 'remote')
    const mine = fillStroke(ME, 'A', 12, 12, 3)
    engine.appendOperation(mine)
    engine.appendOperation(merge, 'remote')

    expectPixelsEqual(readLayerPixels(engine, 'M'), reference([addA, addB, peerInk, merge], 'M'))
  })
})

describe('a peer’s live-streamed gesture (#429) with another operation committed across it', () => {
  function packet(dabs: Dab[], packetSeq: number): PeerLivePacket {
    return { strokeId: 'g1', layerId: 'L', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], packetSeq, dabs }
  }

  it('re-settles once the gesture’s operation lands, into the order the room gave them', () => {
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    const line = bar(PEER, 'L', { strokeId: 'g1' })
    const rub = erase('third', 'L')

    const engine = client()
    engine.appendOperation(add, 'remote')
    // The line streams in live first…
    engine.appendPeerLiveDabs(PEER, packet(strokeDabs(line), 0))
    // …an erase the room ordered *before* it commits across the live ink…
    engine.appendOperation(seq(rub, 2), 'remote')
    // …and nothing can be settled while that ink is still unrecorded.
    expect(engine.resettleCount()).toBe(0)
    engine.endPeerLiveStroke(PEER, 'g1')
    engine.appendOperation(seq(line, 3), 'remote')

    expectPixelsEqual(readLayerPixels(engine, 'L'), reference([add, seq(rub, 2), seq(line, 3)], 'L'))
    expect(engine.resettleCount()).toBe(1)
  })
})

describe('the pen under this user’s hand (#429)', () => {
  it('is never re-settled under: the rebuild waits for pen-up', async () => {
    const { engine } = createTestEngine({ userId: ME, size: 4 }, SIZE)
    await paperReady(engine)
    const add = seq(makeLayerAdd(PEER, 'L'), 1)
    engine.appendOperation(add, 'remote')
    engine.setActiveLayer('L')
    const line = bar(ME, 'L')
    engine.appendOperation(line)

    simulateStrokeStart(engine, 2, 3)
    simulateStrokeMove(engine, 8, 3)
    engine.appendOperation(seq(erase(PEER, 'L'), 2), 'remote')
    expect(engine.resettleCount()).toBe(0)
    simulateStrokeMove(engine, 14, 3)
    simulateStrokeEnd(engine, 14, 3)
    expect(engine.resettleCount()).toBe(1)

    // Settled against the log: the erase under both of this client's strokes.
    const ops = engine.getOperations()
    expect(ops.map(op => op.id).slice(0, 3)).toEqual([add.id, ops[1].id, line.id])
    expect(ops[1].type === 'stroke' && ops[1].tool).toBe('eraser')
    expectPixelsEqual(readLayerPixels(engine, 'L'), reference(ops, 'L'))
  })
})

describe('a network snapshot', () => {
  // Its seq is above any watermark this client has seen, so a joiner restoring
  // these pixels would get the operation again and paint it twice.
  it('leaves out a layer holding this client’s unconfirmed operations', () => {
    const engine = client()
    engine.appendOperation(seq(makeLayerAdd(PEER, 'L'), 1), 'remote')
    engine.appendOperation(seq(fillStroke(PEER, 'L', 4, 4, 3), 2), 'remote')
    const line = bar(ME, 'L')
    engine.appendOperation(line)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    engine.confirmOperation(line.id, 3)
    expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
  })
})

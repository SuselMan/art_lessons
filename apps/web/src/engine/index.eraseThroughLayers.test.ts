// #520: an eraser set to go through layers takes pixels off every visible,
// unlocked layer in one pass instead of only the active one.
//
// The whole design rests on one claim about the log, and that is what this file
// is mostly about: the gesture is recorded as N ordinary single-layer
// StrokeOperations sharing one `strokeId`, not as a new kind of operation. That
// is what lets the server, the snapshot coverage and the owner-lock check stay
// exactly as they are — each operation is a plain stroke as far as any of them
// can tell — while undo still treats the whole thing as one movement of the
// hand, via OperationLog._gestureEntries, which already had to group a long
// stroke's chunks for the same reason.
//
// So the assertions here are about the operations and about undo, not only
// about pixels: the pixels are the easy half, and the half that would still
// look right on the drawer's own screen while every peer rebuilt something
// different from the log.
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { PeerLivePacket } from './index'
import {
  alphaAt, createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, paperReady, readLayerPixels,
  simulateStroke,
} from './testing/engineTestUtils'

const CANVAS = { width: 64, height: 64 }
const LAYERS = ['top', 'mid', 'low']

/** Three inked layers with `top` active, and the eraser in hand. The ink
 *  matters: an eraser over nothing removes nothing, so a test that skipped it
 *  would pass just as well against an engine that never touched the other two
 *  layers at all. */
async function inkedEngine(options: Record<string, unknown> = {}) {
  const { engine } = createTestEngine({ userId: 'me', size: 12, ...options }, CANVAS)
  for (const id of LAYERS) {
    engine.appendOperation(makeLayerAdd('me', id))
    engine.appendOperation(fillStroke('me', id, 32, 32, 24))
  }
  engine.setActiveLayer('top')
  engine.setTool('eraser')
  await paperReady(engine)
  return engine
}

function strokeOpsSince(engine: ReturnType<typeof createTestEngine>['engine'], from: number) {
  return engine.getOperations().slice(from).filter(op => op.type === 'stroke')
}

function eraseAcross(engine: ReturnType<typeof createTestEngine>['engine']): void {
  simulateStroke(engine, [{ x: 20, y: 32 }, { x: 32, y: 32 }, { x: 44, y: 32 }])
}

describe('eraser through layers — what reaches the log', () => {
  it('records one stroke operation per layer, all under one strokeId', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers(LAYERS)
    const before = engine.getOperations().length

    eraseAcross(engine)

    const ops = strokeOpsSince(engine, before)
    expect(ops.map(op => op.layerId).sort()).toEqual([...LAYERS].sort())
    // One gesture, so one id — this is the entire mechanism by which undo,
    // here and on every peer, takes all three back together.
    const strokeIds = new Set(ops.map(op => op.strokeId))
    expect(strokeIds.size).toBe(1)
    expect([...strokeIds][0]).toBeTruthy()
    // Distinct operations, not the same one three times: each has to be
    // separately addressable in the log (undo targets one by id, the server
    // stores one row each).
    expect(new Set(ops.map(op => op.id)).size).toBe(3)
  })

  it('gives every layer the same dabs, so one pass takes the same amount off each', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers(LAYERS)
    const before = engine.getOperations().length

    eraseAcross(engine)

    const ops = strokeOpsSince(engine, before)
    const [first, ...rest] = ops.map(op => strokeDabs(op))
    expect(first.length).toBeGreaterThan(1)
    // Not "similar": identical. The dabs are baked once from the pointer's own
    // speed and tilt, and re-deriving them per layer is exactly how the same
    // pass would come to take different amounts off different layers.
    for (const dabs of rest) expect(dabs).toEqual(first)
  })

  it('never records the active layer twice, even when it is in the list', async () => {
    const engine = await inkedEngine()
    // Which is the normal case: the list comes from eraseThroughTargets, and
    // the active layer is in it whenever it is visible and unlocked.
    engine.setEraseThroughLayers(LAYERS)
    const before = engine.getOperations().length

    eraseAcross(engine)

    const ops = strokeOpsSince(engine, before)
    expect(ops.filter(op => op.layerId === 'top')).toHaveLength(1)
  })

  it('drops ids with no buffer here rather than recording strokes onto them', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers([...LAYERS, 'never-existed'])
    const before = engine.getOperations().length

    eraseAcross(engine)

    expect(strokeOpsSince(engine, before).map(op => op.layerId).sort()).toEqual([...LAYERS].sort())
  })

  // The off switch has to restore the previous behaviour exactly, not
  // approximately — it is the default, so this is what the eraser does for
  // everyone who never touches the toggle.
  it('records a single operation when the mode is off', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers([])
    const before = engine.getOperations().length

    eraseAcross(engine)

    const ops = strokeOpsSince(engine, before)
    expect(ops).toHaveLength(1)
    expect(ops[0].layerId).toBe('top')
  })

  // The setting is the eraser's, not the engine's: a pencil handed the same
  // list must keep drawing on one layer. Otherwise switching tools with the
  // toggle left on would silently copy every stroke onto every layer.
  it('is the eraser only — another tool with the same list still paints one layer', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers(LAYERS)
    engine.setTool('pencil')
    const before = engine.getOperations().length

    eraseAcross(engine)

    const ops = strokeOpsSince(engine, before)
    expect(ops).toHaveLength(1)
    expect(ops[0].layerId).toBe('top')
  })

  // Read at pen-down and then left alone, the same contract the active layer
  // has. A gesture that changed target mid-stroke would paint one half of its
  // dabs into a layer whose operation never mentions them.
  it('freezes the target list at pen-down', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers(LAYERS)
    const before = engine.getOperations().length
    const internals = engine as unknown as {
      _onStart: (e: object) => void; _onMove: (e: object) => void; _onEnd: (e: object) => void
    }
    const at = (x: number) => ({ x, y: 32, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: 0 })

    internals._onStart(at(20))
    engine.setEraseThroughLayers(['top'])
    internals._onMove(at(32))
    internals._onEnd(at(44))

    expect(strokeOpsSince(engine, before)).toHaveLength(3)
  })
})

describe('eraser through layers — pixels and undo', () => {
  it('takes ink off the layers under the active one, and undo puts all of it back', async () => {
    const engine = await inkedEngine()
    engine.setEraseThroughLayers(LAYERS)
    const inked = Object.fromEntries(LAYERS.map(id => [id, readLayerPixels(engine, id)]))
    for (const id of LAYERS) expect(alphaAt(inked[id]!, 32, 32, CANVAS.width)).toBeGreaterThan(0)

    eraseAcross(engine)

    for (const id of LAYERS) {
      const after = readLayerPixels(engine, id)
      expect(alphaAt(after!, 32, 32, CANVAS.width)).toBe(0)
    }

    // One undo, not three. The three operations are one gesture, and a person
    // who wiped a mistake off four layers at once should not have to press
    // undo four times to get it back — with three of the four states in
    // between showing a half-erased picture.
    engine.undo()

    for (const id of LAYERS) {
      const restored = readLayerPixels(engine, id)
      expect(alphaAt(restored!, 32, 32, CANVAS.width)).toBe(alphaAt(inked[id]!, 32, 32, CANVAS.width))
    }
  })
})

// (#429) The live channel carries a gesture to peers while the pen is still
// down. It was keyed by (peer, strokeId), which was the same thing as "one
// layer" until this feature existed — so the key had to grow a layer, and these
// two check the halves of that which can go wrong silently: a peer that reads a
// sequence gap stops trusting the stream for the whole gesture and falls back
// to the operations, which still draws the right picture and would let this
// regress unnoticed.
describe('eraser through layers — the live stream', () => {
  it('sends one packet per layer, each with its own stream numbered from zero', async () => {
    const packets: PeerLivePacket[] = []
    const engine = await inkedEngine({ onLiveStrokeDabs: (p: PeerLivePacket) => packets.push(p) })
    engine.setEraseThroughLayers(LAYERS)

    eraseAcross(engine)

    expect(packets.length).toBeGreaterThanOrEqual(3)
    const byLayer = new Map<string, number[]>()
    for (const p of packets) byLayer.set(p.layerId, [...(byLayer.get(p.layerId) ?? []), p.packetSeq])
    expect([...byLayer.keys()].sort()).toEqual([...LAYERS].sort())
    for (const seqs of byLayer.values()) {
      expect(seqs).toEqual(seqs.map((_, i) => i))
    }
    // One gesture on the wire, so the same stroke id on all of them — a peer
    // uses it to recognise the operations that follow.
    expect(new Set(packets.map(p => p.strokeId)).size).toBe(1)
  })

  it('a receiver paints all three layers from one gesture without desyncing', async () => {
    const packets: PeerLivePacket[] = []
    const author = await inkedEngine({ onLiveStrokeDabs: (p: PeerLivePacket) => packets.push(p) })
    author.setEraseThroughLayers(LAYERS)
    eraseAcross(author)

    const peer = await inkedEngine()
    for (const p of packets) peer.appendPeerLiveDabs('author', p)

    // The stream is paced (LIVE_STROKE_EMIT_INTERVAL_MS), so what a receiver
    // holds mid-gesture is a *prefix* of it — the pen-down dab here, with the
    // rest arriving in the operations. That is the normal state of a live
    // stroke and exactly what this checks: the prefix has to land on all three
    // layers identically, since a desynced stream would silently paint none of
    // them and leave the picture to be repaired by the operations later.
    for (const id of LAYERS) {
      expect(alphaAt(readLayerPixels(peer, id)!, 20, 32, CANVAS.width)).toBe(0)
    }
    const [first, ...rest] = LAYERS.map(id => readLayerPixels(peer, id))
    for (const pixels of rest) expectPixelsEqual(pixels, first)
  })
})

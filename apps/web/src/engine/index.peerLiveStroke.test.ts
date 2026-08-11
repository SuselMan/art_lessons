// #429 receive side: a peer's stroke arrives twice over — first as live packets
// while their pen is still down, then as the StrokeOperation(s) that actually
// record it. The engine must end up with exactly the pixels the operation alone
// would have produced.
//
// "Exactly" is not pedantry here. Dab painting accumulates, so a dab painted a
// second time is visibly darker rather than idempotent: getting this wrong does
// not produce a subtle artifact, it produces a stroke whose streamed part is a
// different shade from its tail. Every test below therefore compares against a
// reference engine that received the operation and nothing else.
//
// Marker is checked structurally rather than by pixels — see the note at the
// foot of index.strokeStreaming.test.ts for why MockGL cannot answer pixel
// questions about that tool.
import type { Dab, ToolType } from '@grafetto/shared'
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { PeerLivePacket } from './index'
import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeStroke, paperReady,
  readLayerPixels, simulateStroke,
} from './testing/engineTestUtils'

const CANVAS = { width: 128, height: 64 }
const PEER = 'peer-a'
const STROKE_ID = 'gesture-1'

async function recordGestureDabs(tool: ToolType): Promise<Dab[]> {
  const { engine } = createTestEngine({ userId: 'rec', size: 20 }, CANVAS)
  engine.appendOperation(makeLayerAdd('rec', 'L'))
  engine.setActiveLayer('L')
  engine.setTool(tool)
  await paperReady(engine)
  engine.appendOperation(fillStroke('rec', 'L', 64, 32, 40))
  const before = engine.getOperations().length
  simulateStroke(engine, Array.from({ length: 21 }, (_, i) => ({ x: 14 + i * 5, y: 32 })))
  const dabs = engine.getOperations().slice(before)
    .flatMap(op => (op.type === 'stroke' ? strokeDabs(op) : []))
  engine.destroy()
  return dabs
}

/** A receiving client: same starting content on every one of them, so any
 *  pixel difference between two is down to how the stroke reached it. */
async function receiver(tool: ToolType) {
  const { engine } = createTestEngine({ userId: 'me', size: 20 }, CANVAS)
  engine.appendOperation(makeLayerAdd('me', 'L'))
  engine.setActiveLayer('L')
  engine.setTool(tool)
  await paperReady(engine)
  engine.appendOperation(fillStroke('me', 'L', 64, 32, 40))
  return engine
}

function packet(tool: ToolType, dabs: Dab[], packetSeq: number): PeerLivePacket {
  return {
    strokeId: STROKE_ID, layerId: 'L', tool, preset: 'HB',
    color: [0.14, 0.14, 0.17], packetSeq, dabs,
  }
}

/** The gesture as a peer would stream it: `perPacket` dabs at a time. */
function packetsFor(tool: ToolType, dabs: Dab[], perPacket = 4): PeerLivePacket[] {
  const out: PeerLivePacket[] = []
  for (let i = 0; i < dabs.length; i += perPacket) {
    out.push(packet(tool, dabs.slice(i, i + perPacket), out.length))
  }
  return out
}

function commit(engine: Awaited<ReturnType<typeof receiver>>, tool: ToolType, dabs: Dab[]) {
  engine.appendOperation(
    makeStroke(PEER, 'L', dabs, { tool, strokeId: STROKE_ID, userId: PEER }), 'remote',
  )
}

describe('#429 a streamed peer stroke lands on exactly the pixels its operation would', () => {
  for (const tool of ['pencil', 'smudge'] as const) {
    it(`${tool}: streaming then committing equals committing alone`, async () => {
      const dabs = await recordGestureDabs(tool)
      expect(dabs.length).toBeGreaterThan(12)

      const reference = await receiver(tool)
      commit(reference, tool, dabs)
      const expected = readLayerPixels(reference, 'L')

      const streamed = await receiver(tool)
      for (const p of packetsFor(tool, dabs)) streamed.appendPeerLiveDabs(PEER, p)
      streamed.endPeerLiveStroke(PEER)
      commit(streamed, tool, dabs)

      expectPixelsEqual(readLayerPixels(streamed, 'L'), expected)
      reference.destroy(); streamed.destroy()
    })

    it(`${tool}: the ink is on screen before the operation arrives`, async () => {
      // The point of the whole feature: half a gesture streamed has to be
      // visible, not merely bookkept. Without this a "correct" implementation
      // that painted nothing until the operation landed would pass every
      // equality test above.
      const dabs = await recordGestureDabs(tool)
      const engine = await receiver(tool)
      const blank = readLayerPixels(engine, 'L')

      const half = packetsFor(tool, dabs).slice(0, 3)
      for (const p of half) engine.appendPeerLiveDabs(PEER, p)

      expect(() => expectPixelsEqual(readLayerPixels(engine, 'L'), blank)).toThrow(/pixel mismatch/)
      engine.destroy()
    })
  }

  it('a gesture split across several operations claims each one in turn', async () => {
    // A long gesture is recorded as more than one operation (see
    // STROKE_DAB_CHUNK_LIMIT), and those arrive *during* the gesture, not only
    // at pen-up — so the claim has to advance operation by operation rather
    // than assume one operation per gesture.
    const dabs = await recordGestureDabs('pencil')
    const cut = Math.floor(dabs.length / 2)

    const reference = await receiver('pencil')
    commit(reference, 'pencil', dabs.slice(0, cut))
    commit(reference, 'pencil', dabs.slice(cut))
    const expected = readLayerPixels(reference, 'L')

    const streamed = await receiver('pencil')
    const packets = packetsFor('pencil', dabs)
    for (const p of packets) streamed.appendPeerLiveDabs(PEER, p)
    commit(streamed, 'pencil', dabs.slice(0, cut))
    commit(streamed, 'pencil', dabs.slice(cut))
    streamed.endPeerLiveStroke(PEER)

    expectPixelsEqual(readLayerPixels(streamed, 'L'), expected)
    reference.destroy(); streamed.destroy()
  })

  it('a lost packet stops live painting but the operation still completes the stroke', async () => {
    // Live painting stops at the first gap rather than skipping over it, so
    // what was painted is always a contiguous prefix — which is exactly what
    // the arriving operation is allowed to skip. The half that never streamed
    // is painted by the operation, and the result still matches the reference.
    const dabs = await recordGestureDabs('pencil')
    const reference = await receiver('pencil')
    commit(reference, 'pencil', dabs)
    const expected = readLayerPixels(reference, 'L')

    const lossy = await receiver('pencil')
    const packets = packetsFor('pencil', dabs)
    lossy.appendPeerLiveDabs(PEER, packets[0])
    lossy.appendPeerLiveDabs(PEER, packets[1])
    for (const p of packets.slice(3)) lossy.appendPeerLiveDabs(PEER, p) // packets[2] never arrives
    commit(lossy, 'pencil', dabs)

    expectPixelsEqual(readLayerPixels(lossy, 'L'), expected)
    lossy.destroy()
  })

  it('joining mid-gesture paints nothing live and lets the operation arrive whole', async () => {
    // The first packet this client sees is not the gesture's first. The dabs
    // before it were never painted here, so nothing may be claimed — otherwise
    // the operation would skip ink that is not on the layer.
    const dabs = await recordGestureDabs('pencil')
    const reference = await receiver('pencil')
    commit(reference, 'pencil', dabs)
    const expected = readLayerPixels(reference, 'L')

    const latecomer = await receiver('pencil')
    for (const p of packetsFor('pencil', dabs).slice(2)) latecomer.appendPeerLiveDabs(PEER, p)
    commit(latecomer, 'pencil', dabs)

    expectPixelsEqual(readLayerPixels(latecomer, 'L'), expected)
    latecomer.destroy()
  })

  it('a stroke with no strokeId is painted by its operation as it always was', async () => {
    // Rooms recorded before strokeId existed, and any client that never
    // streams, must be completely unaffected by any of this.
    const dabs = await recordGestureDabs('pencil')
    const reference = await receiver('pencil')
    reference.appendOperation(makeStroke(PEER, 'L', dabs, { tool: 'pencil', userId: PEER }), 'remote')
    const expected = readLayerPixels(reference, 'L')

    const other = await receiver('pencil')
    other.appendOperation(makeStroke(PEER, 'L', dabs, { tool: 'pencil', userId: PEER }), 'remote')

    expectPixelsEqual(readLayerPixels(other, 'L'), expected)
    reference.destroy(); other.destroy()
  })

  it('reports ink no operation ever claimed when a peer vanishes mid-gesture', async () => {
    // The author dropped off between packets and pen-up: their ink is on this
    // layer with nothing in the log owning it. The count is what tells the
    // caller the layer needs repairing from the log rather than being left
    // with a stroke that no undo, reload or snapshot knows about.
    const dabs = await recordGestureDabs('pencil')
    const engine = await receiver('pencil')
    const packets = packetsFor('pencil', dabs)
    for (const p of packets.slice(0, 3)) engine.appendPeerLiveDabs(PEER, p)

    const painted = packets.slice(0, 3).reduce((n, p) => n + p.dabs.length, 0)
    expect(engine.endPeerLiveStroke(PEER)).toBe(painted)
    // …and once the operation does land, nothing is outstanding any more.
    const settled = await receiver('pencil')
    for (const p of packets) settled.appendPeerLiveDabs(PEER, p)
    commit(settled, 'pencil', dabs)
    expect(settled.endPeerLiveStroke(PEER)).toBe(0)

    engine.destroy(); settled.destroy()
  })
})

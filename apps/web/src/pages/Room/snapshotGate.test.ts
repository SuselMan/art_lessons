import { describe, expect, it } from 'vitest'
import { createSnapshotGate } from './snapshotGate'

/** The default shape of an observation from a healthy, caught-up client. */
function observation(latestKnownSeq: number, pending: number[] = [], replayIncomplete = false) {
  return { latestKnownSeq, pendingCommitSeqs: new Set(pending), replayIncomplete }
}

describe('createSnapshotGate', () => {
  // The 2026-08-17 production incident (room F4uw21Ob), reduced: `room_state`
  // raises the known seq synchronously and then awaits megabytes of snapshot
  // blobs before anything is restored. A peer operation arriving in that window
  // reached the boundary check with a room-sized seq and an empty engine, and
  // the resulting upload published the empty room's structure over a
  // four-layer lesson.
  it('refuses to bake before the catch-up has finished', () => {
    const gate = createSnapshotGate()

    expect(gate.observe(observation(22437))).toBeNull()
  })

  it('bakes once the catch-up has finished and the room moves on', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(22437)

    expect(gate.observe(observation(22500))).toEqual({ previous: 22437, watermark: 22500 })
  })

  // The other half of restoreCompleted, and the reason it takes a seq at all.
  // With the watermark left at 0, this first observation would read as a jump
  // across every boundary in the room's history and bake immediately under the
  // label of one this client was never present for — storing pixels that
  // already include everything drawn since.
  it('does not claim a boundary crossed before this client arrived', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(22437)

    expect(gate.observe(observation(22437))).toBeNull()
    expect(gate.observe(observation(22440))).toEqual({ previous: 22437, watermark: 22440 })
  })

  // A reconnect's engine holds the room as it was before the drop: internally
  // consistent, and stale by however many layers peers added meanwhile. That is
  // the same publishable lie as an empty one.
  it('closes again for the length of a reconnect catch-up', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(100)

    gate.restoreStarted()
    expect(gate.observe(observation(9000))).toBeNull()

    gate.restoreCompleted(9000)
    expect(gate.observe(observation(9100))).toEqual({ previous: 9000, watermark: 9100 })
  })

  // A reconnect can resolve to less than this client already had (it was ahead
  // with unacked local work). Rewinding would re-open boundaries it has already
  // baked, and a second bake of a boundary is a second, contradictory answer.
  it('never walks the watermark backward on a catch-up', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(5000)

    gate.restoreCompleted(4000)

    expect(gate.observe(observation(4500))).toBeNull()
    expect(gate.observe(observation(5001))).toEqual({ previous: 5000, watermark: 5001 })
  })

  // (#385) A replay that threw partway leaves a canvas showing less than the
  // log says the room holds — permanently, for this mount.
  it('refuses to bake when the replay was incomplete', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(100)

    expect(gate.observe(observation(200, [], true))).toBeNull()
  })

  // A peer stroke reveals progressively and two reveals can finish out of
  // order, so an arrived-but-unpainted seq holds the watermark below itself.
  it('holds the watermark below the smallest uncommitted seq', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(100)

    expect(gate.observe(observation(500, [301, 450]))).toEqual({ previous: 100, watermark: 300 })
  })

  it('advances past a pending seq only once it has committed', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(100)
    gate.observe(observation(500, [301]))

    expect(gate.observe(observation(500))).toEqual({ previous: 300, watermark: 500 })
  })

  it('reports no plan when nothing has moved', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(100)

    expect(gate.observe(observation(100))).toBeNull()
    expect(gate.observe(observation(99))).toBeNull()
  })

  // A brand-new room: nothing to restore, so the creator is caught up the
  // moment that is confirmed, and its own first checkpoint must still bake.
  it('lets a room with no history bake from the start', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(0)

    expect(gate.observe(observation(100))).toEqual({ previous: 0, watermark: 100 })
  })
})

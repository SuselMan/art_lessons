import { describe, expect, it, vi } from 'vitest'
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

describe('createSnapshotGate — a stranded pending seq (#477)', () => {
  // The 2026-08-21 lesson (room Igy2jy_i), reduced. A peer stroke that was
  // still revealing when the connection dropped left its seq behind: the
  // reconnect's catch-up loop retired the operation id and not the seq. From
  // then on the watermark was taken from a seq the client had long since
  // baked past, so every observation compared as "no boundary crossed" and
  // this client never baked again — 1428 operations went unsnapshotted, and
  // every rejoin had to replay all of them.
  it('does not let a seq below the baked watermark silence baking forever', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(1500)

    // The reconnect finished with the watermark at 1500, and seq 1493's
    // reveal was cancelled without ever being retired.
    const stranded = [1493]

    expect(gate.observe(observation(1600, stranded))).toEqual({ previous: 1500, watermark: 1600 })
    expect(gate.observe(observation(2928, stranded))).toEqual({ previous: 1600, watermark: 2928 })
  })

  // The guard above must not blunt the rule it sits next to: a pending seq
  // *above* the watermark is an operation that genuinely has not painted yet,
  // and baking past it would store a snapshot claiming pixels that are not on
  // the layer.
  it('still holds the watermark behind a genuinely unpainted seq', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(1500)

    expect(gate.observe(observation(1600, [1550, 1580]))).toEqual({ previous: 1500, watermark: 1549 })
    // ...and only releases it once that reveal commits.
    expect(gate.observe(observation(1600, [1580]))).toEqual({ previous: 1549, watermark: 1579 })
    expect(gate.observe(observation(1600, []))).toEqual({ previous: 1579, watermark: 1600 })
  })

  // Mixed: the stale entry is ignored, the live one still counts.
  it('ignores the stale entry while honouring a live one alongside it', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(1500)

    expect(gate.observe(observation(1600, [1493, 1550]))).toEqual({ previous: 1500, watermark: 1549 })
  })

  // (#480) Заметить застрявшую запись мало — про неё надо сказать наружу.
  // Клиент 21.08 перестал печь снапшоты молча, и это молчание стоило дороже
  // самого бага: сломанный урок и исправный выглядели в Sentry одинаково.
  it('докладывает о застрявшей записи ровно один раз', () => {
    const report = vi.fn()
    const gate = createSnapshotGate(report)
    gate.restoreCompleted(1500)

    gate.observe(observation(1600, [1493]))
    gate.observe(observation(1700, [1493]))

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(
      'stale pending commit seq below baked watermark',
      { committedWatermark: 1500, latestKnownSeq: 1600 },
    )
  })

  it('молчит, пока всё в порядке', () => {
    const report = vi.fn()
    const gate = createSnapshotGate(report)
    gate.restoreCompleted(1500)

    gate.observe(observation(1600, [1550]))

    expect(report).not.toHaveBeenCalled()
  })

  // `observe` reads the set by iteration now (a Map's values view, in
  // production) rather than by `.size`/spread — an empty iterable must still
  // mean "nothing pending", not "hold at zero".
  it('treats an empty iterable as nothing pending', () => {
    const gate = createSnapshotGate()
    gate.restoreCompleted(1500)

    expect(gate.observe({ latestKnownSeq: 1600, pendingCommitSeqs: new Map().values(), replayIncomplete: false }))
      .toEqual({ previous: 1500, watermark: 1600 })
  })
})

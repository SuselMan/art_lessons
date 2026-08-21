import { describe, expect, it } from 'vitest'
import { createPendingPreviews } from './pendingPreviews'
import { createSnapshotGate } from './snapshotGate'

describe('createPendingPreviews', () => {
  it('exposes an arrived-but-unrevealed stroke under both readings', () => {
    const pending = createPendingPreviews()
    pending.add('op-a', 1550)

    expect(pending.has('op-a')).toBe(true)
    expect(pending.size).toBe(1)
    expect([...pending.commitSeqs()]).toEqual([1550])
  })

  // The whole reason this is one structure and not two sets: there is no way
  // to retire the id and keep the seq, which is exactly what the reconnect
  // catch-up used to do (#477).
  it('retires the id and the seq together', () => {
    const pending = createPendingPreviews()
    pending.add('op-a', 1550)

    expect(pending.remove('op-a')).toBe(1550)
    expect(pending.has('op-a')).toBe(false)
    expect(pending.size).toBe(0)
    expect([...pending.commitSeqs()]).toEqual([])
  })

  it('reports nothing removed for an op it never held', () => {
    const pending = createPendingPreviews()

    expect(pending.remove('op-never')).toBeUndefined()
  })

  // `ids()` is walked while entries are being retired inside the loop — it
  // must be a snapshot of the keys, not a live view.
  it('gives a list safe to retire entries while walking', () => {
    const pending = createPendingPreviews()
    pending.add('op-a', 1)
    pending.add('op-b', 2)
    pending.add('op-c', 3)

    const seen: string[] = []
    for (const id of pending.ids()) {
      seen.push(id)
      pending.remove(id)
    }

    expect(seen).toEqual(['op-a', 'op-b', 'op-c'])
    expect(pending.size).toBe(0)
  })

  // The bug end to end, at the seam where it actually bit: a client that has
  // baked up to 1500, a peer stroke revealing at 1550, and a catch-up that
  // cancels the reveal. Retiring it through `remove` is what lets the
  // watermark move again — and the gate stays honest while it is still
  // pending.
  it('lets the snapshot watermark move again once a cancelled reveal is retired', () => {
    const pending = createPendingPreviews()
    const gate = createSnapshotGate()
    gate.restoreCompleted(1500)
    pending.add('op-mid-reveal', 1550)

    const observe = (latestKnownSeq: number) => gate.observe({
      latestKnownSeq,
      pendingCommitSeqs: pending.commitSeqs(),
      replayIncomplete: false,
    })

    // Held behind the unpainted stroke, as it should be.
    expect(observe(1600)).toEqual({ previous: 1500, watermark: 1549 })

    // The catch-up cancels the reveal. Before #477 only the id went away and
    // 1550 stayed pending forever, pinning the watermark at 1549 — below the
    // 1549 already committed above — so every later observation returned null.
    pending.remove('op-mid-reveal')

    expect(observe(2928)).toEqual({ previous: 1549, watermark: 2928 })
  })
})

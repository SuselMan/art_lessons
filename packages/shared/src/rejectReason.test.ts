import { describe, it, expect } from 'vitest'
import { isTransientReject, TRANSIENT_REJECT_REASONS, type RejectReason } from './index.js'

/** (#495) Whether a rejection is final decides whether a user keeps their
 *  stroke, so the split is pinned here rather than left to whoever reads the
 *  union next. The list below is written out by hand on purpose: deriving the
 *  final reasons from `TRANSIENT_REJECT_REASONS` would make this test agree
 *  with any future edit to it, including the wrong one. */
describe('RejectReason: transient vs final', () => {
  const FINAL: RejectReason[] = [
    'room_frozen', 'participant_frozen', 'layer_owner_locked', 'layer_locked',
    'not_owner', 'room_closed', 'target_gone',
  ]

  it.each(FINAL)('%s is a verdict — the sender drops the work', reason => {
    expect(isTransientReject(reason)).toBe(false)
  })

  it.each([...TRANSIENT_REJECT_REASONS])('%s is not a verdict — the sender retries', reason => {
    expect(isTransientReject(reason)).toBe(true)
  })

  // The two lists together must be the whole union. Without this, adding a
  // reason to `RejectReason` and forgetting it here passes silently — and an
  // unlisted reason defaults to final, i.e. to discarding somebody's drawing.
  it('covers every RejectReason', () => {
    const all = new Set<RejectReason>([...FINAL, ...TRANSIENT_REJECT_REASONS])
    const expected: Record<RejectReason, true> = {
      room_frozen: true, participant_frozen: true, layer_owner_locked: true,
      layer_locked: true, not_owner: true, room_closed: true, target_gone: true,
      not_joined: true, server_error: true,
    }
    expect([...all].sort()).toEqual(Object.keys(expected).sort())
  })
})

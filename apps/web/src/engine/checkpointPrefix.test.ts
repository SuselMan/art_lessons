import { describe, expect, it } from 'vitest'

import { checkpointPrefixEnd } from './index'

const ops = (...ids: string[]) => ids.map(id => ({ id }))

describe('checkpointPrefixEnd (#536 §17.49)', () => {
  it('is where the checkpoint ends for an exact prefix', () => {
    expect(checkpointPrefixEnd(['a', 'b'], ops('a', 'b', 'c'), null)).toBe(2)
  })

  it('steps over history backfilled in front of it when a snapshot holds it', () => {
    // The tail t1,t2 was replayed (and checkpointed) before s1,s2 arrived.
    expect(checkpointPrefixEnd(['t1', 't2'], ops('s1', 's2', 't1', 't2', 'n'), new Set(['s1', 's2']))).toBe(4)
  })

  it('refuses an operation in front of it that no snapshot holds', () => {
    expect(checkpointPrefixEnd(['t1'], ops('x', 't1'), new Set(['s1']))).toBe(-1)
  })

  it('refuses a checkpoint the log has diverged from', () => {
    expect(checkpointPrefixEnd(['a', 'b'], ops('a', 'c', 'b'), null)).toBe(-1)
  })
})

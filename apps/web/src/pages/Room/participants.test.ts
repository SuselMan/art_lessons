import { describe, expect, it } from 'vitest'

import type { Participant } from '@art-lessons/shared'

import { participantsReducer } from './participants'

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    userId: overrides.userId ?? 'user-a',
    name: overrides.name ?? 'Alice',
    role: overrides.role ?? 'member',
    color: overrides.color ?? '#ef4444',
  }
}

describe('participantsReducer', () => {
  it('room_state replaces the list wholesale', () => {
    const state = [participant({ userId: 'stale' })]
    const next = participantsReducer(state, {
      type: 'room_state',
      participants: [participant({ userId: 'a' }), participant({ userId: 'b' })],
    })
    expect(next.map(p => p.userId)).toEqual(['a', 'b'])
  })

  it('peer_joined appends a new participant', () => {
    const state = [participant({ userId: 'a' })]
    const next = participantsReducer(state, { type: 'peer_joined', participant: participant({ userId: 'b' }) })
    expect(next.map(p => p.userId)).toEqual(['a', 'b'])
  })

  it('peer_joined for an already-known userId replaces that entry instead of duplicating', () => {
    const state = [participant({ userId: 'a', name: 'Old name' })]
    const next = participantsReducer(state, {
      type: 'peer_joined',
      participant: participant({ userId: 'a', name: 'New name' }),
    })
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('New name')
  })

  it('peer_left removes the matching participant only', () => {
    const state = [participant({ userId: 'a' }), participant({ userId: 'b' })]
    const next = participantsReducer(state, { type: 'peer_left', userId: 'a' })
    expect(next.map(p => p.userId)).toEqual(['b'])
  })

  it('peer_left is a no-op when the userId is not present', () => {
    const state = [participant({ userId: 'a' })]
    const next = participantsReducer(state, { type: 'peer_left', userId: 'ghost' })
    expect(next).toEqual(state)
  })
})

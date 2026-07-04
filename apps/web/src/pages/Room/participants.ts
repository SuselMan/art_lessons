import type { Participant } from '@art-lessons/shared'

// Folds the room's participant-related socket events into a flat list.
// Pure so the join/leave/replace semantics can be unit tested without a
// socket — see participants.test.ts.

export type ParticipantsAction =
  | { type: 'room_state'; participants: Participant[] }
  | { type: 'peer_joined'; participant: Participant }
  | { type: 'peer_left'; userId: string }

export function participantsReducer(state: Participant[], action: ParticipantsAction): Participant[] {
  switch (action.type) {
    case 'room_state':
      // The snapshot is authoritative — replaces whatever we had (e.g. after
      // a reconnect where our local list may be stale).
      return action.participants
    case 'peer_joined': {
      const { participant } = action
      const existing = state.some(p => p.userId === participant.userId)
      return existing
        ? state.map(p => (p.userId === participant.userId ? participant : p))
        : [...state, participant]
    }
    case 'peer_left':
      return state.filter(p => p.userId !== action.userId)
  }
}

import type { Participant } from '@grafetto/shared'

// Folds the room's participant-related socket events into a flat list.
// Pure so the join/leave/replace semantics can be unit tested without a
// socket — see participants.test.ts.

export type ParticipantsAction =
  | { type: 'room_state'; participants: Participant[] }
  | { type: 'peer_joined'; participant: Participant }
  | { type: 'peer_left'; userId: string }
  // (#254/#257/#259) Server broadcast after a `set_participant_frozen` call
  // is accepted — every participant gets this (not just the target), so
  // ParticipantsBar can show the frozen indicator for everyone else too.
  | { type: 'participant_frozen_changed'; userId: string; frozen: boolean }
  // (#176, ADR 014) Someone in the lesson turned to another board. Sent to
  // everyone *else* in the lesson; the mover learns their own board from the
  // `room_state` the turn hands them, which carries the whole roster afresh.
  | { type: 'peer_board_changed'; userId: string; boardId: string }

export function participantsReducer(state: Participant[], action: ParticipantsAction): Participant[] {
  switch (action.type) {
    case 'peer_board_changed':
      return state.map(p => (p.userId === action.userId ? { ...p, boardId: action.boardId } : p))
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
    case 'participant_frozen_changed':
      return state.map(p => (p.userId === action.userId ? { ...p, frozen: action.frozen } : p))
  }
}

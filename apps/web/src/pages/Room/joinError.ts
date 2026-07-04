import type { JoinResult } from '@art-lessons/shared'

// Pure mapping from the server's join_room/create_room failure reasons to a
// message the join gate can show directly — kept separate from JoinGate.tsx
// so it's unit-testable without mounting a component (see joinError.test.ts).

export type JoinFailureReason = Extract<JoinResult, { ok: false }>['error']

export function describeJoinError(reason: JoinFailureReason): string {
  switch (reason) {
    case 'not_found':
      return "This room doesn't exist. Check the link, or ask the host to create it."
    case 'wrong_password':
      return 'Wrong password — try again.'
  }
}

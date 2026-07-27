import type { JoinResult } from '@art-lessons/shared'

import type { TFunction } from '../../i18n'

// Pure mapping from the server's join_room/create_room failure reasons to a
// message the join gate can show directly — kept separate from JoinGate.tsx
// so it's unit-testable without mounting a component (see joinError.test.ts).
// (#208) The server sends a reason code, never prose; the caller's own `t`
// turns it into a sentence in whichever language the reader picked.

export type JoinFailureReason = Extract<JoinResult, { ok: false }>['error']

export function describeJoinError(reason: JoinFailureReason, t: TFunction): string {
  switch (reason) {
    case 'not_found':
      return t('join.error.notFound')
    case 'wrong_password':
      return t('join.error.wrongPassword')
  }
}

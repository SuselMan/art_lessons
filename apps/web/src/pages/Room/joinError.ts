import type { JoinResult } from '@grafetto/shared'

import type { TFunction } from '../../i18n'

// Pure mapping from the server's join_room/create_room failure reasons to a
// message the join gate can show directly — kept separate from JoinGate.tsx
// so it's unit-testable without mounting a component (see joinError.test.ts).
// (#208) The server sends a reason code, never prose; the caller's own `t`
// turns it into a sentence in whichever language the reader picked.

export type JoinFailureReason = Extract<JoinResult, { ok: false }>['error']

/** (#231) Which of the server's refusals replace the join form with a screen
 *  of their own, and which stay as an error under the field that can still
 *  fix them. The split is not cosmetic: nothing typed into the form changes
 *  "you were blocked" or "the owner hasn't answered yet", so leaving the form
 *  up invites re-submitting it forever.
 *
 *  Kept here, next to the message mapping, so both readings of a reason live
 *  in one place — and testable without mounting the page. */
export function joinGateStateFor(reason: JoinFailureReason): 'login' | 'pending' | 'revoked' | null {
  switch (reason) {
    case 'login_required': return 'login'
    case 'pending_approval': return 'pending'
    case 'access_revoked': return 'revoked'
    // A wrong password is re-typed; a room that isn't there is a bad link.
    // Both belong next to the form.
    case 'wrong_password':
    case 'not_found': return null
  }
}

export function describeJoinError(reason: JoinFailureReason, t: TFunction): string {
  switch (reason) {
    case 'not_found':
      return t('join.error.notFound')
    case 'wrong_password':
      return t('join.error.wrongPassword')
    // (#225) The three access-control outcomes. Two of them are not really
    // errors — `pending_approval` resolves when the host acts, and
    // `login_required` when the reader signs in — so a sentence is the floor,
    // not the finished thing: #231 gives each its own state in the gate (a
    // sign-in button, a request that resolves without a reload). Wired up
    // here anyway rather than left to fall through, because the server can
    // return them the moment #226 lets a room be switched to invite-only, and
    // an unmapped reason renders as a blank refusal with no way forward.
    case 'access_revoked':
      return t('join.error.accessRevoked')
    case 'login_required':
      return t('join.error.loginRequired')
    case 'pending_approval':
      return t('join.error.pendingApproval')
  }
}

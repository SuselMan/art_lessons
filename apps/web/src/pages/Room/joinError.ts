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
    // (#415) `server_busy` тоже остаётся у формы, и по той же причине, по
    // которой там живёт пароль: единственное осмысленное действие —
    // попробовать снова, а форма и есть кнопка «снова». Отдельный экран
    // отнял бы её ради сообщения, которое и так помещается в строку.
    case 'server_busy': return null
    // (#595) Only ever asked for a board of a lesson one is already in — a
    // page turn, not an entrance. The page stays where it was.
    case 'board_not_visible': return null
  }
}

/** (#496) Whether asking again later could get a different answer.
 *
 *  Only one refusal can: `server_busy` is about the box at one moment (#415),
 *  not about this person or this room. Every other reason is a fact that a
 *  reconnect does not change, so re-asking it on each one only produces the
 *  same no — and, on the paths where there is no gate to fall back to (a
 *  reconnect's silent rejoin, see Room/index.tsx's reportJoinFailure), an
 *  auto-rejoin loop that never terminates and never says anything.
 *
 *  The third reading of a reason, next to the other two on purpose: which
 *  screen it gets, how it is worded, and whether it is worth retrying are the
 *  same question asked three ways, and splitting them across files is how
 *  they drift apart. */
export function canRetryJoinLater(reason: JoinFailureReason): boolean {
  switch (reason) {
    case 'server_busy': return true
    case 'not_found':
    case 'wrong_password':
    case 'access_revoked':
    case 'login_required':
    // Resolves on its own, but by someone else's action and through
    // `join_request_resolved` — not by this client asking again.
    case 'pending_approval': return false
    // (#595) Changes only when the teacher changes the lesson's visibility,
    // and that arrives on its own as `lesson_state`.
    case 'board_not_visible': return false
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
    // (#415) Единственная причина, которая не про читателя и не про его
    // комнату — сервер у потолка памяти. Формулировка это и говорит: он
    // ничего не сделал не так, и через минуту всё получится.
    case 'server_busy':
      return t('join.error.serverBusy')
    case 'board_not_visible':
      return t('join.error.boardNotVisible')
  }
}

/** (#513, #231, #493) What the join gate does with the answer to an attempt:
 *  ask for a password it did not know was needed, replace the form with a
 *  screen, show an error under the form, or let the person in.
 *
 *  A `wrong_password` for an attempt that carried no password is not a wrong
 *  guess — it is the only way this client can learn the room has a password
 *  at all, since nothing about a room is readable before joining it. So it
 *  opens the field instead of accusing the reader of mistyping something they
 *  never typed. */
export type JoinAttemptOutcome =
  | { kind: 'joined'; userId: string }
  | { kind: 'askPassword' }
  | { kind: 'screen'; state: 'login' | 'pending' | 'revoked' }
  | { kind: 'error'; reason: JoinFailureReason }

export function joinAttemptOutcome(result: JoinResult, passwordSent: boolean): JoinAttemptOutcome {
  if (result.ok) return { kind: 'joined', userId: result.userId }
  if (result.error === 'wrong_password' && !passwordSent) return { kind: 'askPassword' }
  const state = joinGateStateFor(result.error)
  if (state) return { kind: 'screen', state }
  return { kind: 'error', reason: result.error }
}

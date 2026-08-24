import { describe, expect, it } from 'vitest'

import type { TranslationKey } from '../../i18n/en'
// ../../i18n/translate rather than the ../../i18n barrel: the barrel also
// exports the React hooks, which pull in the settings store's localStorage
// read — this test needs only the pure lookup.
import { translate } from '../../i18n/translate'
import { canRetryJoinLater, describeJoinError, joinGateStateFor } from './joinError'

// (#208) The mapping is reason-code → translation key → text now, so it's
// exercised through a real locale rather than against hardcoded English.
const en = (key: TranslationKey) => translate('en', key)
const ru = (key: TranslationKey) => translate('ru', key)

describe('describeJoinError', () => {
  it('describes a nonexistent room', () => {
    expect(describeJoinError('not_found', en)).toMatch(/doesn't exist/i)
  })

  it('describes a wrong password, distinctly from not_found', () => {
    const message = describeJoinError('wrong_password', en)
    expect(message).toMatch(/password/i)
    expect(message).not.toBe(describeJoinError('not_found', en))
  })

  it('has something to say for every reason the server can send (#225)', () => {
    // The three access-control outcomes arrived with the join gate, and the
    // failure mode this guards against is silent: the switch has no default,
    // so an unmapped reason returns undefined and the gate shows a blank
    // refusal. Distinctness matters as much as non-emptiness — "you were
    // removed", "sign in" and "waiting for the host" are three different
    // things to do next.
    const reasons = ['not_found', 'wrong_password', 'access_revoked', 'login_required', 'pending_approval'] as const
    const messages = reasons.map(reason => describeJoinError(reason, en))

    for (const message of messages) expect(message).toBeTruthy()
    expect(new Set(messages).size).toBe(reasons.length)
  })

  it('resolves in every locale, not only the one it was written in', () => {
    expect(describeJoinError('not_found', ru)).not.toBe('')
    expect(describeJoinError('not_found', ru)).not.toBe(describeJoinError('not_found', en))
  })
})

describe('joinGateStateFor (#231)', () => {
  it('turns the three access-control answers into their own screens', () => {
    expect(joinGateStateFor('login_required')).toBe('login')
    expect(joinGateStateFor('pending_approval')).toBe('pending')
    expect(joinGateStateFor('access_revoked')).toBe('revoked')
  })

  it('leaves the two the form can still fix on the form', () => {
    // Re-typing is the fix for one and a better link for the other — both
    // belong next to the field, not on a screen that replaces it.
    expect(joinGateStateFor('wrong_password')).toBeNull()
    expect(joinGateStateFor('not_found')).toBeNull()
  })
})

describe('canRetryJoinLater (#496)', () => {
  // The paths this exists for have no gate to fall back to — a reconnect's
  // silent rejoin, a gap resync — so "retry later" is not a button the reader
  // presses, it is whether Room leaves the automatic rejoin armed.
  it('re-asks only the refusal that was about the server, not the reader', () => {
    expect(canRetryJoinLater('server_busy')).toBe(true)
  })

  it('takes no for an answer on everything about this person or this room', () => {
    for (const reason of ['not_found', 'wrong_password', 'access_revoked', 'login_required'] as const) {
      expect(canRetryJoinLater(reason)).toBe(false)
    }
  })

  it('does not re-ask a pending request, which someone else resolves', () => {
    // It does resolve on its own — through `join_request_resolved`, when the
    // owner acts. Asking again from here is not what moves it, and doing so
    // on every reconnect would be a loop against a decision nobody has made
    // yet.
    expect(canRetryJoinLater('pending_approval')).toBe(false)
  })
})

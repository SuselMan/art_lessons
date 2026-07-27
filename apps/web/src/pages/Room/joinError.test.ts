import { describe, expect, it } from 'vitest'

import type { TranslationKey } from '../../i18n/en'
// ../../i18n/translate rather than the ../../i18n barrel: the barrel also
// exports the React hooks, which pull in the settings store's localStorage
// read — this test needs only the pure lookup.
import { translate } from '../../i18n/translate'
import { describeJoinError } from './joinError'

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

  it('resolves in every locale, not only the one it was written in', () => {
    expect(describeJoinError('not_found', ru)).not.toBe('')
    expect(describeJoinError('not_found', ru)).not.toBe(describeJoinError('not_found', en))
  })
})

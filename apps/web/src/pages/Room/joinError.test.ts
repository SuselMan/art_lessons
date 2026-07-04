import { describe, expect, it } from 'vitest'

import { describeJoinError } from './joinError'

describe('describeJoinError', () => {
  it('describes a nonexistent room', () => {
    expect(describeJoinError('not_found')).toMatch(/doesn't exist/i)
  })

  it('describes a wrong password, distinctly from not_found', () => {
    const message = describeJoinError('wrong_password')
    expect(message).toMatch(/password/i)
    expect(message).not.toBe(describeJoinError('not_found'))
  })
})

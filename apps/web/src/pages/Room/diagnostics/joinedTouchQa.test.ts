import { describe, expect, it } from 'vitest'
import { joinedTouchQaEnabled } from './joinedTouchQa'

describe('joinedTouch QA transport', () => {
  it('keeps an explicitly configured dev stand on after create and room navigation', () => {
    for (const search of ['', '?board=second', '?qaJoinedTouch=0']) {
      expect(joinedTouchQaEnabled(true, '1', search)).toBe(true)
    }
  })
  it('preserves the query opt-in and ordinary default', () => {
    expect(joinedTouchQaEnabled(true, undefined, '?qaJoinedTouch=1')).toBe(true)
    expect(joinedTouchQaEnabled(true, undefined, '')).toBe(false)
    expect(joinedTouchQaEnabled(true, 'true', '')).toBe(false)
  })
  it('never enables production even with both opt-ins', () => {
    expect(joinedTouchQaEnabled(false, '1', '?qaJoinedTouch=1')).toBe(false)
  })
})

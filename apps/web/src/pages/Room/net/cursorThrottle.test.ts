import { describe, expect, it } from 'vitest'

import { shouldEmitCursor } from './cursorThrottle'

describe('shouldEmitCursor', () => {
  it('blocks emission before the interval has elapsed', () => {
    expect(shouldEmitCursor(1000, 1010, 33)).toBe(false)
  })

  it('allows emission once the interval has elapsed', () => {
    expect(shouldEmitCursor(1000, 1033, 33)).toBe(true)
  })

  it('allows emission well past the interval', () => {
    expect(shouldEmitCursor(1000, 5000, 33)).toBe(true)
  })

  it('allows the very first emission (lastSentAt = 0, well past the interval)', () => {
    expect(shouldEmitCursor(0, 1000, 33)).toBe(true)
  })
})

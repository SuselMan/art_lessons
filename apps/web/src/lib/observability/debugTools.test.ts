import { describe, expect, it } from 'vitest'

import { readDebugParam } from './debugTools'

describe('readDebugParam', () => {
  it('says nothing when the parameter is absent', () => {
    // Absent must not read as "off": the flag is meant to survive navigation
    // inside the app, and every other URL would otherwise clear it.
    expect(readDebugParam('')).toBe(null)
    expect(readDebugParam('?room=abc')).toBe(null)
  })

  it('turns on for a bare or affirmative value', () => {
    expect(readDebugParam('?debug=1')).toBe(true)
    expect(readDebugParam('?debug')).toBe(true)
    expect(readDebugParam('?debug=true')).toBe(true)
    expect(readDebugParam('?room=abc&debug=1')).toBe(true)
  })

  it('turns off for the three ways someone writes "off"', () => {
    expect(readDebugParam('?debug=0')).toBe(false)
    expect(readDebugParam('?debug=false')).toBe(false)
    expect(readDebugParam('?debug=off')).toBe(false)
  })
})

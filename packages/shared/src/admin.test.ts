import { describe, expect, it } from 'vitest'

import { sanitizeClientEnvironment } from './admin.js'

describe('sanitizeClientEnvironment (#589)', () => {
  it('keeps known fields of the right type and nothing else', () => {
    expect(sanitizeClientEnvironment({
      appVersion: '2026.09.24-c63b1a0',
      dpr: 2,
      penSeen: true,
      gpuRenderer: 'x'.repeat(500),
      screenW: Number.NaN,
      cores: '8',
      evil: { nested: true },
    })).toEqual({
      appVersion: '2026.09.24-c63b1a0',
      dpr: 2,
      penSeen: true,
      gpuRenderer: 'x'.repeat(200),
    })
  })

  it('answers anything that is not an object with an empty record', () => {
    expect(sanitizeClientEnvironment(null)).toEqual({})
    expect(sanitizeClientEnvironment('hello')).toEqual({})
    expect(sanitizeClientEnvironment([1, 2])).toEqual({})
  })
})

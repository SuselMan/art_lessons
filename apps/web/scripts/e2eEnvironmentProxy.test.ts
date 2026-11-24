import { describe, expect, it } from 'vitest'
import { createE2eEnvironmentAddress } from './e2eEnvironmentProxy.ts'

describe('E2E environment proxy', () => {
  const first = 'al_dev=01234567-89ab-cdef-0123-456789abcdef'
  const second = 'al_dev=11234567-89ab-cdef-0123-456789abcdef'
  it('gives a stable separate address to each valid device', () => {
    const get = createE2eEnvironmentAddress(true)
    const a = get('POST', '/api/me/environment', first)
    expect(a).toBe('198.18.0.0')
    expect(get('POST', '/api/me/environment?x=1', `other=1; ${first}`)).toBe(a)
    expect(get('POST', '/api/me/environment', second)).not.toBe(a)
  })
  it('does not change other requests, invalid cookies, or disabled mode', () => {
    const get = createE2eEnvironmentAddress(true)
    expect(get('GET', '/api/me/environment', first)).toBeUndefined()
    expect(get('POST', '/api/me', first)).toBeUndefined()
    expect(get('POST', '/api/me/environment', 'al_dev=bad')).toBeUndefined()
    expect(get('POST', '/api/me/environment', undefined)).toBeUndefined()
    expect(createE2eEnvironmentAddress(false)('POST', '/api/me/environment', first)).toBeUndefined()
  })
})

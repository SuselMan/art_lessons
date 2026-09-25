import { describe, expect, it } from 'vitest'

import { handshakeIp, normalizeIp, readDeviceId } from './sessions.js'

describe('client address (#589, #590)', () => {
  it('reads a socket handshake the way trustProxy: 1 reads HTTP — rightmost forwarded entry', () => {
    // nginx appends what it saw; anything to the left is the client's own claim.
    expect(handshakeIp({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, '127.0.0.1')).toBe('203.0.113.7')
    expect(handshakeIp({}, '::ffff:192.168.1.5')).toBe('192.168.1.5')
  })

  it('stores IPv4-mapped addresses as plain IPv4, so a typed ban matches them', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizeIp(undefined)).toBe('unknown')
  })

  it('accepts only a uuid as a device id', () => {
    expect(readDeviceId('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')
    expect(readDeviceId('<script>')).toBeNull()
    expect(readDeviceId(undefined)).toBeNull()
  })
})

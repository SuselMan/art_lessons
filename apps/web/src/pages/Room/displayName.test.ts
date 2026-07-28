import { describe, expect, it } from 'vitest'

import { getOrCreateDisplayName, resolveDisplayName, type NameStorage } from './displayName'

function fakeStorage(initial: Record<string, string> = {}): NameStorage {
  const data = { ...initial }
  return {
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { data[key] = value },
  }
}

describe('getOrCreateDisplayName', () => {
  it('returns the existing stored name unchanged', () => {
    const storage = fakeStorage({ al_display_name: 'Existing Name' })
    expect(getOrCreateDisplayName(storage)).toBe('Existing Name')
  })

  it('generates and persists a Guest-XXXX name when none is stored', () => {
    const storage = fakeStorage()
    const name = getOrCreateDisplayName(storage)
    expect(name).toMatch(/^Guest-[A-Z0-9]{4}$/)
    expect(storage.getItem('al_display_name')).toBe(name)
  })

  it('is stable across repeated calls against the same storage', () => {
    const storage = fakeStorage()
    const first = getOrCreateDisplayName(storage)
    const second = getOrCreateDisplayName(storage)
    expect(second).toBe(first)
  })
})

describe('resolveDisplayName', () => {
  const storage = () => fakeStorage({ al_display_name: 'Guest-AB12' })

  it("prefers the account's own name", () => {
    const me = { userId: 'u1', email: 'anna@example.com', name: 'Anna Petrova' }
    expect(resolveDisplayName(me, storage())).toBe('Anna Petrova')
  })

  it('falls back to the email local part when the account has no name', () => {
    const me = { userId: 'u1', email: 'anna@example.com', name: null }
    expect(resolveDisplayName(me, storage())).toBe('anna')
  })

  // A name that's only whitespace is the same as no name at all — it would
  // otherwise render as a blank row in the participants list.
  it('treats a blank account name as absent', () => {
    const me = { userId: 'u1', email: 'anna@example.com', name: '   ' }
    expect(resolveDisplayName(me, storage())).toBe('anna')
  })

  it('falls back to the guest name for an anonymous visitor', () => {
    const me = { userId: 'u1', email: null, name: null }
    expect(resolveDisplayName(me, storage())).toBe('Guest-AB12')
  })

  it('falls back to the guest name before /api/me has resolved', () => {
    expect(resolveDisplayName(null, storage())).toBe('Guest-AB12')
  })
})

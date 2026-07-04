import { describe, expect, it } from 'vitest'

import { getOrCreateDisplayName, type NameStorage } from './displayName'

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

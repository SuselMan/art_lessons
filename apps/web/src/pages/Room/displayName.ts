import { nanoid } from 'nanoid'

// No profile/auth system yet (#41) and CreateRoom never asks for a name, so
// there is nowhere upstream to read a participant's display name from. This
// generates a stable-per-device placeholder ("Guest-XXXX") once and persists
// it, so a given browser at least presents consistently across rooms/reloads
// instead of a fresh random name every join. Replace once #41 lands.

const STORAGE_KEY = 'al_display_name'

export interface NameStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function getOrCreateDisplayName(storage: NameStorage): string {
  const existing = storage.getItem(STORAGE_KEY)
  if (existing) return existing
  const name = `Guest-${nanoid(4).toUpperCase()}`
  storage.setItem(STORAGE_KEY, name)
  return name
}

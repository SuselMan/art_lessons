import { customAlphabet } from 'nanoid'

// No profile/auth system yet (#41) and CreateRoom never asks for a name, so
// there is nowhere upstream to read a participant's display name from. This
// generates a stable-per-device placeholder ("Guest-XXXX") once and persists
// it, so a given browser at least presents consistently across rooms/reloads
// instead of a fresh random name every join. Replace once #41 lands.

const STORAGE_KEY = 'al_display_name'

// Restricted to uppercase alphanumerics — nanoid()'s default alphabet
// includes '_' and '-', which would occasionally produce a name like
// "Guest-GQ-O" (confusing double dash, and not what "Guest-XXXX" implies).
const suffix = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 4)

export interface NameStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function getOrCreateDisplayName(storage: NameStorage): string {
  const existing = storage.getItem(STORAGE_KEY)
  if (existing) return existing
  const name = `Guest-${suffix()}`
  storage.setItem(STORAGE_KEY, name)
  return name
}

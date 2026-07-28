import { customAlphabet } from 'nanoid'
import type { Me } from '../../lib/api'

// CreateRoom never asks for a name, so for a signed-out visitor there is
// nothing upstream to read a participant's display name from. This generates a
// stable-per-device placeholder ("Guest-XXXX") once and persists it, so a given
// browser at least presents consistently across rooms/reloads instead of a
// fresh random name every join. Accounts (#41) landed since, so a signed-in
// user has a real name to use instead — see `resolveDisplayName` below.

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

/** (#328) The one answer to "what do we call this person" — used for the room
 *  owner (who never got asked) and as the join gate's prefilled name (which the
 *  joiner can still overwrite, so this is a default, not an override).
 *
 *  An account's own name wins, then the local part of its email — someone who
 *  registered without filling in the optional name field is still better
 *  identified by "anna" than by "Guest-K3T9". A signed-out visitor, and a
 *  signed-in one whose email somehow has no local part, fall back to the
 *  per-device guest name above. */
export function resolveDisplayName(me: Me | null, storage: NameStorage): string {
  const accountName = me?.name?.trim()
  if (accountName) return accountName
  const emailLocalPart = me?.email?.split('@')[0]?.trim()
  if (emailLocalPart) return emailLocalPart
  return getOrCreateDisplayName(storage)
}

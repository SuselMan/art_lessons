// Generic per-room settings persistence — one JSON blob per room, versioned
// so a future shape change can detect and discard old/incompatible data
// instead of crashing on it. Mirrors displayName.ts's injectable-storage
// shape (testable without touching the real localStorage).

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY_PREFIX = 'al_room_settings:'
const FORMAT_VERSION = 1

interface Envelope<T> {
  v: number
  data: T
}

/** Reads a per-room settings blob written by writeRoomSettings. Returns null
 *  on missing, corrupt, or version-mismatched data — callers fall back to
 *  their own defaults in that case. */
export function readRoomSettings<T>(storage: KeyValueStorage, roomId: string): T | null {
  const raw = storage.getItem(KEY_PREFIX + roomId)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Envelope<T>
    return parsed.v === FORMAT_VERSION ? parsed.data : null
  } catch {
    return null
  }
}

export function writeRoomSettings<T>(storage: KeyValueStorage, roomId: string, data: T): void {
  const envelope: Envelope<T> = { v: FORMAT_VERSION, data }
  storage.setItem(KEY_PREFIX + roomId, JSON.stringify(envelope))
}

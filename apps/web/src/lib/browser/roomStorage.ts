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

/** Shallow-merges `patch` onto whatever's already stored for this room
 *  (missing/corrupt/version-mismatched existing data is treated as `{}`,
 *  same fallback readRoomSettings itself uses) before writing — not a
 *  blind overwrite. Two independent features sharing this one per-room key
 *  (e.g. toolSettings.ts's {pencil,eraser} and panelPosition.ts's
 *  {panelPosition}) each only know their own slice; overwriting the whole
 *  blob with just that slice would silently wipe out whatever the other
 *  feature's last write put there. Top-level-key granularity only (each
 *  feature owns entirely separate top-level keys in T, never merges within
 *  a shared key) — fine for every current and foreseeable caller. */
export function writeRoomSettings<T extends object>(storage: KeyValueStorage, roomId: string, patch: Partial<T>): void {
  const existing = readRoomSettings<T>(storage, roomId) ?? ({} as T)
  const envelope: Envelope<T> = { v: FORMAT_VERSION, data: { ...existing, ...patch } }
  storage.setItem(KEY_PREFIX + roomId, JSON.stringify(envelope))
}

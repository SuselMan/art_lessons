import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../browser/roomStorage'

export type BrushPreferences = Record<string, { size: number; opacity: number }>

/** Per-room choice memory, separate from immutable preset definitions. */
export function loadBrushPreferences(storage: KeyValueStorage, roomId: string): BrushPreferences {
  const raw = readRoomSettings<{ brushPreferences?: unknown }>(storage, roomId)?.brushPreferences
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).slice(0, 512).filter(([key, value]) =>
    /^(digitalBrush|eraser|smudge):[a-zA-Z0-9-]{1,80}$/.test(key)
    && value && typeof value === 'object'
    && Number.isFinite(value.size) && value.size > 0 && value.size <= 10000
    && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1,
  ).map(([key, value]) => [key, { size: value.size, opacity: value.opacity }]))
}

export function saveBrushPreferences(storage: KeyValueStorage, roomId: string, preferences: BrushPreferences): void {
  writeRoomSettings(storage, roomId, { brushPreferences: preferences })
}

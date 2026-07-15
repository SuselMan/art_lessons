import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'

export interface ToolConfig { size: number; opacity: number }

export interface RoomToolSettings {
  pencil: ToolConfig
  eraser: ToolConfig
}

// Mirrors the size slider's own range (Room's SliderKnob: min={1} max={120}) —
// clamping here guards against a corrupted/hand-edited storage value reaching
// the engine, not against the slider itself (which already can't produce
// anything outside this range).
const SIZE_MIN = 1
const SIZE_MAX = 120

function clampToolConfig(cfg: Partial<ToolConfig> | undefined, fallback: ToolConfig): ToolConfig {
  const size = typeof cfg?.size === 'number' && Number.isFinite(cfg.size)
    ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, cfg.size))
    : fallback.size
  const opacity = typeof cfg?.opacity === 'number' && Number.isFinite(cfg.opacity)
    ? Math.min(1, Math.max(0, cfg.opacity))
    : fallback.opacity
  return { size, opacity }
}

/** Loads the last-used pencil/eraser size+opacity for this room, falling
 *  back to (and clamping against) `defaults` for anything missing/invalid. */
export function loadToolSettings(
  storage: KeyValueStorage, roomId: string, defaults: RoomToolSettings,
): RoomToolSettings {
  const stored = readRoomSettings<Partial<RoomToolSettings>>(storage, roomId)
  return {
    pencil: clampToolConfig(stored?.pencil, defaults.pencil),
    eraser: clampToolConfig(stored?.eraser, defaults.eraser),
  }
}

export function saveToolSettings(storage: KeyValueStorage, roomId: string, settings: RoomToolSettings): void {
  writeRoomSettings(storage, roomId, settings)
}

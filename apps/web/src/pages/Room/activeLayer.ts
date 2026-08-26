import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'

interface StoredActiveLayer {
  activeLayerId: string
}

/** Which row this device had selected in this room the last time it was open
 *  (#506) — null if it was never stored, in which case the caller keeps
 *  `makeInitialLayerState()`'s own choice.
 *
 *  Per device rather than per account, and deliberately: the selected layer is
 *  view state, the same bucket as the tool settings and the panel position
 *  already stored under this key. It never enters the operation log, so a
 *  second device (or a peer) is not affected by what this one had selected.
 *
 *  Nothing here checks that the layer still exists — it cannot, the room's
 *  layers are not known yet at load time. `sanitizeSelection` answers that at
 *  the first replay: an id no longer in the room falls back to the top
 *  non-background layer, which is exactly what happened before any of this was
 *  stored. */
export function loadActiveLayerId(storage: KeyValueStorage, roomId: string): string | null {
  const stored = readRoomSettings<Partial<StoredActiveLayer>>(storage, roomId)
  const id = stored?.activeLayerId
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function saveActiveLayerId(storage: KeyValueStorage, roomId: string, activeLayerId: string): void {
  writeRoomSettings<StoredActiveLayer>(storage, roomId, { activeLayerId })
}

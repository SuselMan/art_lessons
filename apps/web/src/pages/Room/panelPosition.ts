import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'

export interface PanelPosition { x: number; y: number }

interface StoredPanelPosition {
  panelPosition: PanelPosition
}

/** Loads the floating tool panel's last-dragged-to position for this room
 *  (#157) — null if it was never moved (caller falls back to its own
 *  CSS-anchored default corner in that case, rather than a hardcoded
 *  pixel position that could be off-screen on a different device). No
 *  clamping here — the caller clamps against the *current* container size
 *  at render time (clampPanelPosition below), since the stored value may
 *  have come from a different, larger viewport. */
export function loadPanelPosition(storage: KeyValueStorage, roomId: string): PanelPosition | null {
  const stored = readRoomSettings<Partial<StoredPanelPosition>>(storage, roomId)
  const pos = stored?.panelPosition
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : null
}

export function savePanelPosition(storage: KeyValueStorage, roomId: string, position: PanelPosition): void {
  writeRoomSettings<StoredPanelPosition>(storage, roomId, { panelPosition: position })
}

/** Keeps the panel's top-left corner (and, implicitly, its whole
 *  fixed-size body) inside `containerSize` — guards both a stale position
 *  from a larger previous viewport (device switch, window resize) and a
 *  live drag that would otherwise let the panel be dragged fully or
 *  partly off-screen. */
export function clampPanelPosition(
  position: PanelPosition, containerSize: { width: number; height: number }, panelSize: number,
): PanelPosition {
  const maxX = Math.max(0, containerSize.width - panelSize)
  const maxY = Math.max(0, containerSize.height - panelSize)
  return {
    x: Math.min(maxX, Math.max(0, position.x)),
    y: Math.min(maxY, Math.max(0, position.y)),
  }
}

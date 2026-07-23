import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'

export interface PanelPosition { x: number; y: number }

// Diameter in CSS px — must match FloatingToolPanel.module.css's .panel
// width/height (no shared source of truth possible across TS/CSS; keep the
// two in sync by hand if either changes). Lives here rather than in
// FloatingToolPanel/index.tsx itself so a plain-function/const consumer
// (RadialDial's caller, Room/index.tsx — #277) doesn't have to import
// alongside the component (keeps FloatingToolPanel's own file component-only
// for React Fast Refresh).
export const PANEL_SIZE = 152

export const PANEL_DOM_ID = 'floating-tool-panel'

/** #277: same "measure the CSS-anchored default corner" fallback
 *  FloatingToolPanel's own measureCurrentPosition needs — a sibling overlay
 *  (RadialDial, positioned around the panel from Room/index.tsx) computes
 *  the same center point via this, without reaching into that component's
 *  internals. Returns null if the panel isn't in the DOM yet (nothing to
 *  measure against). */
export function measureFloatingPanelCenter(
  position: PanelPosition | null, containerRef: React.RefObject<HTMLElement | null>,
): { x: number; y: number } | null {
  if (position) return { x: position.x + PANEL_SIZE / 2, y: position.y + PANEL_SIZE / 2 }
  const el = document.getElementById(PANEL_DOM_ID)
  const container = containerRef.current
  if (!el || !container) return null
  const panelRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    x: panelRect.left - containerRect.left + PANEL_SIZE / 2,
    y: panelRect.top - containerRect.top + PANEL_SIZE / 2,
  }
}

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

import { describe, expect, it } from 'vitest'

import { clampPanelPosition, loadPanelPosition, savePanelPosition } from './panelPosition'
import type { KeyValueStorage } from '../../lib/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

describe('panelPosition', () => {
  it('returns null when never saved — caller falls back to its own CSS-anchored default', () => {
    expect(loadPanelPosition(memoryStorage(), 'room1')).toBeNull()
  })

  it('round-trips a saved position', () => {
    const storage = memoryStorage()
    savePanelPosition(storage, 'room1', { x: 120, y: 340 })
    expect(loadPanelPosition(storage, 'room1')).toEqual({ x: 120, y: 340 })
  })

  it('keeps position scoped per room', () => {
    const storage = memoryStorage()
    savePanelPosition(storage, 'room1', { x: 120, y: 340 })
    expect(loadPanelPosition(storage, 'room2')).toBeNull()
  })

  it('does not clobber tool settings already stored under the same per-room key', () => {
    // Regression check for the exact bug the writeRoomSettings merge fix
    // (roomStorage.ts) exists to prevent — see its own test file for the
    // general case; this is the concrete two-feature scenario #157
    // introduced.
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { pencil: { size: 8, opacity: 1 } },
    }))
    savePanelPosition(storage, 'room1', { x: 5, y: 6 })
    const raw = JSON.parse(storage.getItem('al_room_settings:room1')!)
    expect(raw.data.pencil).toEqual({ size: 8, opacity: 1 })
    expect(raw.data.panelPosition).toEqual({ x: 5, y: 6 })
  })

  it('falls back to null for a non-numeric stored value rather than trusting it', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { panelPosition: { x: 'huge', y: 6 } },
    }))
    expect(loadPanelPosition(storage, 'room1')).toBeNull()
  })

  it('ignores malformed JSON', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    expect(loadPanelPosition(storage, 'room1')).toBeNull()
  })
})

describe('clampPanelPosition', () => {
  const containerSize = { width: 400, height: 300 }
  const panelSize = 128

  it('leaves an already-in-bounds position untouched', () => {
    expect(clampPanelPosition({ x: 100, y: 100 }, containerSize, panelSize)).toEqual({ x: 100, y: 100 })
  })

  it('pulls a negative position back to 0', () => {
    expect(clampPanelPosition({ x: -50, y: -20 }, containerSize, panelSize)).toEqual({ x: 0, y: 0 })
  })

  it('pulls a position that would push the panel off the right/bottom edge back in bounds', () => {
    expect(clampPanelPosition({ x: 1000, y: 1000 }, containerSize, panelSize))
      .toEqual({ x: containerSize.width - panelSize, y: containerSize.height - panelSize })
  })

  it('clamps to 0 (not negative) when the container is smaller than the panel itself', () => {
    expect(clampPanelPosition({ x: 50, y: 50 }, { width: 60, height: 60 }, panelSize)).toEqual({ x: 0, y: 0 })
  })
})

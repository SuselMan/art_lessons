import { describe, expect, it } from 'vitest'

import { loadActiveLayerId, saveActiveLayerId } from './activeLayer'
import type { KeyValueStorage } from '../../lib/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

describe('activeLayer', () => {
  it('returns null when never saved — caller keeps the initial layer state as it is', () => {
    expect(loadActiveLayerId(memoryStorage(), 'room1')).toBeNull()
  })

  it('round-trips a saved id', () => {
    const storage = memoryStorage()
    saveActiveLayerId(storage, 'room1', 'layer-abc')
    expect(loadActiveLayerId(storage, 'room1')).toBe('layer-abc')
  })

  it('keeps the selection scoped per room', () => {
    const storage = memoryStorage()
    saveActiveLayerId(storage, 'room1', 'layer-abc')
    expect(loadActiveLayerId(storage, 'room2')).toBeNull()
  })

  it('overwrites the previous selection rather than accumulating', () => {
    const storage = memoryStorage()
    saveActiveLayerId(storage, 'room1', 'layer-abc')
    saveActiveLayerId(storage, 'room1', 'layer-def')
    expect(loadActiveLayerId(storage, 'room1')).toBe('layer-def')
  })

  it('does not clobber the other features stored under the same per-room key', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { pencil: { size: 8, opacity: 1 }, panelPosition: { x: 5, y: 6 } },
    }))
    saveActiveLayerId(storage, 'room1', 'layer-abc')
    const raw = JSON.parse(storage.getItem('al_room_settings:room1')!)
    expect(raw.data.pencil).toEqual({ size: 8, opacity: 1 })
    expect(raw.data.panelPosition).toEqual({ x: 5, y: 6 })
    expect(raw.data.activeLayerId).toBe('layer-abc')
  })

  it('falls back to null for a non-string stored value rather than trusting it', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({ v: 1, data: { activeLayerId: 42 } }))
    expect(loadActiveLayerId(storage, 'room1')).toBeNull()
  })

  it('ignores malformed JSON', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    expect(loadActiveLayerId(storage, 'room1')).toBeNull()
  })
})

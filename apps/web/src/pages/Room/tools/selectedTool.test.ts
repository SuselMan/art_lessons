import { describe, expect, it } from 'vitest'

import { loadSelectedTool, saveSelectedTool } from './selectedTool'
import type { KeyValueStorage } from '../../../lib/browser/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

describe('selectedTool', () => {
  it('returns null when never saved — the room opens on the store default', () => {
    expect(loadSelectedTool(memoryStorage(), 'room1')).toBeNull()
  })

  it('round-trips a drawing tool', () => {
    const storage = memoryStorage()
    saveSelectedTool(storage, 'room1', 'charcoal', 'charcoal')
    expect(loadSelectedTool(storage, 'room1')).toEqual({ tool: 'charcoal', drawingTool: 'charcoal' })
  })

  it('keeps the brush behind the fill or a shape', () => {
    const storage = memoryStorage()
    saveSelectedTool(storage, 'room1', 'fill', 'marker')
    expect(loadSelectedTool(storage, 'room1')).toEqual({ tool: 'fill', drawingTool: 'marker' })
  })

  it('is scoped per room', () => {
    const storage = memoryStorage()
    saveSelectedTool(storage, 'room1', 'liner', 'liner')
    expect(loadSelectedTool(storage, 'room2')).toBeNull()
  })

  it('ignores a passing gesture — the eyedropper does not make the room forget the brush', () => {
    const storage = memoryStorage()
    saveSelectedTool(storage, 'room1', 'watercolor', 'watercolor')
    saveSelectedTool(storage, 'room1', 'eyedropper', 'watercolor')
    saveSelectedTool(storage, 'room1', 'transform', 'watercolor')
    saveSelectedTool(storage, 'room1', 'annotatePen', 'watercolor')
    expect(loadSelectedTool(storage, 'room1')?.tool).toBe('watercolor')
  })

  it('drops a stored name this build does not restore', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { selectedTool: 'hand', drawingTool: 'pencil' },
    }))
    expect(loadSelectedTool(storage, 'room1')).toBeNull()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { selectedTool: 'shape', drawingTool: 'no-such-tool' },
    }))
    expect(loadSelectedTool(storage, 'room1')).toEqual({ tool: 'shape', drawingTool: null })
  })

  it('does not clobber the other features stored under the same per-room key', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { activeLayerId: 'layer-abc' },
    }))
    saveSelectedTool(storage, 'room1', 'marker', 'marker')
    const raw = JSON.parse(storage.getItem('al_room_settings:room1') ?? '{}')
    expect(raw.data.activeLayerId).toBe('layer-abc')
  })
})

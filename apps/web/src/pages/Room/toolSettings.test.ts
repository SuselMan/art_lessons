import { describe, expect, it } from 'vitest'

import { loadToolSettings, saveToolSettings, type RoomToolSettings } from './toolSettings'
import type { KeyValueStorage } from '../../lib/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

const defaults: RoomToolSettings = {
  pencil: { size: 8, opacity: 1 },
  eraser: { size: 24, opacity: 1 },
}

describe('toolSettings', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(loadToolSettings(memoryStorage(), 'room1', defaults)).toEqual(defaults)
  })

  it('round-trips a saved value', () => {
    const storage = memoryStorage()
    const settings: RoomToolSettings = { pencil: { size: 40, opacity: 0.5 }, eraser: { size: 60, opacity: 0.8 } }
    saveToolSettings(storage, 'room1', settings)
    expect(loadToolSettings(storage, 'room1', defaults)).toEqual(settings)
  })

  it('keeps settings scoped per room', () => {
    const storage = memoryStorage()
    saveToolSettings(storage, 'room1', { pencil: { size: 40, opacity: 0.5 }, eraser: { size: 60, opacity: 0.8 } })
    expect(loadToolSettings(storage, 'room2', defaults)).toEqual(defaults)
  })

  it('clamps an out-of-range or corrupt stored value instead of trusting it', () => {
    const storage = memoryStorage()
    saveToolSettings(storage, 'room1', {
      pencil: { size: 99999, opacity: 5 },
      eraser: { size: -10, opacity: -1 },
    })
    expect(loadToolSettings(storage, 'room1', defaults)).toEqual({
      pencil: { size: 120, opacity: 1 },
      eraser: { size: 1, opacity: 0 },
    })
  })

  it('falls back to defaults for a non-numeric field rather than throwing', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({ v: 1, data: { pencil: { size: 'huge' } } }))
    expect(loadToolSettings(storage, 'room1', defaults)).toEqual(defaults)
  })

  it('ignores malformed JSON', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    expect(loadToolSettings(storage, 'room1', defaults)).toEqual(defaults)
  })
})

import { describe, expect, it } from 'vitest'

import { loadToolSettings, saveToolSettings, defaultToolSettings } from './toolSchemas'
import type { KeyValueStorage } from '../../lib/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

describe('toolSchemas load/save', () => {
  it('falls back to schema defaults when nothing is stored', () => {
    expect(loadToolSettings(memoryStorage(), 'room1')).toEqual(defaultToolSettings())
  })

  it('round-trips a saved value', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 40, opacity: 0.5, grade: '2B' }
    settings.eraser = { ...settings.eraser, size: 60, opacity: 0.8 }
    saveToolSettings(storage, 'room1', settings)
    expect(loadToolSettings(storage, 'room1')).toEqual(settings)
  })

  it('keeps settings scoped per room', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 40 }
    saveToolSettings(storage, 'room1', settings)
    expect(loadToolSettings(storage, 'room2')).toEqual(defaultToolSettings())
  })

  it('clamps an out-of-range numberRange value instead of trusting it', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 99999, opacity: 5 }
    settings.eraser = { ...settings.eraser, size: -10, opacity: -1 }
    saveToolSettings(storage, 'room1', settings)
    const loaded = loadToolSettings(storage, 'room1')
    expect(loaded.pencil.size).toBe(120)
    expect(loaded.pencil.opacity).toBe(1)
    expect(loaded.eraser.size).toBe(1)
    expect(loaded.eraser.opacity).toBe(0)
  })

  it('falls back to the default for a non-numeric field rather than throwing', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { pencil: { size: 'huge' } } },
    }))
    expect(loadToolSettings(storage, 'room1')).toEqual(defaultToolSettings())
  })

  it('falls back to the default for an unknown enum option', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { pencil: { grade: '9000B' } } },
    }))
    expect(loadToolSettings(storage, 'room1').pencil.grade).toBe(defaultToolSettings().pencil.grade)
  })

  it('ignores malformed JSON', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    expect(loadToolSettings(storage, 'room1')).toEqual(defaultToolSettings())
  })
})

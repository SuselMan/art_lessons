import { describe, expect, it } from 'vitest'

import {
  loadToolSettings, saveToolSettings, defaultToolSettings,
  LINER_SIZE_LABELS, linerSizeToPx, stepLinerSize,
} from './toolSchemas'
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

  it('falls back to the default for an unrecognized liner size label', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { liner: { size: '999' } } },
    }))
    expect(loadToolSettings(storage, 'room1').liner.size).toBe(defaultToolSettings().liner.size)
  })
})

describe('liner size helpers (#243, ADR 003)', () => {
  it('LINER_SIZE_LABELS matches the engine\'s own fixed mm ladder', () => {
    expect(LINER_SIZE_LABELS).toEqual(['0.1', '0.2', '0.3', '0.5', '0.8'])
  })

  describe('linerSizeToPx', () => {
    it('maps every known label to a positive, ascending px diameter', () => {
      const pxValues = LINER_SIZE_LABELS.map(linerSizeToPx)
      expect(pxValues.every(px => px > 0)).toBe(true)
      for (let i = 1; i < pxValues.length; i++) expect(pxValues[i]).toBeGreaterThan(pxValues[i - 1])
    })

    it('falls back to the smallest size for an unrecognized label', () => {
      expect(linerSizeToPx('nonsense')).toBe(linerSizeToPx(LINER_SIZE_LABELS[0]))
    })
  })

  describe('stepLinerSize', () => {
    it('moves one notch up/down the ladder', () => {
      expect(stepLinerSize('0.3', 1)).toBe('0.5')
      expect(stepLinerSize('0.3', -1)).toBe('0.2')
    })

    it('clamps at either end instead of wrapping', () => {
      expect(stepLinerSize(LINER_SIZE_LABELS[0], -1)).toBe(LINER_SIZE_LABELS[0])
      expect(stepLinerSize(LINER_SIZE_LABELS.at(-1)!, 1)).toBe(LINER_SIZE_LABELS.at(-1))
    })

    it('starts from the bottom of the ladder for an unrecognized current value', () => {
      expect(stepLinerSize('nonsense', 1)).toBe(LINER_SIZE_LABELS[1])
    })
  })
})

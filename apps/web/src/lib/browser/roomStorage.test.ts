import { describe, expect, it } from 'vitest'

import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from './roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

interface RoomBlob {
  a: { x: number }
  b: { y: number }
}

describe('roomStorage', () => {
  it('round-trips a value written in one call', () => {
    const storage = memoryStorage()
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 1 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room1')).toEqual({ a: { x: 1 } })
  })

  // The whole reason writeRoomSettings merges instead of overwriting (#157):
  // two independent features (e.g. toolSettings.ts and panelPosition.ts)
  // share this one per-room key, each writing only the top-level field it
  // owns — a blind overwrite would let whichever feature saves *last* wipe
  // out whatever the other one already stored.
  it('a later patch does not wipe out an earlier, unrelated top-level key', () => {
    const storage = memoryStorage()
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 1 } })
    writeRoomSettings<RoomBlob>(storage, 'room1', { b: { y: 2 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room1')).toEqual({ a: { x: 1 }, b: { y: 2 } })
  })

  it('a patch to an already-set key overwrites just that key', () => {
    const storage = memoryStorage()
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 1 }, b: { y: 2 } })
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 99 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room1')).toEqual({ a: { x: 99 }, b: { y: 2 } })
  })

  it('keeps merged settings scoped per room', () => {
    const storage = memoryStorage()
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 1 } })
    writeRoomSettings<RoomBlob>(storage, 'room2', { b: { y: 2 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room1')).toEqual({ a: { x: 1 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room2')).toEqual({ b: { y: 2 } })
  })

  it('treats corrupt existing data as empty rather than throwing or losing the new patch', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    writeRoomSettings<RoomBlob>(storage, 'room1', { a: { x: 1 } })
    expect(readRoomSettings<RoomBlob>(storage, 'room1')).toEqual({ a: { x: 1 } })
  })
})

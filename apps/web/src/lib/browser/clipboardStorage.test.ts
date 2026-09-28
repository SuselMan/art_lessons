import { describe, expect, it } from 'vitest'

import {
  createInMemoryClipboardStorage, metaOf, parseClipboardMeta, type ClipboardRecord,
} from './clipboardStorage'

const RECORD: ClipboardRecord = {
  image: 'data:image/png;base64,AAAA',
  roomId: 'room-a',
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  updatedAt: 1_700_000_000_000,
}

describe('clipboard meta (#521)', () => {
  it('round-trips a record through the localStorage half', () => {
    const meta = metaOf(RECORD)
    expect(parseClipboardMeta(JSON.stringify(meta))).toEqual(meta)
  })

  it('keeps the pixels out of the meta', () => {
    // The point of the split: the light half is mirrored into a ~5 MB
    // per-origin budget, so a base64 PNG must never reach it.
    expect(metaOf(RECORD)).not.toHaveProperty('image')
  })

  it('reads nothing as an empty clipboard', () => {
    expect(parseClipboardMeta(null)).toBeNull()
    expect(parseClipboardMeta('')).toBeNull()
  })

  it('rejects a value that is not JSON at all', () => {
    expect(parseClipboardMeta('{not json')).toBeNull()
  })

  it('rejects JSON that is not an object', () => {
    expect(parseClipboardMeta('42')).toBeNull()
    expect(parseClipboardMeta('null')).toBeNull()
    expect(parseClipboardMeta('"a string"')).toBeNull()
  })

  it('rejects a record with no room', () => {
    // World coordinates with no room to interpret them against are worse than
    // no clipboard: the paste placement would have nothing to compare and
    // would silently treat them as belonging to whatever room read them.
    const { roomId: _dropped, ...rest } = metaOf(RECORD)
    expect(parseClipboardMeta(JSON.stringify(rest))).toBeNull()
    expect(parseClipboardMeta(JSON.stringify({ ...metaOf(RECORD), roomId: '' }))).toBeNull()
  })

  it('rejects a rect with a non-numeric or infinite field', () => {
    // A field that survives as `undefined` reaches the placement math and
    // becomes NaN coordinates — a paste that exists but cannot be seen or
    // found.
    for (const key of ['x', 'y', 'width', 'height', 'updatedAt'] as const) {
      expect(parseClipboardMeta(JSON.stringify({ ...metaOf(RECORD), [key]: 'nope' }))).toBeNull()
      expect(parseClipboardMeta(JSON.stringify({ ...metaOf(RECORD), [key]: null }))).toBeNull()
    }
    // NaN and Infinity do not survive JSON at all — they arrive as `null`,
    // which the check above already rejects. Guard the hand-built shape too,
    // since nothing stops a future writer from bypassing JSON.
    expect(parseClipboardMeta('{"roomId":"r","x":1,"y":1,"width":1,"height":1,"updatedAt":1e999}')).toBeNull()
  })

  it('rejects an empty rect', () => {
    expect(parseClipboardMeta(JSON.stringify({ ...metaOf(RECORD), width: 0 }))).toBeNull()
    expect(parseClipboardMeta(JSON.stringify({ ...metaOf(RECORD), height: -5 }))).toBeNull()
  })
})

describe('in-memory clipboard storage', () => {
  it('starts empty, holds one record, and clears', async () => {
    const storage = createInMemoryClipboardStorage()
    expect(await storage.read()).toBeNull()
    await storage.write(RECORD)
    expect(await storage.read()).toEqual(RECORD)
    await storage.clear()
    expect(await storage.read()).toBeNull()
  })

  it('keeps only the latest copy', () => {
    // One clipboard per profile, not a history — see RECORD_KEY's comment.
    const storage = createInMemoryClipboardStorage()
    const second = { ...RECORD, roomId: 'room-b', updatedAt: RECORD.updatedAt + 1 }
    return storage.write(RECORD)
      .then(() => storage.write(second))
      .then(() => storage.read())
      .then(read => { expect(read).toEqual(second) })
  })
})

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { isBrushLibrary } from '@grafetto/shared'
import { BrushStorage } from './storage.js'

// Frozen actual converter output from the same self-authored KPP and tip.png.
// old: 4e56467051, new: 672e5a40cd; neither JSON is a replay golden.
const fixtures = fileURLToPath(new URL('./reimportFixture/', import.meta.url))
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function library(name: string) {
  const value: unknown = JSON.parse(readFileSync(join(fixtures, name + '.json'), 'utf8'))
  if (!isBrushLibrary(value)) throw Error(`Invalid fixture ${name}`)
  return value
}

it('preserves the old pinned descriptor and CAS when the same KPP imports to a new identity', () => {
  expect(sha(readFileSync(join(fixtures, 'fixture.kpp')))).toBe('3d9389641787309cab210f806ef27752bbfeeb765033a77e0a5f03f9437e3c8b')
  expect(sha(readFileSync(join(fixtures, 'tip.png')))).toBe('621a8f8f8a10071a4ac438dbc00aa42ee47da3c41ac4f03cab7ece7dca704769')
  const old = library('old'), next = library('new')
  const before = old.brushes[0].descriptor, after = next.brushes[0].descriptor
  expect(before.id).toBe('imported-135ac3f1103dfe97151dc2f7')
  expect(after.id).toBe('imported-8f7db2f04de6c97d45c3b375')
  expect(before.version).toBe(after.version)
  expect(before.opacityByPressure).toEqual([[0, 1], [1, 1]])
  expect(after.opacityByPressure).toEqual([[0, 0], [1, 1]])
  expect(old.assets).toEqual(next.assets)
  expect(old.assets).toHaveLength(1)
  const asset = old.assets[0], hash = asset.id.slice(6), bytes = readFileSync(join(fixtures, asset.file))
  expect(sha(bytes)).toBe(hash)
  const token = `brush:${before.id}@${before.version}`
  const dir = mkdtempSync(join(tmpdir(), 'brush-reimport-'))
  try {
    const storage = new BrushStorage(dir)
    storage.install('author', old, new Map([[hash, bytes]]))
    storage.pin('room', 'author', [token])
    const originalPin = storage.library('rooms', 'room')
    storage.install('author', next, new Map([[hash, bytes]]))
    const restarted = new BrushStorage(dir)
    const owner = restarted.library('owners', 'author')
    expect(owner.brushes.map(b => b.descriptor.id).sort()).toEqual([before.id, after.id].sort())
    expect(owner.assets).toEqual(old.assets)
    expect(restarted.asset(hash, asset.size)).toEqual(bytes)
    expect(restarted.library('rooms', 'room')).toEqual(originalPin)
    expect(restarted.library('rooms', 'room').brushes[0].descriptor).toEqual(before)
    restarted.pin('room', 'author', [token])
    expect(restarted.library('rooms', 'room')).toEqual(originalPin)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

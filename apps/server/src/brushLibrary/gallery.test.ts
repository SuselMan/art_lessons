import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { ImportedBrush } from '@grafetto/shared'
import { BrushStorage, empty } from './storage.js'
import { BrushGallery } from './gallery.js'
import { brushContentHash, brushReference } from './contentAddressing.js'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const brush = (name: string, id: string): ImportedBrush => ({ name, source: name + '.kpp', warnings: [], descriptor: {
  id: 'imported-' + id.repeat(16), version: 1, model: 'stamp', category: 'paint',
  tip: { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
  paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
  sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
} })
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'brush-gallery-')); dirs.push(dir)
  const storage = new BrushStorage(dir), operator = empty()
  operator.brushes.push(brush('Public', 'a'))
  return { dir, storage, gallery: new BrushGallery(storage, operator) }
}
it('shares rendering contents across owners and names without sharing private catalog entries', () => {
  const { dir, storage, gallery } = fixture(), a = brush('Private Alice', 'b'), b = brush('Private Bob', 'c')
  expect(brushContentHash(a)).toBe(brushContentHash(b))
  for (const [owner, item] of [['alice', a], ['bob', b]] as const) { const lib = empty(); lib.brushes.push(item); storage.install(owner, lib, new Map()) }
  expect(readdirSync(join(dir, 'contents'))).toHaveLength(1)
  expect(gallery.page('alice', { tab: 'uploads' }).items.map(v => v.name)).toEqual(['Private Alice'])
  expect(gallery.page('bob', { tab: 'uploads' }).items.map(v => v.name)).toEqual(['Private Bob'])
  expect(gallery.page('bob', { tab: 'library' }).items.filter(v => v.source !== 'Grafetto').map(v => v.name)).toEqual(['Public'])
  expect(new BrushStorage(dir).library('owners', 'alice').brushes).toEqual([a])
})
it('keeps favorites private and paginates filtered metadata', () => {
  const { gallery } = fixture(), ref = brushReference(gallery.operator.brushes[0])
  gallery.setFavorite('alice', ref, true)
  expect(gallery.page('alice', { tab: 'favorites' }).total).toBe(1)
  expect(gallery.page('bob', { tab: 'favorites' }).total).toBe(0)
  expect(gallery.page('alice', { q: 'missing' }).total).toBe(0)
  expect(gallery.page('alice', { offset: 100 }).items).toEqual([])
  expect(() => gallery.setFavorite('bob', 'brush:imported-dead@1', true)).toThrow()
})
it('removes selectable and personal references while retaining room history across restart', () => {
  const { dir, storage, gallery } = fixture(), item = brush('Private', 'd'), lib = empty(); lib.brushes.push(item)
  storage.install('alice', lib, new Map())
  const ref = brushReference(item)
  gallery.setSelection('room', 'alice', [ref])
  expect(storage.library('rooms','room').brushes).toEqual([])
  storage.pin('room','alice',[ref])
  gallery.setSelection('room', 'alice', [])
  storage.removePersonalBrush('alice', ref)
  expect(storage.library('owners', 'alice').brushes).toEqual([])
  expect(gallery.selection('room')).toEqual([])
  expect(new BrushStorage(dir).library('rooms', 'room').brushes).toEqual([item])
  expect(() => gallery.setSelection('other', 'bob', [ref])).toThrow()
})
it('shares current private choices across boards without pinning unused brushes into history', () => {
  const { dir, storage, gallery } = fixture(), item = brush('Shared private', 'e'), lib = empty(); lib.brushes.push(item)
  storage.install('alice',lib,new Map())
  const ref = brushReference(item)
  gallery.setSelection('lesson','alice',['native:pencil',ref])
  expect(storage.library('rooms','lesson').brushes).toEqual([])
  storage.bindSelectionScope('board','lesson')
  storage.pin('board','bob',[ref])
  expect(storage.library('rooms','board').brushes).toEqual([item])
  gallery.setSelection('lesson','alice',['native:pencil'])
  const restarted = new BrushStorage(dir)
  expect(restarted.selectionScope('board')).toBe('lesson')
  expect(restarted.library('rooms','board').brushes).toEqual([item])
  restarted.bindSelectionScope('fresh-board','lesson')
  expect(() => restarted.pin('fresh-board','bob',[ref])).toThrow('unavailable')
  expect(restarted.library('sets','lesson').brushes).toEqual([])
})

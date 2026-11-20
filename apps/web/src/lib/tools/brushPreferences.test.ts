import { expect, it } from 'vitest'
import { loadBrushPreferences, saveBrushPreferences } from './brushPreferences'

it('retains separate native and imported strength through a cold settings read', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const prefs = { 'smudge:native': { size: 44, opacity: .15 }, 'smudge:imported-abcdef01': { size: 70, opacity: .8 } }
  saveBrushPreferences(storage, 'test', prefs)
  expect(loadBrushPreferences(storage, 'test')).toEqual(prefs)
  expect(loadBrushPreferences(storage, 'another-room')).toEqual({})
})

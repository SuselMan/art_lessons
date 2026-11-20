import { describe, expect, it } from 'vitest'
import { DIGITAL_BRUSHES } from '../../engine'
import { brushRole } from './brushCatalog'
import { defaultToolSettings, loadToolSettings, saveToolSettings, TOOL_SCHEMAS } from './toolSchemas'

describe('preset tool roles', () => {
  it('keeps erase ahead of a mixing engine and recognizes a painting mixer', () => {
    const paint = structuredClone(DIGITAL_BRUSHES[0])
    expect(brushRole(paint)).toBe('drawing')
    const mixer = structuredClone(DIGITAL_BRUSHES.find(b => b.model === 'mixer')!)
    expect(brushRole(mixer)).toBe('smudge')
    mixer.behavior = { ...mixer.behavior, version: 2, erase: true }
    expect(brushRole(mixer)).toBe('eraser')
  })
  it('restores imported selections before the catalog arrives without accepting arbitrary strings', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    for (const tool of ['digitalBrush', 'eraser', 'smudge'] as const) {
      const settings = defaultToolSettings()
      settings[tool].brush = 'imported-abcdef0123456789'
      saveToolSettings(storage, 'roles-test', settings)
      expect(loadToolSettings(storage, 'roles-test')[tool].brush).toBe('imported-abcdef0123456789')
      settings[tool].brush = 'javascript:bad'
      saveToolSettings(storage, 'roles-test', settings)
      expect(loadToolSettings(storage, 'roles-test')[tool].brush).toBe(TOOL_SCHEMAS[tool].brush.default)
    }
  })
})

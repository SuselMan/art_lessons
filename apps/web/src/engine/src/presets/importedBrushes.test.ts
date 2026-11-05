import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrushLibrary } from '@grafetto/shared'

function library(): BrushLibrary {
  const hash = 'a'.repeat(64)
  return { schemaVersion: 1, skipped: [], assets: [{ id: `asset:${hash}`, size: 2, file: hash + '.bin' }], brushes: [{
    name: 'Original', source: 'original.abr', warnings: ['old warning'], descriptor: {
      id: 'imported-' + 'b'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    },
  }] }
}
beforeEach(() => vi.resetModules())
describe('immutable imported rendering data', () => {
  it('refreshes metadata while retaining descriptor identity and installed pixels', async () => {
    const registry = await import('./importedBrushes')
    const old = library()
    registry.installBrushLibrary(old)
    registry.installBrushPixels(old.assets[0].id, new Uint8Array([1, 2, 3, 4]))
    const descriptor = registry.importedBrushFromPreset(old.brushes[0].descriptor.id)
    const pixels = registry.importedAssetPixels(old.assets[0].id)
    const current = structuredClone(old)
    current.brushes[0].warnings = ['new diagnostics']
    current.brushes[0].name = 'Current name'
    current.brushes[0].source = 'current.abr'
    current.brushes[0].descriptor = Object.fromEntries(Object.entries(current.brushes[0].descriptor).reverse()) as typeof current.brushes[0]['descriptor']
    registry.installBrushLibrary(current)
    expect(registry.importedBrushes()[0].warnings).toEqual(['new diagnostics'])
    expect(registry.importedBrushes()[0].name).toBe('Current name')
    expect(registry.importedBrushFromPreset(old.brushes[0].descriptor.id)).toBe(descriptor)
    expect(registry.importedAssetPixels(old.assets[0].id)).toBe(pixels)
  })
  it('rejects historical rendering changes atomically', async () => {
    const registry = await import('./importedBrushes')
    const old = library()
    registry.installBrushLibrary(old)
    const previous = registry.importedBrushes()[0]
    const changed = structuredClone(old)
    changed.brushes[0].warnings = ['metadata should not land']
    changed.brushes[0].descriptor.flow = .5
    expect(() => registry.installBrushLibrary(changed)).toThrow('Brush version cannot be replaced')
    expect(registry.importedBrushes()[0]).toBe(previous)
  })
})

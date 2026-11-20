import { expect, it } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'

it('uploads crop UV bounds for bitmap stamps without changing geometric radius', () => {
  const asset = `asset:${'9'.repeat(64)}` as const
  const base = digitalBrushFromPreset('hard-round')
  const radius: number[] = []
  const configurations: Array<BrushDescriptor['tip']['maskBounds']> = [undefined, { x: .125, y: .125, width: .75, height: .75 }]
  for (const [index, bounds] of configurations.entries()) {
    const descriptor: BrushDescriptor = { ...base, id: `imported-${String(index + 1).repeat(24)}`, version: 103, tip: { kind: 'bitmap', mask: asset, maskBounds: bounds, angle: 0, rotation: 'fixed', aspect: 1, hardness: 1 }, behavior: { version: 2 } }
    installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own crop fixture', source: 'qa', warnings: [], descriptor }], assets: [{ id: asset, size: 2, file: `${asset.slice(6)}.bin` }], skipped: [] })
    installBrushPixels(asset, new Uint8Array(4).fill(255))
    const { engine } = createTestEngine({ userId: 'crop-owner' }, { width: 32, height: 32 })
    try {
      engine.appendOperation(makeLayerAdd('crop-owner', 'ink'))
      engine.appendOperation(makeStroke('crop-owner', 'ink', [dab(16, 16, { size: 20, pressure: 1, opacity: 1 })], { tool: 'digitalBrush', preset: `brush:${descriptor.id}@103`, strokeId: 'crop', strokeEnd: true }), 'remote')
      const stamps = brushDraws(engine).filter(draw => draw.kind === 'stamp')
      expect(stamps.length).toBeGreaterThan(0)
      for (const stamp of stamps) expect(stamp.uniforms.get('u_tipBounds')).toEqual(bounds ? [.125, .125, .75, .75] : [0, 0, 1, 1])
      radius.push(stamps[0].uniforms.get('u_dabRadius') as number)
    } finally { engine.destroy() }
  }
  expect(radius[1]).toBe(radius[0])
})

import { expect, it, vi } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'

it.each(['stamp', 'mixer'] as const)('keeps a nine-frame512px %s pipe warm across repeated gestures', async model => {
  const ids = Array.from({ length: 9 }, (_, index) => `asset:${(index + 21).toString(16).padStart(64, '0')}` as const)
  const descriptor: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${(model === 'stamp' ? '5' : '6').repeat(24)}`, version: 104, model,
    tip: { kind: 'bitmap', mask: ids[0], animation: { mode: 'incremental', frames: ids }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
    ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {}),
    behavior: { version: 2, ...(model === 'mixer' ? { wetMix: { charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 } } : {}) },
  }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own warm-cache fixture', source: 'qa', warnings: [], descriptor }], assets: ids.map(id => ({ id, size: 512, file: `${id.slice(6)}.bin` })), skipped: [] })
  ids.forEach((id, index) => installBrushPixels(id, new Uint8Array(512 * 512).fill(40 + index * 20)))
  const { engine, canvas } = createTestEngine({ userId: 'cache-owner' }, { width: 32, height: 32 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('cache-owner', 'ink'))
    const gl = canvas.getContext('webgl')!, upload = vi.spyOn(gl, 'texImage2D')
    const framesUploaded = () => upload.mock.calls.filter(call => call[1] === 0 && call[3] === 512 && call[4] === 512 && call[2] === (model === 'stamp' ? gl.LUMINANCE : gl.ALPHA)).length
    const dabs: Dab[] = Array.from({ length: 18 }, (_, index) => ({ x: 8 + index * .5, y: 16, size: 8, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: index * 8 }))
    const draw = (strokeId: string) => engine.appendOperation(makeStroke('cache-owner', 'ink', dabs, { tool: 'digitalBrush', preset: `brush:${descriptor.id}@104`, strokeId, strokeEnd: true }), 'remote')
    draw('pipe-a')
    expect(framesUploaded()).toBe(9)
    draw('pipe-b')
    expect(framesUploaded()).toBe(9)
  } finally { engine.destroy() }
})

it.each(['stamp', 'mixer'] as const)('bounds uploads for alternating nine/seven-frame512px %s replay batches', async model => {
  let asset = model === 'stamp' ? 300 : 400
  const family = (count: number) => {
    const ids = Array.from({ length: count }, () => `asset:${(++asset).toString(16).padStart(64, '0')}` as const)
    const descriptor: BrushDescriptor = {
      ...digitalBrushFromPreset('hard-round'), id: `imported-${(++asset).toString(16).padStart(24, '0')}`, version: 110, model,
      tip: { kind: 'bitmap', mask: ids[0], animation: { mode: 'incremental', frames: ids }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
      ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {}),
      behavior: { version: 2, ...(model === 'mixer' ? { wetMix: { charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 } } : {}) },
    }
    installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own alternating pipe', source: 'qa', warnings: [], descriptor }], assets: ids.map(id => ({ id, size: 512, file: `${id.slice(6)}.bin` })), skipped: [] })
    ids.forEach(id => installBrushPixels(id, new Uint8Array(512 * 512).fill(180)))
    return { preset: `brush:${descriptor.id}@110`, count }
  }
  const families = [family(9), family(7)], { engine } = createTestEngine({}, { width: 32, height: 32 })
  try {
    await paperReady(engine); engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const gl = engine['gl'], upload = vi.spyOn(gl, 'texImage2D')
    const format = model === 'stamp' ? gl.LUMINANCE : gl.ALPHA
    let gesture = 0
    for (let round = 0; round < 3; round++) for (const item of families) {
      const dabs: Dab[] = Array.from({ length: item.count }, (_, i) => ({ x: 8 + i, y: 16, size: 8, pressure: 1, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: i * 8 }))
      engine.appendOperation(makeStroke('peer', 'ink', dabs, { tool: 'digitalBrush', preset: item.preset, strokeId: `alternating-${gesture++}`, strokeEnd: true }), 'remote')
      const bytes = model === 'stamp' ? engine['_brush']['textures'].bytes : engine['_smudge']['wetTextures'].bytes
      expect(bytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    }
    const count = upload.mock.calls.filter(call => call[1] === 0 && call[2] === format && call[3] === 512).length
    expect(count).toBe(model === 'stamp' ? 36 : 32)
  } finally { engine.destroy() }
})

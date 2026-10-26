import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'
import { WET_TRANSFER_FRAG, wetTransferFragment } from './src/raster/wetMixShaders'

let ordinal = 9929
function fixture(overrides: Partial<BrushDescriptor> = {}) {
  const descriptor: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'),
    id: `imported-${(++ordinal).toString(16).padStart(24, '0')}`, version: 129,
    model: 'mixer', opacity: 1,
    tip: {
      kind: 'procedural', hardness: 1, aspect: 5, angle: 0, rotation: 'fixed',
      profile: { kind: 'standard', shape: 'ellipse', horizontalFade: 1, verticalFade: 1, antialias: true },
    },
    sizeByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], behavior: { version: 2 },
    mixer: { load: 0, initialLoad: 0, pickup: 1, strength: 1, smearAlpha: true, source: 'previousCanvas' },
    ...overrides,
  }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Authored mixer', source: 'qa', warnings: [], descriptor }], assets: [], skipped: [] })
  return { descriptor, preset: `brush:${descriptor.id}@129` }
}

it('keeps legacy compiler input isolated from native profile helpers', () => {
  expect(wetTransferFragment()).toBe(WET_TRANSFER_FRAG)
  expect(WET_TRANSFER_FRAG).not.toContain('brushProceduralMask')
  expect(wetTransferFragment(true)).toContain('float brushProceduralMask(')
  expect(wetTransferFragment(true)).not.toContain('${BRUSH_PROCEDURAL_GLSL}')
})

it('reuses one lazy native mixer program, restores its lifetime, and uploads physical thin axes', async () => {
  const { preset } = fixture()
  const { engine } = createTestEngine({}, { width: 128, height: 64 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const gl = engine['gl'], painter = engine['_smudge']
    const create = vi.spyOn(gl, 'createProgram'), destroy = vi.spyOn(gl, 'deleteProgram')
    const uniform = vi.spyOn(gl, 'uniform4f'), scalar = vi.spyOn(gl, 'uniform1f')
    const append = (x: number, gesture = 'one') => engine.appendOperation(makeStroke('peer', 'ink', [
      dab(x, 32, { size: 40, aspectRatio: 5, pressure: 1 }),
    ], { tool: 'digitalBrush', preset, strokeId: gesture }), 'remote')
    append(20)
    expect(create).not.toHaveBeenCalled()
    append(40); append(60)
    expect(create).toHaveBeenCalledTimes(1)
    const geometry = uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_tipProceduralGeometry')
    expect(geometry.length).toBeGreaterThanOrEqual(2)
    for (const call of geometry) expect(call.slice(1)).toEqual([20, 4, 3, 0])
    engine.appendOperation(makeStroke('peer', 'ink', [
      dab(20, 32, { size: 40, aspectRatio: .25 }), dab(40, 32, { size: 40, aspectRatio: .25 }),
    ], { tool: 'digitalBrush', preset, strokeId: 'thin-x' }), 'remote')
    const wick = scalar.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_wickPx')
    expect(wick.at(-1)?.[1]).toBeCloseTo(Math.SQRT2 / .25)
    expect(create).toHaveBeenCalledTimes(1)
    const lostProgram = painter['proceduralTransfer']?.program
    painter.forget(); painter.initGL()
    expect(painter['proceduralTransfer']).toBeUndefined()
    append(20, 'two'); append(40, 'two')
    expect(create).toHaveBeenCalledTimes(5) // three baseline programs + one new lazy variant
    expect(painter['proceduralTransfer']?.program).not.toBe(lostProgram)
    const second = fixture({ tip: {
      kind: 'procedural', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed',
      profile: { kind: 'standard', shape: 'rectangle', horizontalFade: .5, verticalFade: .5, antialias: false },
    } })
    engine.appendOperation(makeStroke('peer', 'ink', [dab(20, 32), dab(40, 32)], {
      tool: 'digitalBrush', preset: second.preset, strokeId: 'different-profile',
    }), 'remote')
    expect(create).toHaveBeenCalledTimes(5)
    const legacy = fixture({ tip: { kind: 'round', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' } })
    const nativeUploads = uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_tipProcedural').length
    engine.appendOperation(makeStroke('peer', 'ink', [dab(20, 32), dab(40, 32)], {
      tool: 'digitalBrush', preset: legacy.preset, strokeId: 'legacy-again',
    }), 'remote')
    expect(create).toHaveBeenCalledTimes(5)
    expect(uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_tipProcedural')).toHaveLength(nativeUploads)
    const liveProgram = painter['proceduralTransfer']?.program
    painter.destroy()
    expect(destroy.mock.calls.some(([program]) => program === liveProgram)).toBe(true)
    expect(destroy.mock.calls.some(([program]) => program === lostProgram)).toBe(false)
  } finally { engine.destroy() }
})

it('selects the native program for an inline child while keeping the parent mask legacy', async () => {
  const child = fixture().descriptor
  child.tip = { ...child.tip, aspect: 2, angle: .3 }
  const parent = fixture({
    tip: { kind: 'bitmap', mask: 'chalk', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
    behavior: { version: 2, dual: { brush: child, blendMode: 'multiply' } },
  })
  const { engine } = createTestEngine({}, { width: 128, height: 64 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const uniform = vi.spyOn(engine['gl'], 'uniform4f'), scalar = vi.spyOn(engine['gl'], 'uniform1f')
    engine.appendOperation(makeStroke('peer', 'ink', [dab(20, 32, { size: 40 }), dab(40, 32, { size: 40 })], {
      tool: 'digitalBrush', preset: parent.preset, strokeId: 'inline',
    }), 'remote')
    const values = (name: string) => uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === name).map(call => call.slice(1))
    expect(values('u_tipProcedural')).toEqual([[-1, 0, 0, 0]])
    expect(values('u_dualProcedural')).toEqual([[1, 1, 1, 1]])
    expect(values('u_dualProceduralGeometry')).toEqual([[20, 10, 1, 0]])
    const wick = scalar.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_wickPx')
    expect(wick.map(([, value]) => value)).toEqual([0]) // preserve legacy parent's bitmap clipping quad
  } finally { engine.destroy() }
})

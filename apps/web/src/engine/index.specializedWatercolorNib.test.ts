import { expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from './testing/engineTestUtils'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { ribbonProfileFor } from './src/dabs/ribbonProfile'

it('keeps specialization in compact QA and leaves shared/other-tool programs untouched', async () => {
  const normal = createTestEngine().engine
  expect(normal['_ribbonPasses'].specializedWatercolorNib).toBe(false)
  normal.destroy()
  const engine = createTestEngine({ watercolorModel: 'front8-detail-flow-v2', watercolorReview: true }).engine
  await engine.paperReady()
  const passes = engine['_ribbonPasses'], gl = engine['gl'], stamps = engine['_stamps']
  const shared = { program: stamps.program, uniforms: stamps.uniforms, position: stamps.positionLoc }
  const buffer = new AccumulationBuffer(gl, 32, 32), tile = { buffer, originX: 0, originY: 0, contentRect: null }
  const dab: Dab = { x: 16, y: 16, size: 12, pressure: .8, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 1, t: 0 }
  const preset = engine['_resolvePreset']('watercolor', 'normal'), profile = ribbonProfileFor('watercolor', 'normal')
  try {
    expect(passes.specializedWatercolorNib).toBe(true)
    passes.drawRibbonNibPass(buffer, tile, dab, preset, profile, 6, .1)
    passes.drawRibbonNibPass(buffer, tile, dab, preset, profile, 7, .1)
    passes.drawRibbonNibPass(buffer, tile, dab, preset, profile, 7, .1, true, .7, [0, 1], .2, 1, [0, 0], null, 12, .3, [2, .2, 1])
    const entries = [...passes['_watercolorNibPrograms'].values()]
    expect(entries).toHaveLength(3)
    passes.drawRibbonNibPass(buffer, tile, dab, preset, profile, 6, .1)
    expect([...passes['_watercolorNibPrograms'].values()]).toEqual(entries)
    expect(stamps.program).toBe(shared.program)
    expect(stamps.uniforms).toBe(shared.uniforms)
    expect(stamps.positionLoc).toBe(shared.position)
    const use = vi.spyOn(gl, 'useProgram')
    passes.drawRibbonNibPass(buffer, tile, dab, preset, ribbonProfileFor('marker', 'bullet'), 6, .1)
    expect(use).toHaveBeenLastCalledWith(shared.program)
    expect(passes['_watercolorNibPrograms'].size).toBe(3)
    use.mockRestore()
  } finally { buffer.destroy(); engine.destroy() }
})

it('releases optional programs on reinit/destroy and forgets invalid context names', () => {
  const engine = createTestEngine().engine, passes = engine['_ribbonPasses'], gl = engine['gl']
  const first = passes['watercolorNibProgram'](6, false), second = passes['watercolorNibProgram'](7, true)
  const remove = vi.spyOn(gl, 'deleteProgram')
  passes.initProgram()
  expect(remove.mock.calls.filter(([p]) => p === first.program)).toHaveLength(1)
  expect(remove.mock.calls.filter(([p]) => p === second.program)).toHaveLength(1)
  expect(passes['_watercolorNibPrograms'].size).toBe(0)
  const restored = passes['watercolorNibProgram'](6, false)
  expect(restored.program).not.toBe(first.program)
  // A restored context rejects the old generation's names. No delete/query
  // against those names is needed to discard their CPU cache entries.
  const isProgram = gl.isProgram
  gl.isProgram = () => false
  remove.mockClear(); passes['releaseWatercolorNibPrograms']()
  expect(remove).not.toHaveBeenCalled()
  expect(passes['_watercolorNibPrograms'].size).toBe(0)
  gl.isProgram = isProgram
  const live = passes['watercolorNibProgram'](7, false)
  engine.destroy()
  expect(remove.mock.calls.filter(([p]) => p === live.program)).toHaveLength(1)
})

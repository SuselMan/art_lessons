import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { brushPreparationResources } from './src/dabs/BrushPreparation'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { BRUSH_STAMP_FRAG, createBrushStampFragment } from './src/raster/brushBehaviorShaders'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'
let ordinal = 2929
function fixture(): BrushDescriptor {
  return {
    ...digitalBrushFromPreset('hard-round'),
    id: `imported-${(++ordinal).toString(16).padStart(24, 'a')}`, version: 26,
    tip: {
      kind: 'procedural', hardness: 1, aspect: 5, angle: .7, rotation: 'fixed',
      profile: { kind: 'standard', shape: 'rectangle', horizontalFade: .89, verticalFade: .3, antialias: true },
    },
    behavior: { version: 2 },
  }
}
function install(d: BrushDescriptor): string {
  installBrushLibrary({ schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored standard', source: 'qa', warnings: [], descriptor: d }] })
  return `brush:${d.id}@26`
}
it('keeps legacy shader text isolated and derives one complete generic profile program', () => {
  expect(createBrushStampFragment()).toBe(BRUSH_STAMP_FRAG)
  const source = createBrushStampFragment(true)
  expect(source).toContain('float brushProceduralMask(')
  expect(source).toContain('u_dualProceduralGeometry,u_dualProcedural)')
  expect(source).not.toContain('shape=brushGaussianMask(')
})
it('uploads physical axes before rotation and keeps profiles free of tip asset requests', () => {
  const descriptor = fixture(), preset = install(descriptor)
  expect(brushPreparationResources(descriptor).map(r => r.id)).toEqual(['cloud', 'grit'])
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 128, height: 128 })
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine.appendOperation(makeStroke('peer', 'ink', [dab(64, 64, { size: 48, aspectRatio: 5, angle: .7, pressure: 1, opacity: 1 })], { tool: 'digitalBrush', preset, strokeId: 'one', strokeEnd: true }), 'remote')
    const draws = brushDraws(engine).filter(d => d.kind === 'stamp' && d.uniforms.get('u_ceilingPass') === 0)
    expect(draws.length).toBeGreaterThan(0)
    const u = draws[0].uniforms, geometry = u.get('u_tipProceduralGeometry') as number[]
    expect(u.get('u_tipProcedural')).toEqual([2, .89, .3, 1])
    expect(geometry[0]).toBeCloseTo(24)
    expect(geometry[1]).toBeCloseTo(4.8)
    expect(geometry[2]).toBe(3)
    expect(u.get('u_angle')).toBeCloseTo(.7)
    expect(u.get('u_wickPx')).toBeCloseTo(Math.SQRT2)
  } finally { engine.destroy() }
})
it('prepares the stamp capability once before input and resets it on context reinitialization', async () => {
  const descriptor = fixture(), preset = install(descriptor)
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  const gl = engine['gl'], painter = engine['_brush']['behavior']
  const create = vi.spyOn(gl, 'createProgram'), remove = vi.spyOn(gl, 'deleteProgram')
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const append = (id: string) => engine.appendOperation(makeStroke('peer', 'ink', [dab(32, 32, { size: 20, opacity: 1 })], { tool: 'digitalBrush', preset, strokeId: id, strokeEnd: true }), 'remote')
    await paperReady(engine)
    expect(create).not.toHaveBeenCalled()
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'ready' })
    expect(create).toHaveBeenCalledTimes(1)
    await engine.prepareBrush(preset)
    append('one'); append('two')
    expect(create).toHaveBeenCalledTimes(1)
    const lost = painter['proceduralStamp']?.program
    painter.initGL()
    expect(painter['proceduralStamp']).toBeUndefined()
    await engine.prepareBrush(preset)
    expect(create).toHaveBeenCalledTimes(4)
    append('three')
    expect(create).toHaveBeenCalledTimes(4) // Two immutable programs + one new lazy program.
    const live = painter['proceduralStamp']?.program
    expect(live).not.toBe(lost)
    engine.destroy()
    expect(remove).toHaveBeenCalledWith(live)
  } finally {
    create.mockRestore(); remove.mockRestore(); engine.destroy()
  }
})
it('keeps an inline child in its own physical frame without expanding the legacy parent clip', () => {
  const parent = fixture(), child = fixture()
  parent.tip = { kind: 'round', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' }
  child.tip.angle = .73
  child.sizeByPressure = [[0, .5], [1, .5]]
  parent.behavior = { version: 2, dual: { brush: child, blendMode: 'multiply' } }
  const preset = install(parent), { engine } = createTestEngine({ userId: 'observer' }, { width: 128, height: 128 })
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine.appendOperation(makeStroke('peer', 'ink', [dab(64, 64, { size: 48, aspectRatio: 1, angle: 0, opacity: 1, pressure: 1 })], { tool: 'digitalBrush', preset, strokeId: 'inline', strokeEnd: true }), 'remote')
    const draw = brushDraws(engine).find(d => d.kind === 'stamp' && d.uniforms.get('u_ceilingPass') === 0)!
    const u = draw.uniforms, geometry = u.get('u_dualProceduralGeometry') as number[]
    expect(u.get('u_dualProcedural')).toEqual([2, .89, .3, 1])
    expect(geometry[0]).toBeCloseTo(12)
    expect(geometry[1]).toBeCloseTo(2.4)
    expect(geometry[2]).toBe(3)
    expect(u.get('u_dualProceduralAngle')).toBe(.73)
    expect(u.get('u_wickPx')).toBe(0)
  } finally { engine.destroy() }
})

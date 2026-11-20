import { expect, it, vi } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { brushPreparationPlan } from './src/dabs/BrushPreparation'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { proceduralMaskAlpha, proceduralProfileUniforms } from './src/raster/brushProcedural'
import { CIRCLE_BAND_STAMP_FRAG } from './src/raster/circleBandShaders'
import { BRUSH_STAMP_FRAG, createBrushStampFragment } from './src/raster/brushBehaviorShaders'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, readLayerPixels, alphaAt } from './testing/engineTestUtils'

const descriptor: BrushDescriptor = {
  ...digitalBrushFromPreset('hard-round'),
  id: 'imported-aabbee440011223344556677', version: 36, scatter: undefined,
  flow: 1, flowPer: 'stamp', flowSpan: undefined, paperInteraction: 0,
  opacityByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]],
  tip: { kind: 'procedural', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed', profile: { kind: 'circleBand', antialias: true } },
  behavior: { version: 2, rendering: { accumulation: 'maxAlpha', mode: 'buildUp', blendMode: 'normal', wetEdges: 0, burntEdges: 0, burntEdgesMode: 'multiply' } },
}
installBrushLibrary({ schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored circle band', source: 'qa', warnings: [], descriptor }] })
const preset = `brush:${descriptor.id}@36`
const points = [dab(20.25, 20.75, { size: 8, opacity: .5, pressure: .2 }), dab(23.25, 20.75, { size: 12, opacity: .5, pressure: .7 }), dab(23.25, 23.75, { size: 6, opacity: .5, pressure: .3 })]
function sequence(chunks: Dab[][]): { stamps: Map<string, unknown>[]; composites: Map<string, unknown>[]; pixels: Uint8Array } {
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    chunks.forEach((dabs, i) => engine.appendOperation(makeStroke('peer', 'ink', dabs, { tool: 'digitalBrush', preset, strokeId: 'one', ...(i === chunks.length - 1 ? { strokeEnd: true as const } : {}) }), 'remote'))
    const draws = brushDraws(engine)
    return { stamps: draws.filter(d => d.kind === 'stamp').map(d => d.uniforms), composites: draws.filter(d => d.kind === 'composite').map(d => d.uniforms), pixels: readLayerPixels(engine, 'ink')! }
  } finally { engine.destroy() }
}
const geometry = (u: Map<string, unknown>) => ['u_dabCenter', 'u_dabRadius', 'u_aspectRatio', 'u_angle', 'u_wickPx', 'u_circleClipped', 'u_circleClip0', 'u_circleClip1', 'u_circleClip2', 'u_circleClip3', 'u_color'].map(k => u.get(k))
it('uses a separate program and leaves legacy fragment factory inputs byte-identical', () => {
  expect(createBrushStampFragment()).toBe(BRUSH_STAMP_FRAG)
  expect(CIRCLE_BAND_STAMP_FRAG).toContain('floor((1.0-band)*255.0)')
  expect(CIRCLE_BAND_STAMP_FRAG).toContain('alphaByte<=floor(previous.a*255.0+0.5)')
  expect(CIRCLE_BAND_STAMP_FRAG).toContain('vec4(u_color*alpha,alpha)')
  expect(() => proceduralProfileUniforms(descriptor.tip.profile)).toThrow('separate max-alpha')
  expect(() => proceduralMaskAlpha(0, 0, 8, 8, descriptor.tip.profile!)).toThrow('circleBandAlpha')
})
it('preserves actual radius changes and first-dab/full fallback through chunk boundaries', () => {
  const whole = sequence([points]), chunked = sequence(points.map(p => [p]))
  expect(whole.stamps).toHaveLength(3)
  expect(chunked.stamps.map(geometry)).toEqual(whole.stamps.map(geometry))
  expect(chunked.pixels).toEqual(whole.pixels)
  expect(whole.stamps.map(u => u.get('u_dabRadius'))).toEqual([4, 6, 3])
  expect(whole.stamps.map(u => u.get('u_circleClipped'))).toEqual([0, 1, 0])
  for (const u of whole.stamps) {
    expect(u.get('u_wickPx')).toBe(1)
    expect(u.get('u_aspectRatio')).toBe(1)
    expect(u.get('u_angle')).toBe(0)
  }
  expect(whole.composites.every(u => u.get('u_physicalAccumulation') === 1 && u.get('u_opacity') === .5)).toBe(true)
})
it('copies previous stroke coverage region before every max-alpha dab, never self-feedback', () => {
  const copy = vi.spyOn(AccumulationBuffer.prototype, 'copyRegionInto')
  try {
    sequence([points])
    expect(copy).toHaveBeenCalledTimes(3)
    for (let i = 0; i < copy.mock.calls.length; i++) {
      expect(copy.mock.instances[i]).not.toBe(copy.mock.calls[i][0])
      expect(copy.mock.calls[i][5]).toBeLessThan(64)
      expect(copy.mock.calls[i][6]).toBeLessThan(64)
    }
  } finally { copy.mockRestore() }
})
it('keeps strict-max overlap decisions separate from pigment selection and starts each gesture afresh', () => {
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const append = (id: string, color: [number, number, number]) => engine.appendOperation(makeStroke('peer', 'ink', points.slice(0, 2), { tool: 'digitalBrush', preset, strokeId: id, strokeEnd: true, color }), 'remote')
    append('red', [1, 0, 0]); append('blue', [0, 0, 1])
    const stamps = brushDraws(engine).filter(d => d.kind === 'stamp')
    expect(stamps.map(d => d.uniforms.get('u_circleClipped'))).toEqual([0, 1, 0, 1])
    expect(stamps.map(d => d.uniforms.get('u_color'))).toEqual([[1, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, 1]])
    // RGB arithmetic is not represented by the scalar mock. The actual
    // whole-pigment/equal-alpha shader branch requires a real GPU witness.
  } finally { engine.destroy() }
})
it('prewarms one bounded capability, reuses it, resets on context initialization and deletes it', async () => {
  expect(brushPreparationPlan(descriptor).capabilities).toEqual(['stampCircleBand'])
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  const gl = engine['gl'], painter = engine['_brush']['behavior']
  const create = vi.spyOn(gl, 'createProgram'), remove = vi.spyOn(gl, 'deleteProgram')
  try {
    await paperReady(engine)
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'ready' })
    await engine.prepareBrush(preset)
    expect(create).toHaveBeenCalledTimes(1)
    const lost = painter['circleStamp']?.program
    painter.initGL()
    expect(painter['circleStamp']).toBeUndefined()
    await engine.prepareBrush(preset)
    expect(create).toHaveBeenCalledTimes(4)
    const live = painter['circleStamp']?.program
    expect(live).toBeDefined(); expect(live).not.toBe(lost)
    engine.destroy()
    expect(remove).toHaveBeenCalledWith(live)
  } finally { create.mockRestore(); remove.mockRestore(); engine.destroy() }
})

it('renders scalar alpha through the common peer/undo/replay pipeline, without repeated OVER buildup', () => {
  const { engine: author } = createTestEngine({ userId: 'peer' }, { width: 64, height: 64 })
  const { engine: peer } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  try {
    const layer = makeLayerAdd('peer', 'ink')
    author.appendOperation(layer); peer.appendOperation(layer, 'remote')
    const chunks = points.map((point, i) => makeStroke('peer', 'ink', [point], { tool: 'digitalBrush', preset, strokeId: 'one', ...(i === 2 ? { strokeEnd: true as const } : {}) }))
    for (const op of chunks) { author.appendOperation(op); peer.appendOperation(op, 'remote') }
    const pixels = readLayerPixels(author, 'ink')!
    expect(alphaAt(pixels, 22, 21, Math.sqrt(pixels.length / 4))).toBe(128) // .5 global opacity, not repeated OVER.
    expect(readLayerPixels(peer, 'ink')).toEqual(pixels)
    expect(author.undo()?.type).toBe('stroke')
    expect(readLayerPixels(author, 'ink')!.every(v => v === 0)).toBe(true)
    expect(author.redo()?.type).toBe('stroke')
    expect(readLayerPixels(author, 'ink')).toEqual(pixels)
  } finally { author.destroy(); peer.destroy() }
})

it('preserves the placed previous circle when scratch state is cloned by savepoint restore', () => {
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  const painter = engine['_brush']['behavior'], paint = vi.spyOn(painter, 'paint')
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine.appendOperation(makeStroke('peer', 'ink', [points[0]], { tool: 'digitalBrush', preset, strokeId: 'clone' }), 'remote')
    const scratch = paint.mock.calls.at(-1)![6]
    const before = scratch.brushBehavior!
    expect(before.previousCoverageCircle).toEqual({ x: 20.25, y: 20.75, radius: 4 })
    // RibbonStrokeScratch._scalars/_applyScalars use structuredClone. The
    // previous placed radius must be in that data, not keyed by state identity.
    scratch.brushBehavior = structuredClone(before)
    expect(scratch.brushBehavior).not.toBe(before)
    engine.appendOperation(makeStroke('peer', 'ink', [points[1]], { tool: 'digitalBrush', preset, strokeId: 'clone', strokeEnd: true }), 'remote')
    const stamps = brushDraws(engine).filter(d => d.kind === 'stamp')
    expect(stamps.map(d => d.uniforms.get('u_circleClipped'))).toEqual([0, 1])
    expect(stamps.map(d => geometry(d.uniforms))).toEqual(sequence([points.slice(0, 2)]).stamps.map(geometry))
  } finally { paint.mockRestore(); engine.destroy() }
})

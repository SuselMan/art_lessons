import { expect, it, vi } from 'vitest'
import type { BrushDescriptor, BrushDynamic, StrokeOperation } from '@grafetto/shared'
import { createBrushRandomStrokeId } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushExecutionContext } from './src/presets/brushExecutionContext'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, pointerSample } from './testing/engineTestUtils'
const seeds = { version: 1 as const, sequentialSeed: 0, strokeSeed: 3826167899 }, expected = 2887986949 / 0xffffffff
const keyed: BrushDynamic = { control: 'strokeRandom', randomSource: { kind: 'qt5Taus88', key: 'RotationFuzzyStroke' }, minimum: 0, jitter: 0 }
let ordinal = 41000
function fixture(child = false, model: 'stamp' | 'mixer' = 'stamp') {
  const brush: BrushDescriptor = {    
...digitalBrushFromPreset('hard-round'), id: `imported-${(++ordinal).toString(16).padStart(24, '0')}`, version: 141, model,
    tip: { kind: 'round', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' }, sizeByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
    behavior: { version: 2, dynamics: { angle: keyed } }, ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {})  
}
  if(child) brush.behavior = { ...brush.behavior!, dual: { brush: { ...brush, model: 'stamp', mixer: undefined, behavior: { version: 2, dynamics: { angle: keyed }, spacing: { mode: 'diameter', coefficient: .5 } } }, blendMode: 'multiply', sampling: 'independent' } }
  installBrushLibrary({ schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored keyed source', source: 'qa', warnings: [], descriptor: brush }] })
  return `brush:${brush.id}@141`
}
function operation(preset: string, points = [dab(10, 16), dab(30, 16)]) {
  return makeStroke('peer', 'ink', points, { tool: 'digitalBrush', preset, strokeId: createBrushRandomStrokeId('nonce41000', seeds), brushRandom: seeds })
}
it('fails missing-context operations/live/preview before history, allocation or rendering side effects', () => {
  const { engine } = createTestEngine(), preset = fixture()
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const op = makeStroke('peer', 'ink', [dab(10, 16)], { tool: 'digitalBrush', preset, strokeId: 'legacy-id' })
    const before = engine.getOperations(), draw = vi.spyOn(engine['gl'], 'drawArrays'), upload = vi.spyOn(engine['gl'], 'texImage2D')
    expect(() => engine.appendOperation(op, 'remote')).toThrow('explicit gesture context')
    expect(() => engine.previewOperation(op)).toThrow('explicit gesture context')
    expect(() => engine.appendPeerLiveDabs('peer', { strokeId: 'legacy-id', layerId: 'ink', tool: 'digitalBrush', preset, color: [0, 0, 0], packetSeq: 0, dabs: [] })).toThrow('explicit gesture context')
    expect(engine.getOperations()).toEqual(before)
    expect(draw).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled()
  } finally { engine.destroy() }
})
it.each(['stamp', 'mixer'] as const)('passes the same keyed context to %s primary and independent child across chunks', model => {
  const { engine } = createTestEngine(), preset = fixture(true, model)
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine.appendOperation(operation(preset, [dab(10, 16)]), 'remote')
    engine.appendOperation({ ...operation(preset, [dab(30, 16)]), id: 'second-chunk' }, 'remote')
    const angles = brushDraws(engine).filter(draw => draw.kind === 'stamp').map(draw => draw.uniforms.get('u_angle') as number)
    expect(angles.length).toBeGreaterThan(1)
    for(const angle of angles) expect(angle).toBeCloseTo((expected - 1) * Math.PI * 2, 5)
    if(model === 'mixer') expect(engine['_smudge']['wetGestures'].get('peer')?.behavior.execution?.brushRandom).toEqual(seeds)
  } finally { engine.destroy() }
})
it('captures local seeds for spacing, live and recorded replay without reading a later ambient gesture', async () => {
  const ops: StrokeOperation[] = [], preset = fixture(), { engine } = createTestEngine({ userId: 'owner', onLocalOperation: op => { if(op.type === 'stroke') ops.push(op) } })
  const random = crypto.getRandomValues.bind(crypto), spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => { if(array instanceof Uint32Array && array.length === 2) array.set([seeds.sequentialSeed, seeds.strokeSeed]); else random(array); return array })
  try {
    await paperReady(engine); engine.initLayer('ink'); engine.setActiveLayer('ink'); engine.setTool('digitalBrush'); engine.setPencil(preset)
    engine['_onStart'](pointerSample(10, 16, { pressure: 1, timeStamp: 0 }))
    expect(engine['_dabs'].brushExecution?.brushRandom).toEqual(seeds)
    engine['_onEnd'](pointerSample(30, 16, { pressure: 1, timeStamp: 30 }))
    expect(ops.length).toBeGreaterThan(0)
    for(const op of ops) expect(op.brushRandom).toEqual(seeds)
    const replay = createTestEngine({ userId: 'observer' }).engine
    try {
      replay.appendOperation(makeLayerAdd('owner', 'ink'))
      replay['_strokeBrushRandom'] = { version: 1, sequentialSeed: 7, strokeSeed: 9 }
      for(const op of ops) replay.appendOperation(JSON.parse(JSON.stringify(op)), 'remote')
      const angles = brushDraws(replay).filter(draw => draw.kind === 'stamp').map(draw => draw.uniforms.get('u_angle') as number)
      expect(angles.length).toBeGreaterThan(0)
      for(const angle of angles) expect(angle).toBeCloseTo((expected - 1) * Math.PI * 2, 5)
    } finally { replay.destroy() }
    const held = 'held-context'; engine['_wcAsyncLocalStroke'] = held
    engine['_wcAsyncLocalTools'].set(held, { layers: new Map(), ended: false, queued: 0, execution: brushExecutionContext(seeds) })
    engine['_strokeBrushRandom'] = { version: 1, sequentialSeed: 7, strokeSeed: 9 }
    engine['_paintAsyncLocalTool']('ink', [dab(10, 16)], 'digitalBrush', preset, [0, 0, 0])
    expect(engine['_wcAsyncLocalTools'].get(held)?.layers.get('ink')?.scratch.brushBehavior?.execution?.brushRandom).toEqual(seeds)
  } finally { engine.destroy(); spy.mockRestore() }
})

it('uses packet-owned context for live painting, independent of the observer current gesture', () => {
  const { engine } = createTestEngine(), preset = fixture(true)
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine['_strokeBrushRandom'] = { version: 1, sequentialSeed: 7, strokeSeed: 9 }
    engine.appendPeerLiveDabs('peer', { strokeId: createBrushRandomStrokeId('live_41000', seeds), layerId: 'ink', tool: 'digitalBrush', preset, color: [0, 0, 0], packetSeq: 0, dabs: [dab(10, 16), dab(30, 16)], brushRandom: seeds })
    const angles = brushDraws(engine).filter(draw => draw.kind === 'stamp').map(draw => draw.uniforms.get('u_angle') as number)
    expect(angles.length).toBeGreaterThan(1)
    for(const angle of angles) expect(angle).toBeCloseTo((expected - 1) * Math.PI * 2, 5)
    const scratches = [...engine['_replayRibbonChunks'].values()].map(chunk => chunk.scratch)
    expect(scratches.some(scratch => scratch.brushBehavior?.execution?.brushRandom?.strokeSeed === seeds.strokeSeed)).toBe(true)
    const child = scratches.find(scratch => scratch.brushBehavior)?.brushSecondary()
    expect(child?.sampling.geometry?.execution?.brushRandom).toEqual(seeds)
    expect(child?.scratch.brushBehavior?.execution?.brushRandom).toEqual(seeds)
  } finally { engine.destroy() }
})

import { expect, it, vi } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { beginBrushBehavior, behaviorStampsForDab } from './src/presets/brushBehavior'
import { brushAlphaThresholdValue } from './src/presets/brushAlphaThreshold'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'

let serial = 3700
const response = { control: 'pressure' as const, minimum: 0, jitter: 0, curve: [[0, 0], [.5, .25], [1, 1]] as [number, number][] }
function fixture(model: 'stamp' | 'mixer' = 'stamp', dynamic = true): BrushDescriptor {
  return {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${(++serial).toString(16).padStart(24, '0')}`, version: 137,
    model, scatter: undefined, flow: 1, opacity: 1,
    sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
    tip: { kind: 'round', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed', alphaThreshold: { value: .8, softness: .3 } },
    ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {}),
    behavior: { version: 2, ...(dynamic ? { modulations: { sharpness: [response] } } : {}) },
  }
}
function install(brush: BrushDescriptor): string {
  installBrushLibrary({ schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored sharpness', source: 'qa', warnings: [], descriptor: brush }] })
  return `brush:${brush.id}@137`
}
const inputs = [0, .5, 1].map((pressure, i) => dab(16 + 16 * i, 32, { size: 16, opacity: 1, pressure }))
function stamps(brush: BrushDescriptor, chunks: Dab[][]) {
  const preset = install(brush), { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    chunks.forEach((points, i) => engine.appendOperation(makeStroke('peer', 'ink', points, { tool: 'digitalBrush', preset, strokeId: 'sharpness', ...(i === chunks.length - 1 ? { strokeEnd: true as const } : {}) }), 'remote'))
    return brushDraws(engine).filter(d => d.kind === 'stamp' && d.uniforms.get('u_ceilingPass') === 0).map(d => d.uniforms)
  } finally { engine.destroy() }
}
it('scales threshold strength, clamps it, leaves softness alone and has identity default', () => {
  const settings = { value: .8, softness: .3 }
  expect(brushAlphaThresholdValue(settings)).toBe(.8)
  expect(brushAlphaThresholdValue(settings, .25)).toBe(.2)
  expect(brushAlphaThresholdValue(settings, 4)).toBe(1)
  expect(brushAlphaThresholdValue(settings, -1)).toBe(0)
  expect(brushAlphaThresholdValue(undefined, 1)).toBe(0)
})
it('samples pressure response once per placed dab and preserves whole/chunk/clone placement', () => {
  const brush = fixture(), expected = [0, .2, .8]
  const whole = stamps(brush, [inputs]), chunks = stamps(brush, inputs.map(d => [d]))
  const thresholds = (draws: Map<string, unknown>[]) => draws.map(d => d.get('u_alphaThreshold'))
  expect(thresholds(whole)).toEqual(expected.map(value => [value, .3, 1]))
  expect(thresholds(chunks)).toEqual(thresholds(whole))
  let state = beginBrushBehavior(inputs[0])
  const values = inputs.map(d => {
    const stamp = behaviorStampsForDab(brush, d, state, [1, 0, 0])[0]
    state = structuredClone(state)
    return stamp.sharpnessScale
  })
  expect(values).toEqual([0, .25, 1])
})
it('leaves legacy stamp fields and jitter geometry unchanged when sharpness is absent', () => {
  const brush = fixture('stamp', false), input = inputs[1]
  brush.scatter = { count: 3, radius: .2, scale: 1, sizeJitter: .2, angleJitter: .3, flowJitter: .1 }
  const original = behaviorStampsForDab(brush, input, beginBrushBehavior(input), [1, 0, 0])
  expect(original.every(s => !('sharpnessScale' in s) && !('dualSharpnessScale' in s))).toBe(true)
  const dynamic = { ...brush, behavior: { version: 2 as const, dynamics: { sharpness: response } } }
  const changed = behaviorStampsForDab(dynamic, input, beginBrushBehavior(input), [1, 0, 0])
  expect(changed.map(({ sharpnessScale: _scale, ...rest }) => rest)).toEqual(original)
  expect(changed.map(s => s.sharpnessScale)).toEqual([.25, .25, .25])
})
it.each([false, true])('keeps primary and %s independent-child threshold responses separate', independent => {
  const brush = fixture(), child = fixture()
  child.tip.alphaThreshold = { value: .6, softness: .7 }
  child.behavior = { version: 2, dynamics: { sharpness: { control: 'pressure', minimum: 0, jitter: 0, curve: [[0, 1], [1, 0]] } } }
  brush.behavior!.dual = { brush: child, blendMode: 'multiply', ...(independent ? { sampling: 'independent' as const } : {}) }
  const draws = stamps(brush, [inputs])
  const primary = draws.filter(d => (d.get('u_alphaThreshold') as number[])[1] === .3)
  expect(primary.map(d => d.get('u_alphaThreshold'))).toEqual([[0, .3, 1], [.2, .3, 1], [.8, .3, 1]])
  if (independent) {
    const childDraws = draws.filter(d => (d.get('u_alphaThreshold') as number[])[1] === .7)
    expect(childDraws.length).toBeGreaterThan(0)
    for (const d of childDraws) expect((d.get('u_alphaThreshold') as number[])[0]).toBeCloseTo(.6 * (1 - (d.get('u_paperPressure') as number)), 6)
  } else expect(primary.map(d => d.get('u_dualAlphaThreshold'))).toEqual([[.6, .7, 1], [.3, .7, 1], [0, .7, 1]])
})
it('uploads dynamic primary and inline-child sharpness through the common wet stamp', () => {
  const brush = fixture('mixer'), child = fixture()
  child.tip.alphaThreshold = { value: .6, softness: .7 }
  child.behavior = { version: 2, modulations: { sharpness: [{ control: 'pressure', minimum: 0, jitter: 0, curve: [[0, 1], [1, 0]] }] } }
  brush.behavior!.dual = { brush: child, blendMode: 'multiply' }
  const preset = install(brush), { engine } = createTestEngine({ userId: 'observer' }, { width: 64, height: 64 })
  const uniforms = vi.spyOn(engine['gl'], 'uniform3f')
  try {
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    engine.appendOperation(makeStroke('peer', 'ink', [inputs[1], inputs[0], inputs[2]], { tool: 'digitalBrush', preset, strokeId: 'wet', strokeEnd: true }), 'remote')
    const values = (name: string) => uniforms.mock.calls.filter(([location]) => (location as unknown as { name: string }).name === name).map(call => call.slice(1))
    expect(values('u_alphaThreshold')).toEqual([[.2, .3, 1], [0, .3, 1], [.8, .3, 1]])
    expect(values('u_dualAlphaThreshold')).toEqual([[.3, .7, 1], [.6, .7, 1], [0, .7, 1]])
  } finally { uniforms.mockRestore(); engine.destroy() }
})

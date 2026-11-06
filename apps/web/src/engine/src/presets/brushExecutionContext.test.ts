import { expect, it } from 'vitest'
import type { BrushDynamic } from '@grafetto/shared'
import { beginBrushBehavior, brushDynamicValue, behaviorStampsForDab } from './brushBehavior'
import { brushExecutionContext, assertBrushExecutionContext,assertSameBrushExecutionContext } from './brushExecutionContext'
import { digitalBrushFromPreset } from './digitalBrushPresets'
import { dab } from '../../testing/engineTestUtils'
import { DabSystem } from '../dabs/DabSystem'

export const keyed: BrushDynamic = { control: 'strokeRandom', randomSource: { kind: 'qt5Taus88', key: 'RotationFuzzyStroke' }, minimum: 0, jitter: 0 }
const seed = 3826167899, expected = 2887986949 / 0xffffffff
it('matches observed native keyed output, independent of coordinates, sequential seed and cloned state', () => {
  for(const sequentialSeed of [0, 0xffffffff]) {
    const context = brushExecutionContext({ version: 1, sequentialSeed, strokeSeed: seed })
    const state = beginBrushBehavior(dab(1, 2), context)
    expect(brushDynamicValue(keyed, dab(1, 2), state, .1)).toBe(expected)
    expect(brushDynamicValue(keyed, dab(-10, 200), structuredClone(state), .9)).toBe(expected)
    expect(state.strokeRandomCache?.values).toHaveLength(1)
    const cloned = structuredClone(state)
    expect(brushDynamicValue(keyed, dab(10, 20), cloned, .5)).toBe(expected)
    expect(cloned.strokeRandomCache).toEqual(state.strokeRandomCache)
    expect(cloned.strokeRandomCache).not.toBe(state.strokeRandomCache)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  }
  const state = beginBrushBehavior(dab(1, 2), brushExecutionContext({ version: 1, sequentialSeed: 0, strokeSeed: 2794053708 }))
  expect(brushDynamicValue(keyed, dab(1, 2), state, .1)).toBe(2750365324 / 0xffffffff)
})
it('rejects missing context but preserves all legacy numeric streams even when metadata exists', () => {
  const input = dab(1, 2), old = beginBrushBehavior(input), contextual = beginBrushBehavior(input, brushExecutionContext({ version: 1, sequentialSeed: 0, strokeSeed: seed }))
  expect(() => brushDynamicValue(keyed, input, old, .2)).toThrow('explicit gesture context')
  const legacy = { control: 'strokeRandom' as const, randomStream: 42, minimum: 0, jitter: 0 }
  expect(brushDynamicValue(legacy, input, contextual, .2)).toBe(brushDynamicValue(legacy, input, old, .2))
  const brush = { ...digitalBrushFromPreset('hard-round'), behavior: { version: 2 as const, modulations: { size: [keyed] } } }
  expect(() => assertBrushExecutionContext(brush)).toThrow('explicit gesture context')
  expect(() => assertBrushExecutionContext(brush, brushExecutionContext({ version: 1, sequentialSeed: 0, strokeSeed: 0 }))).not.toThrow()
})
it('copies seed values and isolates a spacing preview fork from later caller mutation', () => {
  const seeds = { version: 1 as const, sequentialSeed: 0, strokeSeed: seed }, context = brushExecutionContext(seeds)
  const brush = { ...digitalBrushFromPreset('hard-round'), behavior: { version: 2 as const, dynamics: { size: keyed } } }
  const sys = new DabSystem({ spacingFactor: .2 })
  sys.brushExecution = context
  sys.autoSpacing = { mode: 'diameter', coefficient: .2, brush, sizeMultiplier: 1 }
  sys.startStroke(0, 0, 1, 0, 0, 20, 1)
  const fork = sys.forkForPreview(), before = structuredClone(sys['_spacingBehavior'])
  seeds.strokeSeed = 0
  expect(fork.brushExecution?.brushRandom?.strokeSeed).toBe(seed)
  expect(fork.continueStroke(30, 0, 1, 0, 0, 20, 1)).toEqual(sys.continueStroke(30, 0, 1, 0, 0, 20, 1))
  expect(before?.execution?.brushRandom?.strokeSeed).toBe(seed)
  const input = dab(10, 10), state = beginBrushBehavior(input, fork.brushExecution)
  expect(behaviorStampsForDab(brush, input, state, [0, 0, 0])[0].size).toBeCloseTo(input.size * expected)
})

it('bounds cached keyed values without changing overflow results or aliasing clones', () => {
  const state = beginBrushBehavior(dab(1, 2), brushExecutionContext({ version: 1, sequentialSeed: 0, strokeSeed: seed }))
  for(let index = 0;index < 70;index++)brushDynamicValue({ ...keyed, randomSource: { kind: 'qt5Taus88', key: `key-${index}` } }, dab(1, 2), state, .1)
  expect(state.strokeRandomCache?.values).toHaveLength(64)
  const overflow = { ...keyed, randomSource: { kind: 'qt5Taus88' as const, key: 'key-69' } }
  expect(brushDynamicValue(overflow, dab(1, 2), structuredClone(state), .1)).toBe(brushDynamicValue(overflow, dab(1, 2), state, .1))
})

it('requires recorded merged sources and keeps them stable across preview clones',()=>{
 const brush=structuredClone(digitalBrushFromPreset('hard-round'));brush.model='mixer';brush.mixer={source:'projectionCanvas',load:0,initialLoad:0,pickup:1,strength:1}
 expect(()=>assertBrushExecutionContext(brush)).toThrow('projection sources')
 const source={version:1 as const,projection:[{id:'lower',opacity:.5}]},context=brushExecutionContext(undefined,source)
 expect(()=>assertBrushExecutionContext(brush,context)).not.toThrow()
 source.projection[0].opacity=1
 expect(context?.brushSource?.projection?.[0].opacity).toBe(.5)
 const sys=new DabSystem({spacingFactor:.2});sys.brushExecution=context
 expect(sys.forkForPreview().brushExecution?.brushSource).toEqual(context?.brushSource)
 expect(()=>assertSameBrushExecutionContext(context,structuredClone(context))).not.toThrow()
 expect(()=>assertSameBrushExecutionContext(context,brushExecutionContext(undefined,source))).toThrow('sources changed')
 expect(()=>assertSameBrushExecutionContext(context,undefined)).toThrow('sources changed')
})

it('requires a gesture-owned palette for gradient foregrounds',()=>{
 const brush=structuredClone(digitalBrushFromPreset('hard-round'))
 brush.model='mixer';brush.mixer={source:'previousCanvas',load:0,initialLoad:0,pickup:1,strength:1,foreground:{gradient:{rate:1,value:1}}}
 expect(()=>assertBrushExecutionContext(brush)).toThrow('gradient')
 const context=brushExecutionContext(undefined,{version:1,gradient:'f'.repeat(2048)})
 expect(()=>assertBrushExecutionContext(brush,context)).not.toThrow()
 expect(()=>assertSameBrushExecutionContext(context,brushExecutionContext(undefined,{version:1,gradient:'0'.repeat(2048)}))).toThrow('sources changed')
})

import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { advanceBrushAnimation, brushAnimationIndex, beginBrushBehavior, behaviorStampsForDab, secondaryBrushDabs } from './brushBehavior'
import { digitalBrushFromPreset } from './digitalBrushPresets'
import { importedBrushAssets, installBrushLibrary } from './importedBrushes'

const frames: NonNullable<BrushDescriptor['tip']['animation']>['frames'] = ['1', '2', '3'].map(value => `asset:${value.repeat(64)}` as const)
const brush = (mode: 'incremental' | 'random' = 'incremental'): BrushDescriptor => ({
  ...digitalBrushFromPreset('hard-round'), id: 'imported-abcdefabcdeffedcbafedcba', version: 101,
  tip: { kind: 'bitmap', mask: frames[0], animation: { mode, frames }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
  scatter: { count: 3, radius: .2, scale: 1, sizeJitter: .1, angleJitter: .2, flowJitter: 0 },
  behavior: { version: 2 },
})
const dabs: Dab[] = Array.from({ length: 20 }, (_, index) => ({ x: 10 + index * 3, y: 20, pressure: .8, size: 30, tiltX: 0, tiltY: 0, aspectRatio: 1, angle: 0, opacity: 1, t: index * 8 }))
const color: [number, number, number] = [.2, .4, .6]

describe('bitmap pipe frame selection', () => {
  it('advances incremental frames once per logical dab, before scatter count', () => {
    const source = brush(), state = beginBrushBehavior(dabs[0])
    for (const [index, dab] of dabs.entries()) {
      const stamps = behaviorStampsForDab(source, dab, state, color)
      expect(stamps).toHaveLength(3)
      expect(stamps.map(stamp => stamp.mask)).toEqual(Array(3).fill(frames[index % 3]))
    }
    expect(state.dabOrdinal).toBe(dabs.length)
  })

  it.each(['incremental', 'random'] as const)('keeps %s frame order through chunk boundaries and restored gesture state', mode => {
    const source = brush(mode), full = beginBrushBehavior(dabs[0])
    const expected = dabs.flatMap(dab => behaviorStampsForDab(source, dab, full, color))
    let chunk = beginBrushBehavior(dabs[0])
    const actual = []
    for (let index = 0; index < dabs.length; index += 7) {
      actual.push(...dabs.slice(index, index + 7).flatMap(dab => behaviorStampsForDab(source, dab, chunk, color)))
      chunk = structuredClone(chunk)
    }
    expect(actual).toEqual(expected)
    expect(chunk).toEqual(full)
    expect(new Set(actual.map(stamp => stamp.mask)).size).toBe(3)
  })

  it('does not move existing jitter streams or create state on an unanimated brush', () => {
    const animated = brush('random'), staticSource: BrushDescriptor = { ...animated, tip: { ...animated.tip, animation: undefined } }
    const before = beginBrushBehavior(dabs[0]), after = beginBrushBehavior(dabs[0])
    for (const dab of dabs) {
      const stamps = behaviorStampsForDab(animated, dab, before, color).map(({ mask: _mask, ...stamp }) => stamp)
      expect(stamps).toEqual(behaviorStampsForDab(staticSource, dab, after, color))
    }
    expect(after.dabOrdinal).toBeUndefined()
  })

  it('gives a local dual component one stable frame per primary logical dab', () => {
    const child = brush('random'), primary: BrushDescriptor = { ...brush(), tip: { ...brush().tip, animation: undefined }, behavior: { version: 2, dual: { brush: child, blendMode: 'multiply' } } }
    const state = beginBrushBehavior(dabs[0])
    const masks = dabs.map(dab => {
      const stamps = behaviorStampsForDab(primary, dab, state, color)
      expect(new Set(stamps.map(stamp => stamp.dualMask)).size).toBe(1)
      return stamps[0].dualMask
    })
    expect(new Set(masks).size).toBe(3)
  })

  it('keeps independent child frame phase through resampling batches', () => {
    const primary = brush(), child = { ...brush(), spacing: .1 }
    const render = (chunkSize: number) => {
      const sampling = { remaining: 0 }, state = beginBrushBehavior(dabs[0])
      const output = []
      for (let index = 0; index < dabs.length; index += chunkSize) {
        const sampled = secondaryBrushDabs(primary, child, dabs.slice(index, index + chunkSize), sampling)
        output.push(...sampled.flatMap(dab => behaviorStampsForDab(child, dab, state, color)))
      }
      return output
    }
    expect(render(7)).toEqual(render(20))
  })

  it('preserves preview forks and counts zero-travel logical mixer dabs', () => {
    const source = brush(), real = beginBrushBehavior(dabs[0])
    behaviorStampsForDab(source, dabs[0], real, color)
    const fork = structuredClone(real)
    behaviorStampsForDab(source, dabs[1], fork, color)
    expect(real.dabOrdinal).toBe(1)
    advanceBrushAnimation(source, real)
    expect(behaviorStampsForDab(source, dabs[2], real, color)[0].mask).toBe(frames[2])
  })

  it('enumerates all animation assets recursively for cold-peer preload', () => {
    const descriptor = brush()
    const childFrame = `asset:${'4'.repeat(64)}` as const
    descriptor.behavior = { version: 2, dual: { brush: { ...brush(), tip: { ...brush().tip, animation: { mode: 'incremental', frames: [frames[0], childFrame] } } }, blendMode: 'multiply', sampling: 'independent' } }
    installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own pipe fixture', source: 'qa', warnings: [], descriptor }], assets: [...frames, childFrame].map(id => ({ id, size: 2, file: `${id.slice(6)}.bin` })), skipped: [] })
    expect(importedBrushAssets(`brush:${descriptor.id}@101`)).toEqual([...frames, childFrame])
  })
})

// New modes deliberately use declared rank before modulo ACTUAL frame count.
describe('revision91 native pipe selectors',()=>{
  const selected=(mode:'pressure'|'constant',rank=5):BrushDescriptor=>{
    const b=brush();b.version=91;b.tip.animation={mode,frames,...(mode==='pressure'?{rank}:{})};return b
  }
  it('retains uint32 native cast/modulo for EOF-short pressure and admitted values outside unit range',()=>{
    for(const rank of [1,5,257,2147483647])for(const pressure of [0,.125,.5,1,...(rank<1000?[-1,1.5,2]:[])]){
      const b=selected('pressure',rank),a=b.tip.animation!;a.frames=frames.slice(0,2)
      const n=BigInt(Math.trunc(Math.fround(pressure)*(rank-1)+.5))
      const expected=Number(BigInt.asUintN(32,n)%2n)
      expect(brushAnimationIndex(b.tip,123,19,0,pressure)).toBe(expected)
    }
  })
  it('agrees with recorded f32 at every half threshold and both neighboring floats',()=>{
    const b=selected('pressure',257)
    for(let i=0;i<256;i++){
      const f=new Float32Array([ (i+.5)/256 ]),u=new Uint32Array(f.buffer),bits=u[0]
      for(const offset of [-1,0,1]){u[0]=bits+offset;const p=f[0]
        expect(brushAnimationIndex(b.tip,1,1,0,p)).toBe(Math.trunc(p*256+.5)%3)
        expect(brushAnimationIndex(b.tip,1,1,0,p+Number.EPSILON*p)).toBe(brushAnimationIndex(b.tip,1,1,0,Math.fround(p+Number.EPSILON*p)))
      }
    }
  })
  it('evaluates once before scatter for primary and inline child, without changing jitter streams',()=>{
    for(const mode of ['pressure','constant']as const){
      const b=selected(mode);b.behavior={version:2,dual:{brush:selected('pressure',257),blendMode:'multiply'}}
      const state=beginBrushBehavior(dabs[0])
      for(const pressure of [0,.125,.5,1]){
        const dab={...dabs[0],pressure},stamps=behaviorStampsForDab(b,dab,state,color)
        expect(stamps).toHaveLength(3)
        expect(stamps.map(s=>s.mask)).toEqual(Array(3).fill(frames[mode==='constant'?0:Math.trunc(Math.fround(pressure)*4+.5)%3]))
        expect(stamps.map(s=>s.dualMask)).toEqual(Array(3).fill(frames[Math.trunc(Math.fround(pressure)*256+.5)%3]))
      }
      expect(state.dabOrdinal).toBe(4)
    }
  })
  it('fails invalid pressure in either role BEFORE mutating author state',()=>{
    for(const inline of [false,true])for(const pressure of [NaN,Infinity,1e30]){
      const b=inline?brush():selected('pressure');if(inline)b.behavior={version:2,dual:{brush:selected('pressure'),blendMode:'multiply'}}
      const state=beginBrushBehavior(dabs[0]),before=structuredClone(state)
      expect(()=>behaviorStampsForDab(b,{...dabs[0],pressure},state,color)).toThrow(/GIH pressure/)
      expect(state).toEqual(before)
    }
  })
  it('keeps independent resampled pressure selection identical across chunks and restored state',()=>{
    const primary=brush(),child=selected('pressure',257)
    const inputs=dabs.map((d,i)=>({...d,pressure:i/19}))
    const render=(chunk:number)=>{const sampling={remaining:0};let state=beginBrushBehavior(inputs[0]);const out=[]
      for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);for(const dab of secondaryBrushDabs(primary,child,inputs.slice(i,i+chunk),sampling)){
        const stamps=behaviorStampsForDab(child,dab,state,color)
        expect(stamps[0].mask).toBe(frames[Math.trunc(Math.fround(dab.pressure)*256+.5)%3]);out.push(...stamps)
      }}return out
    }
    expect(render(7)).toEqual(render(20))
  })
})

it('does not query unused independent pressure child with parent pressure when no child dab is emitted',()=>{
  const child=brush();child.version=91;child.tip.animation={mode:'pressure',rank:2147483647,frames};child.spacing=.1
  const parent=brush();parent.behavior={version:2,dual:{brush:child,sampling:'independent',blendMode:'multiply'}}
  const start={...dabs[0],pressure:.5},resume={...dabs[1],x:start.x+.00001,pressure:2},sampling={remaining:0}
  const first=secondaryBrushDabs(parent,child,[start],sampling)
  expect(first).toHaveLength(1)
  const childState=beginBrushBehavior(start)
  expect(behaviorStampsForDab(child,first[0],childState,color)[0].mask).toBe(frames[1073741823%3])
  expect(secondaryBrushDabs(parent,child,[resume],sampling)).toEqual([])
  const parentState=beginBrushBehavior(start)
  const stamps=behaviorStampsForDab(parent,resume,parentState,color)
  expect(stamps).toHaveLength(3);expect(stamps.every(s=>s.dualMask===undefined)).toBe(true)
  expect(parentState.dabOrdinal).toBe(1);expect(childState.dabOrdinal).toBe(1)
  const inline={...parent,behavior:{version:2 as const,dual:{brush:child,blendMode:'multiply' as const}}},state=beginBrushBehavior(start),before=structuredClone(state)
  expect(()=>behaviorStampsForDab(inline,resume,state,color)).toThrow('GIH pressure selection exceeds native int range')
  expect(state).toEqual(before)
})

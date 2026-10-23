import { describe, expect, it } from 'vitest'
import { isBrushBehavior, type BrushDescriptor, type Dab } from '@grafetto/shared'
import { beginBrushBehavior, brushDynamicValue, behaviorStampsForDab, secondaryBrushDabs, splitBrushTail } from './brushBehavior'
import { DIGITAL_BRUSHES } from './digitalBrushPresets'
import { nominalDabSpacing } from '../dabs/dabSpacing'
const color: [
  number,
  number,
  number
] = [0.8, 0.3, 0.1]
const dabs: Dab[] = Array.from({ length: 48 }, (_, i) => ({ x: 20 + i * 4, y: 30 + Math.sin(i / 8) * 20, size: 30, pressure: 0.2 + i / 60, angle: i / 30, aspectRatio: 1, tiltX: 20, tiltY: 10, opacity: 0.6, t: i * 8 }))
const brush: BrushDescriptor = { ...DIGITAL_BRUSHES[0], flowByPressure: [[0, 0.1], [1, 1]], scatter: { count: 16, radius: 0.3, scale: 0.8, sizeJitter: 0.2, angleJitter: 0.2, flowJitter: 0.1 }, behavior: { version: 2, rotation: { follow: 0.4, random: 'stroke', flipX: true, flipY: true }, scatter: { countJitter: 0.4, bothAxes: false, roundnessJitter: 0.3 }, dynamics: { size: { control: 'fade', fade: 30, minimum: 0.1, jitter: 0.2 }, hue: { control: 'pressure', minimum: 0, jitter: 0.3 }, flow: { control: 'speed', minimum: 0.3, jitter: 0.2 } } } }
describe('v2 logical brush state', () => {
  it('produces identical stamps for whole, arbitrary chunks and restored state', () => {
    const full = beginBrushBehavior(dabs[0])
    const expected = dabs.flatMap(d => behaviorStampsForDab(brush, d, full, color))
    let chunk = beginBrushBehavior(dabs[0])
    const actual = []
    for (let i = 0;i < dabs.length;i += 7) {
      actual.push(...dabs.slice(i, i + 7).flatMap(d => behaviorStampsForDab(brush, d, chunk, color)))
      chunk = structuredClone(chunk)
    }
    expect(actual).toEqual(expected)
    expect(chunk).toEqual(full)
  })
  it('validates incoming sensor curves before they reach the renderer', () => {
    const valid={version:2,modulations:{size:[{control:'tiltElevation',minimum:0,jitter:0,curve:[[0,1],[1,0]]}]}}
    expect(isBrushBehavior(valid)).toBe(true)
    for(const curve of [[[0,1],[0,0]],[[0,1],[1,NaN]],[[0,1]],[[0,1],null]]) {
      expect(isBrushBehavior({...valid,modulations:{size:[{...valid.modulations.size[0],curve}]}})).toBe(false)
    }
  })
  it('applies independent sensor curves and preserves them through chunked replay', () => {
    const source: BrushDescriptor={...brush,scatter:undefined,behavior:{version:2,modulations:{size:[{control:'pressure',minimum:0,jitter:0,curve:[[0,1],[1,0]]},{control:'tiltElevation',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]}}}
    const input={...dabs[0],pressure:.25,tiltX:45,tiltY:0}
    expect(behaviorStampsForDab(source,input,beginBrushBehavior(input),color)[0].size).toBeCloseTo(input.size*.75*.5)
    const whole=beginBrushBehavior(dabs[0]),chunk=beginBrushBehavior(dabs[0])
    const expected=dabs.flatMap(d=>behaviorStampsForDab(source,d,whole,color))
    const actual=dabs.flatMap(d=>behaviorStampsForDab(structuredClone(source),d,chunk,color))
    expect(actual).toEqual(expected)
    expect(brushDynamicValue({control:'tiltX',minimum:0,jitter:0}, {...input,tiltX:-90},chunk,0)).toBe(0)
    expect(brushDynamicValue({control:'tiltY',minimum:0,jitter:0}, {...input,tiltY:90},chunk,0)).toBe(1)
  })
  it('controls Bleed independently from flow, opacity and wet colour pickup', () => {
    const base:BrushDescriptor={...brush,scatter:undefined,flowByPressure:[[0,1],[1,1]],behavior:{version:2}}
    const edge:BrushDescriptor={...base,behavior:{version:2,edgeBleed:{pressure:1,tilt:0,pressureCurve:[[0,0],[.5,.25],[1,1]]}}}
    const stamp=(b:BrushDescriptor,p:number)=>{const d={...dabs[0],pressure:p,tiltX:0,tiltY:0};return behaviorStampsForDab(b,d,beginBrushBehavior(d),color)[0]}
    expect(stamp(edge,0)).toEqual(stamp(base,0))
    const high=stamp(edge,1),dry=stamp(base,1)
    expect(high.bleed).toBe(1);expect(stamp(edge,.5).bleed).toBe(.25)
    expect(high.size).toBeCloseTo(dry.size*1.15)
    expect(high.flowScale).toBe(dry.flowScale);expect(high.opacityScale).toBe(dry.opacityScale)
    expect(high.color).toEqual(dry.color)
    expect(isBrushBehavior(edge.behavior)).toBe(true)
    expect(isBrushBehavior({version:2,edgeBleed:{pressure:NaN,tilt:0}})).toBe(false)
    expect(isBrushBehavior({version:2,edgeBleed:{pressure:1,tilt:0,pressureCurve:[[0,0],[0,1]]}})).toBe(false)
  })
  it('uses wet Grade controls for grain contrast without changing charge', () => {
    const d={...dabs[0],pressure:.5}
    const b:BrushDescriptor={...brush,behavior:{version:2,wetMix:{charge:.8,dilution:0,attack:1,pull:0,grade:-.6,blur:0,blurJitter:0,wetnessJitter:0,dynamics:{grade:[{control:'pressure',minimum:0,jitter:0}]}}}}
    const state=beginBrushBehavior(d)
    expect(behaviorStampsForDab(b,d,state,color)[0].wetGrade).toBeCloseTo(-.3)
    expect(state.charge).toBe(1)
  })
  it('uses one random rotation for the gesture, and independent random rotations for stamps', () => {
    const fixed = { ...brush, scatter: undefined, behavior: { version: 2 as const, rotation: { follow: 0, random: 'stroke' as const } } }
    const state = beginBrushBehavior(dabs[0])
    const angles = dabs.map(d => behaviorStampsForDab(fixed, d, state, color)[0].angle)
    expect(new Set(angles).size).toBe(1)
    const random = { ...fixed, behavior: { version: 2 as const, rotation: { follow: 0, random: 'stamp' as const } } }
    const other = beginBrushBehavior(dabs[0])
    expect(new Set(dabs.map(d => behaviorStampsForDab(random, d, other, color)[0].angle)).size).toBeGreaterThan(1)
  })
  it('keeps flow independent from opacity, and handles reversed pressure curves', () => {
    const b = { ...brush, scatter: undefined, flowByPressure: [[0, 1], [1, 0]] as const, behavior: { version: 2 as const } }
    const low = { ...dabs[0], pressure: 0.1 }
    const high = { ...low, pressure: 0.9 }
    expect(behaviorStampsForDab(b, low, beginBrushBehavior(low), color)[0].flowScale).toBeCloseTo(0.9)
    expect(behaviorStampsForDab(b, high, beginBrushBehavior(high), color)[0].flowScale).toBeCloseTo(0.1)
    expect(behaviorStampsForDab(b, high, beginBrushBehavior(high), color)[0].opacityScale).toBe(1)
  })
  it('keeps a bounded reversible tail and commits the same final taper across chunk boundaries', () => {
    const state = beginBrushBehavior(dabs[0])
    const all = dabs.flatMap(d => behaviorStampsForDab(brush, d, state, color)).map(s => ({ ...s, radius: s.size * 0.5, flow: s.flowScale, ceiling: 1, pressure: 1 }))
    const final = splitBrushTail(all, state.distance, 0.2, true)
    let pending: typeof all = [], committed: typeof all = []
    for (let i = 0;i < all.length;i += 11) {
      const part = all.slice(i, i + 11)
      const out = splitBrushTail([...pending, ...part], part.at(-1)!.distance, 0.2, false)
      pending = out.pending
      committed.push(...out.ready)
    }
    committed.push(...splitBrushTail(pending, state.distance, 0.2, true).ready)
    expect(committed).toEqual(final.ready)
    expect(committed.at(-1)!.radius).toBe(0)
    const huge = splitBrushTail(Array.from({ length: 5000 }, () => all[0]), 0, 1, false)
    expect(huge.pending.length).toBe(4096)
  })
  it('bounds ultra-small source spacing to the existing one-pixel dab floor', () => {
    const step = nominalDabSpacing(4096, 0.000001)
    expect(step).toBe(1)
    const length = 1000
    const maximumStamps = Math.ceil(length / step) * 16
    expect(maximumStamps).toBe(16000)
  })
  it('keeps pen azimuth distinct from path direction and combines signed tilt/speed influence', () => {
    const b: BrushDescriptor = { ...brush, scatter: undefined, behavior: {version:2,rotation:{follow:1,random:'none',azimuth:true},modulations:{size:[{control:'tilt',strength:.5,minimum:0,jitter:0},{control:'speed',strength:-.5,minimum:0,jitter:0}]}} }
    const first = {...dabs[0], x:0,y:0,tiltX:0,tiltY:45,angle:0}
    const state = beginBrushBehavior(first)
    const one = behaviorStampsForDab(b, first,state,color)[0]
    expect(one.angle).toBeCloseTo(Math.PI/2)
    expect(one.size).toBeCloseTo(first.size*.75)
    const second = {...first,x:8,t:first.t+8}
    const two = behaviorStampsForDab(b,second,state,color)[0]
    expect(two.angle).toBeCloseTo(Math.PI/2)
    expect(two.size).toBeCloseTo(second.size*.75*.75)
  })

  it('samples a secondary brush with its own spacing across arbitrary packet splits', () => {
    const child={...brush,spacing:.11}
    const full=secondaryBrushDabs(brush,child,dabs,{remaining:0})
    let state={remaining:0} as Parameters<typeof secondaryBrushDabs>[3]
    const chunked=[]
    for(let i=0;i<dabs.length;i+=7){chunked.push(...secondaryBrushDabs(brush,child,dabs.slice(i,i+7),state));state=structuredClone(state)}
    expect(chunked).toEqual(full)
    expect(full.every(d=>d.opacity===1)).toBe(true)
    expect(secondaryBrushDabs(brush,{...child,spacing:.7},dabs,{remaining:0}).length).toBeLessThan(full.length)
  })

})

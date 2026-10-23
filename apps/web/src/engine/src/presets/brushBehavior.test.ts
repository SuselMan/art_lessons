import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { beginBrushBehavior, behaviorStampsForDab, splitBrushTail } from './brushBehavior'
import { DIGITAL_BRUSHES } from './digitalBrushPresets'
import { nominalDabSpacing } from '../dabs/dabSpacing'
const color:[number,number,number]=[0.8,0.3,0.1]
const dabs:Dab[]=Array.from({length:48},(_,i)=>({x:20+i*4,y:30+Math.sin(i/8)*20,size:30,pressure:0.2+i/60,angle:i/30,aspectRatio:1,tiltX:20,tiltY:10,opacity:0.6,t:i*8}))
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],flowByPressure:[[0,0.1],[1,1]],scatter:{count:16,radius:0.3,scale:0.8,sizeJitter:0.2,angleJitter:0.2,flowJitter:0.1},behavior:{version:2,rotation:{follow:0.4,random:'stroke',flipX:true,flipY:true},scatter:{countJitter:0.4,bothAxes:false,roundnessJitter:0.3},dynamics:{size:{control:'fade',fade:30,minimum:0.1,jitter:0.2},hue:{control:'pressure',minimum:0,jitter:0.3},flow:{control:'speed',minimum:0.3,jitter:0.2}}}}
describe('v2 logical brush state',()=>{
 it('produces identical stamps for whole, arbitrary chunks and restored state',()=>{
  const full=beginBrushBehavior(dabs[0]);const expected=dabs.flatMap(d=>behaviorStampsForDab(brush,d,full,color))
  let chunk=beginBrushBehavior(dabs[0]);const actual=[]
  for(let i=0;i<dabs.length;i+=7){actual.push(...dabs.slice(i,i+7).flatMap(d=>behaviorStampsForDab(brush,d,chunk,color)));chunk=structuredClone(chunk)}
  expect(actual).toEqual(expected);expect(chunk).toEqual(full)
 })
 it('uses one random rotation for the gesture, and independent random rotations for stamps',()=>{
  const fixed={...brush,scatter:undefined,behavior:{version:2 as const,rotation:{follow:0,random:'stroke' as const}}}
  const state=beginBrushBehavior(dabs[0]);const angles=dabs.map(d=>behaviorStampsForDab(fixed,d,state,color)[0].angle)
  expect(new Set(angles).size).toBe(1)
  const random={...fixed,behavior:{version:2 as const,rotation:{follow:0,random:'stamp' as const}}}
  const other=beginBrushBehavior(dabs[0]);expect(new Set(dabs.map(d=>behaviorStampsForDab(random,d,other,color)[0].angle)).size).toBeGreaterThan(1)
 })
 it('keeps flow independent from opacity, and handles reversed pressure curves',()=>{
  const b={...brush,scatter:undefined,flowByPressure:[[0,1],[1,0]] as const,behavior:{version:2 as const}}
  const low={...dabs[0],pressure:0.1};const high={...low,pressure:0.9}
  expect(behaviorStampsForDab(b,low,beginBrushBehavior(low),color)[0].flowScale).toBeCloseTo(0.9)
  expect(behaviorStampsForDab(b,high,beginBrushBehavior(high),color)[0].flowScale).toBeCloseTo(0.1)
  expect(behaviorStampsForDab(b,high,beginBrushBehavior(high),color)[0].opacityScale).toBe(1)
 })
 it('keeps a bounded reversible tail and commits the same final taper across chunk boundaries',()=>{
  const state=beginBrushBehavior(dabs[0])
  const all=dabs.flatMap(d=>behaviorStampsForDab(brush,d,state,color)).map(s=>({...s,radius:s.size*0.5,flow:s.flowScale,ceiling:1,pressure:1}))
  const final=splitBrushTail(all,state.distance,0.2,true)
  let pending:typeof all=[],committed:typeof all=[]
  for(let i=0;i<all.length;i+=11){const part=all.slice(i,i+11);const out=splitBrushTail([...pending,...part],part.at(-1)!.distance,0.2,false);pending=out.pending;committed.push(...out.ready)}
  committed.push(...splitBrushTail(pending,state.distance,0.2,true).ready)
  expect(committed).toEqual(final.ready)
  expect(committed.at(-1)!.radius).toBe(0)
  const huge=splitBrushTail(Array.from({length:5000},()=>all[0]),0,1,false)
  expect(huge.pending.length).toBe(4096)
 })
 it('bounds ultra-small source spacing to the existing one-pixel dab floor',()=>{
  const step=nominalDabSpacing(4096,0.000001)
  expect(step).toBe(1)
  const length=1000;const maximumStamps=Math.ceil(length/step)*16
  expect(maximumStamps).toBe(16000)
 })
})

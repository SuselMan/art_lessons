import { describe,expect,it } from 'vitest'
import { packDabs,unpackDabs,type BrushDescriptor,type Dab } from '@grafetto/shared'
import { DabSystem } from './DabSystem'
import { codecDab } from './codecDab'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { PENCIL_DAB_SHAPING } from '../presets/dabShaping'
import { beginBrushBehavior,behaviorStampsForDab,secondaryBrushDabs } from '../presets/brushBehavior'
const profile={version:1 as const,space:'view' as const,maximum:30,estimator:'grafettoEMA30ms' as const}
const brush:BrushDescriptor={...digitalBrushFromPreset('hard-round'),scatter:undefined,behavior:{version:2,speedInput:profile,modulations:{size:[{control:'speed',minimum:0,jitter:0,curve:[[0,1],[1,0]]}]}}}
function system():DabSystem{
 const s=new DabSystem({spacingFactor:.1,shaping:{...PENCIL_DAB_SHAPING,size:()=>1,aspect:()=>1,pressureSmoothingPx:undefined,tiltSmoothingPx:undefined}})
 s.autoSpacing={mode:'diameter',coefficient:.1,sizeMultiplier:1,brush};return s
}
function line(speed:number):Dab[]{
 const s=system();const out=s.startStroke(0,20,1,0,0,40,100,speed)
 for(let i=1;i<=10;i++)out.push(...s.continueStroke(i*10,20,1,0,0,40,100,speed))
 out.push(...s.endStroke(40,100));return out.map(d=>codecDab({...d,t:0}))
}
describe('one speed sensor across geometry and painting',()=>{
 it('keeps zero/nonzero sensors over many same-time dabs, and spacing uses that same value',()=>{
  const stopped=line(0),moving=line(.5)
  expect(stopped.length).toBeGreaterThan(20)
  expect(stopped.every(d=>d.normalizedSpeed===0)).toBe(true)
  expect(moving.every(d=>d.normalizedSpeed===.5)).toBe(true)
  // Inverse speed size curve gives half the footprint and half source gap.
  expect(stopped[1].x-stopped[0].x).toBeCloseTo(4)
  expect(moving[1].x-moving[0].x).toBeCloseTo(2)
  for(const dabs of [stopped,moving]){
   const state=beginBrushBehavior(dabs[0]);const sizes=dabs.map(d=>behaviorStampsForDab(brush,d,state,[1,0,0])[0].size)
   expect(sizes.every(size=>Math.abs(size-(dabs===stopped?40:20))<.0001)).toBe(true)
  }
 })
 it('matches whole and packed chunk replay without re-deriving speed from geometry/time',()=>{
  const input=line(.3),state=beginBrushBehavior(input[0])
  const expected=input.flatMap(d=>behaviorStampsForDab(brush,d,state,[1,0,0]))
  let replay=beginBrushBehavior(input[0]);const actual=[]
  for(let i=0;i<input.length;i+=7){
   const decoded=unpackDabs(packDabs(input.slice(i,i+7)))
   actual.push(...decoded.flatMap(d=>behaviorStampsForDab(brush,d,replay,[1,0,0])));replay=structuredClone(replay)
  }
  expect(actual).toEqual(expected)
 })
 it('preserves speed in preview forks, final endpoint and independently spaced children',()=>{
  const s=system();s.startStroke(0,20,1,0,0,40,100,.2)
  s.continueStroke(30,20,1,0,0,40,100,.2)
  const preview=s.forkForPreview().continueStroke(60,20,1,0,0,40,100,.8)
  expect(preview.every(d=>d.normalizedSpeed!==undefined)).toBe(true)
  expect(s.peekEndSample(40)!.normalizedSpeed).toBe(Math.fround(.2))
  const parent=line(.4),child={...brush,spacing:.07,behavior:{...brush.behavior!,spacing:{mode:'diameter' as const,coefficient:.07}}}
  const secondary=secondaryBrushDabs(brush,child,parent,{remaining:0})
  expect(secondary.length).toBeGreaterThan(10)
  expect(secondary.every(d=>d.normalizedSpeed===Math.fround(.4))).toBe(true)
 })
})

import {describe,expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {DIGITAL_BRUSHES} from './digitalBrushPresets'
import {beginBrushBehavior,behaviorStampsForDab} from './brushBehavior'
const dab=(x=30,y=40):Dab=>({x,y,size:20,pressure:1,angle:.7,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:10})
type Placement=NonNullable<NonNullable<BrushDescriptor['behavior']>['scatter']>['placement']
function brush(placement?:Placement):BrushDescriptor{return {...DIGITAL_BRUSHES[0],scatter:{count:40,radius:.4,scale:.3,sizeJitter:.8,angleJitter:.5,flowJitter:.4},behavior:{version:2,scatter:{bothAxes:false,countJitter:0,...(placement?{placement}:{})}}}}
function stamps(b:BrushDescriptor,current:Dab,previous?:Dab){const state=beginBrushBehavior(previous??current);if(previous)state.previous=previous;return behaviorStampsForDab(b,current,state,[1,0,0])}
describe('explicit uniform scatter placement',()=>{
 it('uses actual path direction for X and its normal for Y independently of tip angle',()=>{
  const horizontal=dab(50,40),vertical=dab(30,60),previous=dab()
  for(const stamp of stamps(brush('pathUniform'),horizontal,previous)){expect(stamp.y).toBe(horizontal.y);expect(Math.abs(stamp.x-horizontal.x)).toBeLessThanOrEqual(8)}
  for(const stamp of stamps(brush('pathUniform'),vertical,previous))expect(stamp.x).toBeCloseTo(vertical.x,12)
  for(const stamp of stamps(brush('normalUniform'),horizontal,previous))expect(stamp.x).toBeCloseTo(horizontal.x,12)
  const b=brush('pathUniform'),rotated={...b,tip:{...b.tip,angle:2.1},behavior:{...b.behavior!,rotation:{follow:0,random:'none' as const}}}
  expect(stamps(rotated,horizontal,previous).map(s=>[s.x,s.y])).toEqual(stamps(b,horizontal,previous).map(s=>[s.x,s.y]))
 })
 it('uses a full world-axis square, including points outside the same-radius disc',()=>{
  const current=dab(),output=stamps(brush('xyUniform'),current)
  expect(output.some(s=>Math.hypot(s.x-current.x,s.y-current.y)>8)).toBe(true)
  output.forEach(s=>{expect(Math.abs(s.x-current.x)).toBeLessThanOrEqual(8);expect(Math.abs(s.y-current.y)).toBeLessThanOrEqual(8)})
 })
 it('scales the extent by configured size dynamics before scatter scale and size jitter',()=>{
  const b=brush('pathUniform'),current=dab(),previous=dab(10,40)
  b.behavior!.dynamics={size:{control:'off',minimum:0,jitter:0,curve:[[0,.5],[1,.5]]}}
  const output=stamps(b,current,previous)
  output.forEach(s=>expect(Math.abs(s.x-current.x)).toBeLessThanOrEqual(4))
  expect(output.some(s=>Math.abs(s.x-current.x)>3)).toBe(true)
 })
 it('keeps hash streams, animation and state stable across recorded chunks/replay',()=>{
  const b=brush('xyUniform'),dabs=Array.from({length:20},(_,i)=>({...dab(30+i*5,40+i),t:i*8})),color:[number,number,number]=[1,0,0]
  const frame=`asset:${'1'.repeat(64)}` as const;b.tip={...b.tip,mask:frame,animation:{mode:'random',frames:[frame,`asset:${'2'.repeat(64)}`]}}
  const state=beginBrushBehavior(dabs[0]),full=dabs.flatMap(d=>behaviorStampsForDab(b,d,state,color))
  let replay=beginBrushBehavior(dabs[0]);const chunked:typeof full=[]
  for(let i=0;i<dabs.length;i+=3){chunked.push(...dabs.slice(i,i+3).flatMap(d=>behaviorStampsForDab(b,d,replay,color)));replay=structuredClone(replay)}
  expect(chunked).toEqual(full);expect(replay).toEqual(state)
  const legacy={...b,behavior:{...b.behavior!,scatter:{bothAxes:false,countJitter:0}}}
  const oldState=beginBrushBehavior(dabs[0]),old=dabs.flatMap(d=>behaviorStampsForDab(legacy,d,oldState,color))
  expect(full.map(({x: _x,y: _y,...rest})=>rest)).toEqual(old.map(({x: _x,y: _y,...rest})=>rest))
 })
 it('keeps the historical absent-placement projection bit-for-bit unchanged',()=>{
  const b=brush();b.scatter={...b.scatter!,count:3,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0}
  expect(stamps(b,dab()).map(s=>[s.x,s.y,s.size,s.angle,s.flowScale])).toEqual([[29.45317973262556,40.64920789608163,20,.7,1],[31.700799759517437,37.9807393774299,20,.7,1],[29.58100104849504,40.497453082843904,20,.7,1]])
 })
})

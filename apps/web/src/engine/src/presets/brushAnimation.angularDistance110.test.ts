import{describe,it,expect}from'vitest'
import type{BrushDescriptor,BrushDynamic,Dab}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab,brushDynamicValue}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
const id=`asset:${'a'.repeat(64)}`as const
const sensor:BrushDynamic={control:'distance',period:10,periodic:false,minimum:0,jitter:0}
function brush():BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),version:110,tip:{kind:'bitmap',mask:id,animation:{mode:'angular',rank:8,cursorPolicy:'first-request-v1',frames:[id]},hardness:1,aspect:1,angle:0,rotation:'fixed'},scatter:undefined,flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},modulations:{opacity:[sensor]},taper:{start:.1,end:0,size:0,opacity:1,pressure:false},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const input=(x:number,y:number,size=10):Dab=>({x,y,size,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,sourceAngle:0,opacity:1,t:0})
const points=[input(0,0),input(.25,0,20),input(.25,.25),input(0,.25,20),input(0,0),input(0,.5)]
describe('angular110 rejected attempts retain distance history',()=>{
 it('counts a curved/backtracking polyline, fade and taper before next accepted geometry',()=>{
  const b=brush(),state=beginBrushBehavior(points[0]);behaviorStampsForDab(b,points[0],state,[0,0,0]);const previous=structuredClone(state.previous)
  for(const d of points.slice(1,-1))expect(behaviorStampsForDab(b,d,state,[0,0,0])).toEqual([])
  expect(state.previous).toEqual(previous);expect(state.worldDistance).toBe(1)
  expect(state.distance).toBeCloseTo(1/15,14)
  expect(brushDynamicValue(sensor,points[4],state,0)).toBe(.1)
  const stamps=behaviorStampsForDab(b,points[5],state,[0,0,0]);expect(stamps).toHaveLength(1)
  expect(state.worldDistance).toBe(1.5);expect(state.distance).toBeCloseTo(7/60,14)
  expect(brushDynamicValue(sensor,points[5],state,0)).toBe(.15)
  expect(brushDynamicValue({control:'fade',fade:1,minimum:0,jitter:0},points[5],state,0)).toBeCloseTo(53/60,14)
  expect(stamps[0].distance).toBeCloseTo(7/60,14)
  expect(stamps[0].opacityScale).toBeCloseTo(.15*7/60,14)
  expect(state.dabOrdinal).toBe(6);expect(state.dabSequence).toBe(6)
 })
 it('keeps complete vs cloned chunks identical, and does not allocate world state for unused distance',()=>{
  const run=(split:boolean)=>{const b=brush();let state=beginBrushBehavior(points[0]);const out=[];for(let i=0;i<points.length;i++){if(split&&i===3)state=structuredClone(state);out.push(...behaviorStampsForDab(b,points[i],state,[0,0,0]))}return{state,out}}
  expect(run(true)).toEqual(run(false))
  const b=brush();delete b.behavior!.modulations;const state=beginBrushBehavior(points[0]);for(const d of points)behaviorStampsForDab(b,d,state,[0,0,0]);expect(state.worldDistance).toBeUndefined();expect(state.worldDistancePoint).toBeUndefined();expect(state.distance).toBeCloseTo(7/60,14)
 })
})

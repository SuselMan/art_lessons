import {expect,it} from 'vitest'
import type {BrushDynamic,Dab} from '@grafetto/shared'
import {brushDynamicValue,beginBrushBehavior,behaviorStampsForDab,brushSourceSpacingAxes} from './brushBehavior'
import {brushExecutionContext} from './brushExecutionContext'
import {digitalBrushFromPreset} from './digitalBrushPresets'
import {sourceTimeRandomValue} from './sourceTimeRandom'
import {DabSystem} from '../dabs/DabSystem'
const source=Object.freeze({kind:'grafettoSourceTime-v1',key:'primary/Size/fuzzy/0'}as const)
const dynamic:BrushDynamic={control:'random',minimum:0,jitter:0,randomSource:source}
const execution=brushExecutionContext({version:1,sequentialSeed:17,strokeSeed:42})
const input=(time:number):Dab=>({x:20,y:20,size:20,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:time,sourceTime:time})
it('overrides caller rand0/1 centrally for opted-in controls including jitter, preserving old random unchanged',()=>{
 const dab=input(1.25),state=beginBrushBehavior(dab,execution),r=sourceTimeRandomValue(source,42,dab.sourceTime)
 expect(brushDynamicValue(dynamic,dab,state,0)).toBe(r);expect(brushDynamicValue(dynamic,dab,state,1)).toBe(r)
 expect(brushDynamicValue({...dynamic,jitter:.5},dab,state,0)).toBe(r*(1-.5*r))
 expect(brushDynamicValue({control:'random',minimum:0,jitter:0},dab,state,.25)).toBe(.25)
 expect(()=>brushDynamicValue(dynamic,{...dab,sourceTime:undefined},state,0)).toThrow('recorded')
 expect(()=>brushDynamicValue(dynamic,dab,beginBrushBehavior(dab),0)).toThrow('seed')
})
it('changes stationary Size and spacing through actual geometry consumers and replays F64 times identically',()=>{
 const brush={...digitalBrushFromPreset('hard-round'),version:81,behavior:{version:2 as const,dynamics:{size:{...dynamic,minimum:.2}}}}
 const sizes:number[]=[],steps:number[]=[]
 for(const t of [0,1,2,50.125]){
  const dab=input(t),state=beginBrushBehavior(dab,execution),replay=structuredClone(state)
  const stamps=behaviorStampsForDab(brush,dab,state,[1,0,0]),copy=behaviorStampsForDab(brush,structuredClone(dab),replay,[1,0,0])
  expect(copy).toEqual(stamps);sizes.push(stamps[0].size)
  steps.push(brushSourceSpacingAxes(brush,dab,beginBrushBehavior(dab,execution),{mode:'diameter',coefficient:1,isotropic:true},1,0).x)
 }
 expect(new Set(sizes).size).toBe(4);expect(new Set(steps).size).toBe(4)
})
it('refreshes stationary random Rate without emitting a dab or recording an event history and clones exact continuation',()=>{
 const rateSource=Object.freeze({kind:'grafettoSourceTime-v1',key:'primary/Rate/fuzzy/0'}as const),d=new DabSystem()
 d.captureSourceTime=true;d.brushExecution=execution;d.timing={version:1,rate:1,ignoreDistanceSpacing:true,rateDynamics:[{...dynamic,minimum:.5,randomSource:rateSource}]}
 d.startStroke(20,20,1,0,0,20)
 const first=d['_timingInterval'];expect(first).toBe(1000/(.5+.5*sourceTimeRandomValue(rateSource,42,0)))
 expect(d.continueStroke(20,20,1,0,0,20,0,0,50)).toEqual([])
 expect(d['_timingInterval']).toBe(1000/(.5+.5*sourceTimeRandomValue(rateSource,42,50)));expect(d['_timingInterval']).not.toBe(first)
 const fork=d.forkForPreview(),original=d.continueStroke(20,20,1,0,0,20,0,0,5000),replay=fork.continueStroke(20,20,1,0,0,20,0,0,5000)
 expect(replay).toEqual(original);expect(original.length).toBeGreaterThan(0);expect(original.every(v=>v.sourceTime!==undefined)).toBe(true)
})

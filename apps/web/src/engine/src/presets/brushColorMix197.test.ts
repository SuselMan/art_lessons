import {expect,it} from 'vitest'
import {digitalBrushFromPreset} from './digitalBrushPresets'
import {beginBrushBehavior,behaviorStampsForDab} from './brushBehavior'
import {assertBrushExecutionContext,brushExecutionContext} from './brushExecutionContext'
import type {Dab} from '@grafetto/shared'
const input:Dab={x:10,y:10,size:20,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
it('mixes per-dab pressure with the author-captured opaque background',()=>{
 const brush=structuredClone(digitalBrushFromPreset('hard-round'));brush.version=197;brush.behavior={version:2,colorMix:{version:1,value:1,pressure:[[0,0],[1,1]]}}
 const source={version:1 as const,background:[0,0,255,255] as [number,number,number,number]};const context=brushExecutionContext(undefined,source)
 expect(()=>assertBrushExecutionContext(brush)).toThrow('captured opaque background')
 expect(()=>assertBrushExecutionContext(brush,brushExecutionContext(undefined,{version:1,background:[0,0,255,128]}))).toThrow('captured opaque background')
 expect(()=>assertBrushExecutionContext(brush,context)).not.toThrow()
 const state=beginBrushBehavior(input,context);source.background[2]=0
 const paint=(pressure:number)=>behaviorStampsForDab(brush,{...input,pressure},state,[1,0,0])[0].color
 expect(paint(0)).toEqual([0,0,1]);expect(paint(1)).toEqual([1,0,0]);const mid=paint(.5);expect(mid[0]).toBeCloseTo(128/255);expect(mid[2]).toBeCloseTo(127/255)
})

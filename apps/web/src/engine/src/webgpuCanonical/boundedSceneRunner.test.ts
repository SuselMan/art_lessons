import { expect,it,vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
const trace=vi.hoisted(()=>({events:[] as string[],commands:[] as any[]}))
vi.mock('./settlePlanAdapter',()=>({CanonicalPlanAdapter:class {
 uploads={};runQuantum(task:any){trace.events.push('quantum');return task({encoder:{}})}retain(){}fieldOp(){trace.events.push('sourceField')}
}}))
vi.mock('../raster/CanonicalWatercolorSettlePlan',()=>({CanonicalWatercolorSettlePlan:class{
 prepare(_scratch:any,_targets:any,bounds:any){return{ops:[()=>trace.events.push('settleOp')],finish:()=>trace.events.push('settleFinish'),dispose:()=>trace.events.push('dispose'),compositeDomain:bounds}}
}}))
vi.mock('./finishTile',()=>({CanonicalSingleTileFinish:class{encode(){trace.events.push('composite');return[]}encodeLive(){trace.events.push('live');return[]}}}))
import { CanonicalBoundedSceneRunner } from './boundedSceneRunner'
import type { PointerData } from '../input/PointerInput'
import type { WatercolorGestureSettings } from '../input/CanonicalWatercolorGesture'
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
function fixture(){
 const backend={paper:{texSize:[1024,1024]},device:{queue:{onSubmittedWorkDone:()=>Promise.resolve()}},createField:(label:string,width:number,height:number)=>({label,width,height,texture:{},view:{},format:'rgba8unorm'}),clearField:()=>{},copyField:()=>{},destroyField:()=>{},encodePreparedStamp:(_encoder:any,stamp:any,phase:any)=>{trace.commands.push({stamp,phase});return[]},encodePreparedRibbon:(_encoder:any,batch:any,phase:any)=>{trace.commands.push({batch,phase});return[]}} as any
 const operations:Operation[]=[],runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions:options,now:()=>1000,timestamp:()=>100,operationId:()=>`op${operations.length}`,onLocalOperation:op=>operations.push(op)})
 const settings:WatercolorGestureSettings={tool:'watercolor',preset:'normal:100:0:PB29:round',size:100,opacity:1,color:[.3,.4,.5],nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}
 const pointer=(x:number,t:number):PointerData=>({x,y:500,pressure:.8,tiltX:0,tiltY:0,speed:.2,timeStamp:t,pointerType:'pen'})
 return{runner,settings,pointer,operations}
}
it('real CPU gesture records dry then prewet stroke; serial settle and drain guard; same scratch survives',async()=>{
 trace.events=[];trace.commands=[];const {runner,settings,pointer,operations}=fixture(),scratch=runner.scratch
 runner.begin(pointer(440,0),settings,{strokeId:'water',washId:'wash',layerId:'L',userId:'u'});runner.move(pointer(560,50));runner.end(pointer(560,60))
 expect(operations.at(-1)).not.toHaveProperty('wet');expect(runner.isIdle).toBe(false)
 expect(()=>runner.begin(pointer(450,80),settings,{strokeId:'p',layerId:'L',userId:'u'})).toThrow('busy')
 await runner.drain();runner.begin(pointer(450,80),{...settings,preset:'normal:100:100:PB29:round'},{strokeId:'pigment',washId:'wash',layerId:'L',userId:'u'});runner.move(pointer(550,100));runner.end(pointer(550,110));await runner.drain()
 const op=operations.at(-1);expect(op?.type).toBe('stroke');expect(op).toHaveProperty('wet');expect((op as any).wet).toMatch(/[1-9a-f]/)
 expect(runner.scratch).toBe(scratch);expect(trace.events.indexOf('settleFinish')).toBeLessThan(trace.events.indexOf('composite'))
 expect(trace.commands.length).toBeGreaterThan(0);await runner.clear();expect(runner.scratch).not.toBe(scratch);expect(runner.isIdle).toBe(true);runner.destroy()
})
it('outside bounded tile and nonwatercolor replay are explicit unsupported scopes',()=>{
 const {runner,settings,pointer}=fixture();expect(()=>runner.begin(pointer(-1,0),settings,{strokeId:'s',layerId:'L',userId:'u'})).toThrow('outside')
 expect(()=>runner.replay({tool:'pencil'} as any)).toThrow('only watercolor');runner.destroy()
})
it('recorded float32 operation replay generates identical source commands to pointer batches',async()=>{
 trace.events=[];trace.commands=[];const {runner,settings,pointer,operations}=fixture()
 runner.begin(pointer(440,0),{...settings,preset:'normal:100:100:PB29:chisel'},{strokeId:'same-seed',washId:'wash',layerId:'L',userId:'u'});runner.move(pointer(500,40));runner.move(pointer(560,70));runner.end(pointer(560,80));await runner.drain()
 const original=structuredClone(trace.commands),operation=operations.at(-1)!
 expect(operation.type).toBe('stroke');await runner.clear();trace.commands=[]
 runner.replay(operation as any);await runner.drain();expect(trace.commands).toEqual(original);runner.destroy()
})

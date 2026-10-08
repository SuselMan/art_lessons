import { expect,it,vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
const trace=vi.hoisted(()=>({events:[] as string[],commands:[] as any[],liveProfiles:[] as any[],opCount:1}))
vi.mock('./settlePlanAdapter',()=>({CanonicalPlanAdapter:class {
 disposeCarryOracle(){trace.events.push('disposeCarryOracle')}
 uploads={};runQuantum(task:any){trace.events.push('quantum');return task({encoder:{}})}retain(){}fieldOp(){trace.events.push('sourceField')}
}}))
vi.mock('../raster/CanonicalWatercolorSettlePlan',()=>({CanonicalWatercolorSettlePlan:class{
 destroyTextures(){trace.events.push('destroyTextures')}
 prepare(_scratch:any,_targets:any,bounds:any){return{ops:Array.from({length:trace.opCount},()=>()=>trace.events.push('settleOp')),finish:()=>trace.events.push('settleFinish'),dispose:()=>trace.events.push('dispose'),compositeDomain:bounds}}
}}))
vi.mock('./finishTile',()=>({CanonicalSingleTileFinish:class{encode(){trace.events.push('composite');return[]}encodeLive(_encoder:any,input:any){trace.events.push('live');trace.liveProfiles.push(input.profile);return[]}}}))
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import { CanonicalBoundedSceneRunner } from './boundedSceneRunner'
import type { PointerData } from '../input/PointerInput'
import type { WatercolorGestureSettings } from '../input/CanonicalWatercolorGesture'
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
function fixture(groupedSettleSubmission=false,progressiveSettle=false,yieldSettleFrame=()=>Promise.resolve(),diagnosticSourceLiveSubmission=false){
 const backend={paper:{texSize:[1024,1024]},device:{queue:{onSubmittedWorkDone:()=>Promise.resolve()}},createField:(label:string,width:number,height:number)=>({label,width,height,texture:{},view:{},format:'rgba8unorm'}),clearField:()=>{},copyField:()=>{},destroyField:()=>{},encodePreparedStamp:(_encoder:any,stamp:any,phase:any)=>{trace.commands.push({stamp,phase});return[]},encodePreparedRibbon:(_encoder:any,batch:any,phase:any)=>{trace.commands.push({batch,phase});return[]}} as any
 const operations:Operation[]=[],runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions:options,diagnosticSourceLiveSubmission,groupedSettleSubmission,progressiveSettle,yieldSettleFrame,now:()=>1000,timestamp:()=>100,operationId:()=>`op${operations.length}`,onLocalOperation:op=>operations.push(op)})
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

it('anchors the source and live profile to gesture landing while later chunks enter water',async()=>{
 trace.events=[];trace.commands=[];trace.liveProfiles=[]
 const {runner,settings,pointer}=fixture(),preset='normal:10:100:PB29:round'
 const sampling=vi.spyOn(runner.paperWet,'sampleUnderNib').mockReturnValue(0)
 runner.begin(pointer(440,0),{...settings,preset},{strokeId:'dry-to-wet',washId:'wash',layerId:'L',userId:'u'})
 sampling.mockReturnValue(1)
 runner.move(pointer(500,40));runner.move(pointer(560,70));runner.end(pointer(560,80));await runner.drain()
 expect(trace.liveProfiles.length).toBeGreaterThan(1)
 expect(ribbonProfileFor('watercolor',preset,0)).not.toEqual(ribbonProfileFor('watercolor',preset,1))
 for(const profile of trace.liveProfiles)expect(profile).toEqual(ribbonProfileFor('watercolor',preset,0))
 expect(runner.scratch.finishContext?.wetPeak).toBeGreaterThan(0)
 runner.destroy();expect(trace.events.at(-1)).toBe('destroyTextures')
})

it('diagnostic grouping changes only settle scopes in a real CPU gesture',async()=>{
 const run=async(grouped:boolean)=>{
  trace.events=[];trace.commands=[]
  const {runner,settings,pointer}=fixture(grouped)
  runner.begin(pointer(440,0),settings,{strokeId:'grouped-seed',washId:'wash',layerId:'L',userId:'u'})
  runner.move(pointer(500,40));runner.end(pointer(500,50));await runner.drain()
  const result={events:[...trace.events],commands:structuredClone(trace.commands)};runner.destroy();return result
 }
 const serial=await run(false),grouped=await run(true)
 expect(grouped.commands).toEqual(serial.commands)
 expect(grouped.events.filter(e=>e!=='quantum')).toEqual(serial.events.filter(e=>e!=='quantum'))
 expect(serial.events.filter(e=>e==='quantum').length-grouped.events.filter(e=>e==='quantum').length).toBe(2)
})

it('progressive settle blocks begin and waits for yielded job before drain/replay',async()=>{
 trace.events=[];let release!:()=>void
 const frame=new Promise<void>(resolve=>{release=resolve})
 const {runner,settings,pointer}=fixture(false,true,()=>frame)
 runner.begin(pointer(440,0),settings,{strokeId:'progressive',layerId:'L',userId:'u'});runner.end(pointer(450,40))
 expect(trace.events).toContain('settleOp');expect(trace.events).not.toContain('settleFinish')
 expect(()=>runner.begin(pointer(440,60),settings,{strokeId:'second',layerId:'L',userId:'u'})).toThrow('busy')
 let drained=false;const waiting=runner.drain().then(()=>{drained=true});await Promise.resolve();expect(drained).toBe(false)
 release();await waiting;expect(trace.events).toContain('settleFinish');expect(trace.events).toContain('dispose');expect(runner.isIdle).toBe(true);runner.destroy()
})
it('rejects simultaneous grouped and progressive modes before allocating resources',()=>{
 expect(()=>fixture(true,true)).toThrow('incompatible')
})
it('retirement interrupts a never-resolving progressive frame, disposes once and skips finish',async()=>{
 trace.events=[];const {runner,settings,pointer}=fixture(false,true,()=>new Promise<void>(()=>{}))
 runner.begin(pointer(440,0),settings,{strokeId:'cancel-pending',layerId:'L',userId:'u'});runner.end(pointer(450,40))
 expect(()=>runner.destroy()).toThrow('Drain')
 const first=runner.retire(),second=runner.retire();expect(second).toBe(first);await first
 expect(trace.events.filter(e=>e==='dispose')).toHaveLength(1)
 expect(trace.events).not.toContain('settleFinish');expect(trace.events).not.toContain('composite')
 expect(()=>runner.begin(pointer(440,90),settings,{strokeId:'late',layerId:'L',userId:'u'})).toThrow('retired')
 expect(()=>runner.replay({tool:'watercolor'} as any)).toThrow('retired')
 runner.destroy();expect(trace.events.filter(e=>e==='disposeCarryOracle')).toHaveLength(1);expect(trace.events.filter(e=>e==='destroyTextures')).toHaveLength(1)
})
it('active owner retirement creates no synthetic pen-up or recorded operation',async()=>{
 trace.events=[];const {runner,settings,pointer,operations}=fixture()
 runner.begin(pointer(440,0),settings,{strokeId:'cancel-active',layerId:'L',userId:'u'})
 expect(()=>runner.end(pointer(-1,40))).toThrow('outside')
 expect(()=>runner.destroy()).toThrow('Drain');const before=operations.length
 await runner.retire();expect(operations).toHaveLength(before)
 expect(()=>runner.end(pointer(450,40))).toThrow('retired');expect(()=>runner.move(pointer(450,20))).toThrow('retired')
 expect(trace.events).not.toContain('settleFinish');runner.destroy()
})

it('diagnostic source/live grouping preserves ordered commands and live profiles with one fewer scope per chunk',async()=>{
 const record=async(grouped:boolean)=>{
  trace.events=[];trace.commands=[];trace.liveProfiles=[]
  const {runner,settings,pointer,operations}=fixture(false,false,()=>Promise.resolve(),grouped)
  runner.begin(pointer(440,0),{...settings,preset:'normal:100:100:PB29:chisel'},{strokeId:'fixed',washId:'wash',layerId:'L',userId:'u'})
  runner.move(pointer(500,40));runner.move(pointer(560,70));runner.end(pointer(560,80));await runner.drain()
  const result={commands:structuredClone(trace.commands),profiles:structuredClone(trace.liveProfiles),operations:structuredClone(operations),events:[...trace.events]}
  runner.destroy();return result
 }
 const off=await record(false),on=await record(true)
 expect(on.commands).toEqual(off.commands);expect(on.profiles).toEqual(off.profiles);expect(on.operations).toEqual(off.operations)
 expect(on.events.filter(x=>x!=='quantum')).toEqual(off.events.filter(x=>x!=='quantum'))
 expect(off.events.filter(x=>x==='quantum').length-on.events.filter(x=>x==='quantum').length).toBe(off.profiles.length)
 expect(off.profiles.length).toBeGreaterThan(1)
})

it('bounded progressive turns preserve original ops/source/final order and reduce yields',async()=>{
 const run=async(bounded:boolean)=>{
  trace.events=[];trace.commands=[];trace.opCount=7;let yields=0
  const {runner,settings,pointer}=fixture(false,true,()=>{yields++;return Promise.resolve()})
  if(bounded)runner.setDiagnosticProgressiveQuantum({maxOps:3,cpuBudgetMs:12})
  runner.begin(pointer(440,0),settings,{strokeId:'bounded',layerId:'L',userId:'u'});runner.end(pointer(450,40))
  expect(()=>runner.begin(pointer(460,50),settings,{strokeId:'blocked',layerId:'L',userId:'u'})).toThrow('busy')
  await runner.drain();const result={events:trace.events.filter(e=>e!=='quantum'),commands:structuredClone(trace.commands),yields,metrics:{...runner.progressiveMetrics}};runner.destroy();trace.opCount=1;return result
 }
 const off=await run(false),on=await run(true);expect(on.commands).toEqual(off.commands);expect(on.events).toEqual(off.events);expect(off.yields).toBe(7);expect(on.yields).toBe(3);expect(on.metrics.maxOpsInTurn).toBe(3)
})
it('bounded retirement cancels subsequent ops and disposes once without finish',async()=>{
 trace.events=[];trace.opCount=7
 const {runner,settings,pointer}=fixture(false,true,()=>new Promise<void>(()=>{}));runner.setDiagnosticProgressiveQuantum({maxOps:3,cpuBudgetMs:12})
 runner.begin(pointer(440,0),settings,{strokeId:'retire-bounded',layerId:'L',userId:'u'});runner.end(pointer(450,40))
 expect(trace.events.filter(e=>e==='settleOp')).toHaveLength(3);await runner.retire();expect(trace.events.filter(e=>e==='dispose')).toHaveLength(1);expect(trace.events).not.toContain('settleFinish');runner.destroy();trace.opCount=1
})
it('bounded diagnostics reject unsupported budgets and serial mode',()=>{
 const {runner}=fixture(false,true);expect(()=>runner.setDiagnosticProgressiveQuantum({maxOps:17,cpuBudgetMs:4})).toThrow('maxOps');expect(()=>runner.setDiagnosticProgressiveQuantum({maxOps:8,cpuBudgetMs:0})).toThrow('CPUbudget');runner.destroy()
 const serial=fixture().runner;expect(()=>serial.setDiagnosticProgressiveQuantum({maxOps:8,cpuBudgetMs:4})).toThrow('progressive mode');serial.destroy()

})

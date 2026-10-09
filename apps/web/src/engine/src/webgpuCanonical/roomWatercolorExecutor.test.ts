import {describe,it,expect,vi} from 'vitest'
import {CanonicalRoomWatercolorExecutor,assertRoomNativeChunkIdentity,installRoomCarryPressureControl} from './roomWatercolorExecutor'
import type {CanonicalPlanAdapter} from './settlePlanAdapter'
describe('one native renderer identity across real engine routes',()=>{
 it('admits existing live, append and rebuild provenance through the same contract',()=>{
  for(const path of ['live','append','rebuild'] as const)expect(()=>assertRoomNativeChunkIdentity({path,layerId:'layer-a',generation:3,strokeId:'packed-source',ordinal:0},'layer-a',3)).not.toThrow()
 })
 it('rejects stale material generation and another layer before a native source write',()=>{
  const op={path:'append' as const,layerId:'layer-a',generation:3,strokeId:'packed-source',ordinal:0}
  expect(()=>assertRoomNativeChunkIdentity(op,'layer-a',4)).toThrow()
  expect(()=>assertRoomNativeChunkIdentity(op,'layer-b',3)).toThrow()
  expect(()=>assertRoomNativeChunkIdentity({...op,ordinal:-1},'layer-a',3)).toThrow()
 })
})

it('pressure QA leaves OFF identity and restores sampling after a failed carry',()=>{
 const submitted=vi.fn()
 const source={diagnosticHardwareLinearInputs:false,diagnosticPairedCarry:false,fieldOp:submitted}
 const adapter=source as unknown as CanonicalPlanAdapter
 const original=adapter.fieldOp
 installRoomCarryPressureControl(adapter,false)
 expect(adapter.fieldOp).toBe(original)
 const counters=installRoomCarryPressureControl(adapter,true)
 const nearest={field:{filter:'nearest'}},linear={field:{filter:'linear'}}
 const invoke=(mode:number,d=linear)=>Reflect.apply(adapter.fieldOp,adapter,[nearest,nearest,nearest,mode,0,{d}])
 invoke(6)
 expect(source.diagnosticHardwareLinearInputs).toBe(false)
 submitted.mockImplementation(()=>{expect(source.diagnosticHardwareLinearInputs).toBe(true);throw Error('carry failed')})
 expect(()=>invoke(15)).toThrow('carry failed')
 expect(source.diagnosticHardwareLinearInputs).toBe(false)
 expect(counters).toEqual({mode15:1,mode16:0,other:1})
 expect(()=>invoke(15,nearest)).toThrow('ONLY LINEAR')
 expect(counters.mode15).toBe(1)
})

it('retirement releases owner-local resources even when shared GPU completion rejects',async()=>{
 const destroyed=vi.fn(),cancel=vi.fn(async()=>{}),gpuLost=new Error('GPU completion lost')
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 Object.assign(owner,{retired:false,retirement:null,central:{cancel},backend:{whenIdle:async()=>{throw gpuLost}},foreignAux:new Map(),adapter:{retireStaticFrontCache:()=>{},disposeCarryOracle:destroyed},planner:{destroyTextures:destroyed},scratch:{tiles:{destroy:destroyed}},target:{buffer:{destroy:destroyed}},fields:{destroy:destroyed},pool:{destroy:destroyed},bridge:{destroy:destroyed}})
 await expect(owner.retire('context-loss',false)).rejects.toBe(gpuLost)
 expect(cancel).not.toHaveBeenCalled();expect(destroyed).toHaveBeenCalledTimes(7)
})

it('DEV actual unsupported carrier publishes the unchanged source without transport or film rebase',async()=>{
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 const p=new Uint8Array([0,0,10,100]),c=new Uint8Array([11,0,0,10]),transport=vi.fn(()=>{throw Error('unsupported transport called')}),published=vi.fn(async()=>{}),reports:unknown[]=[]
 Object.assign(owner,{retired:false,pendingMoment:{chunk:{ordinal:3,segment:{rect:[0,0,1,1]},momentRecipe:{}}},target:{buffer:{height:1,width:1}},scratch:{tiles:{peek:()=>({inkLoad:{readBytes:async()=>p},inkColor:{readBytes:async()=>c},coverage:{}})}},momentSeam:{encodeAfterLanding:transport},momentReport:reports,publishWithoutDrain:published})
 const originalP=p.slice(),originalC=c.slice();await owner.publishCurrentToGl()
 expect(transport).not.toHaveBeenCalled();expect(published).toHaveBeenCalledOnce();expect(p).toEqual(originalP);expect(c).toEqual(originalC)
 expect(reports).toEqual([expect.objectContaining({ordinal:3,supported:false,violations:1,maxExcess:1,applied:false})])
})
it('DEV OFF publish never reads actual material or creates transport work',async()=>{
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor,published=vi.fn(async()=>{})
 Object.assign(owner,{pendingMoment:null,scratch:new Proxy({},{get(){throw Error('OFF source read')}}),publishWithoutDrain:published})
 await owner.publishCurrentToGl();expect(published).toHaveBeenCalledOnce()
})
it('retirement during actual carrier read stops before transport or publishing to the new generation',async()=>{
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor;let resolve:(v:Uint8Array)=>void=()=>{}
 const pending=new Promise<Uint8Array>(r=>{resolve=r}),transport=vi.fn(),published=vi.fn()
 Object.assign(owner,{retired:false,pendingMoment:{chunk:{ordinal:0,segment:{rect:[0,0,1,1]},momentRecipe:{}}},target:{buffer:{height:1,width:1}},scratch:{tiles:{peek:()=>({inkLoad:{readBytes:()=>pending},inkColor:{readBytes:async()=>new Uint8Array(4)},coverage:{}})}},momentSeam:{encodeAfterLanding:transport},momentReport:[],publishWithoutDrain:published})
 const task=owner.publishCurrentToGl();Object.assign(owner,{retired:true});resolve(new Uint8Array(4))
 await expect(task).rejects.toThrow('generation retired');expect(transport).not.toHaveBeenCalled();expect(published).not.toHaveBeenCalled()
})

describe('GPU-only carrier candidate',()=>{
 for(const invalid of [0,1,2])it(`counter ${invalid} gates film rebase without CPU material reads`,async()=>{
  Object.assign(globalThis,{GPUBufferUsage:{COPY_DST:1,MAP_READ:2},GPUMapMode:{READ:1}})
  const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor,copy=vi.fn(),clear=vi.fn(),release=vi.fn(),publish=vi.fn(async()=>{})
  const material={copyTo:copy,readBytes:vi.fn(()=>{throw Error('8MB observer')})},entry={inkLoad:material,inkColor:material,inkBase:{},colorBase:{},strokeInk:{clear},strokeColor:{clear},coverage:{}}
  const read={mapAsync:async()=>{if(invalid===2)Object.assign(owner,{retired:true})},getMappedRange:()=>new Uint32Array([invalid]).buffer,unmap(){},destroy:vi.fn()}
  Object.assign(owner,{diagnosticMomentGpuAudit:true,retired:false,pendingMoment:{chunk:{ordinal:0,segment:{rect:[0,0,1,1],film:true},momentRecipe:{},live:{}}},target:{buffer:{height:1,width:1}},scratch:{captureMetadata:()=>({}),tiles:{peek:()=>entry}},backend:{device:{createBuffer:()=>read},whenIdle:async()=>{}},adapter:{retain(){},runQuantum(fn:(ctx:unknown)=>void){fn({encoder:{copyBufferToBuffer(){}}})}},momentSeam:{encodeAfterLanding:()=>({buffers:[],invalid:{},release})},finish:{encodeLive:()=>[]},momentReport:[],publishWithoutDrain:publish})
  if(invalid===2)await expect(owner.publishCurrentToGl()).rejects.toThrow('generation retired');else await owner.publishCurrentToGl();expect(material.readBytes).not.toHaveBeenCalled();expect(copy).toHaveBeenCalledTimes(invalid?0:2);expect(clear).toHaveBeenCalledTimes(invalid?0:2);expect(release).toHaveBeenCalledOnce();expect(read.destroy).toHaveBeenCalledOnce();if(invalid!==2)expect(owner.momentReport[0]).toMatchObject({supported:!invalid,applied:!invalid,violations:invalid});else expect(publish).not.toHaveBeenCalled()
 })
})

it('rejects vector without GPU audit before GPU resource initialization',()=>{const backend=new Proxy({},{get(){throw Error('GPU touched')}});expect(()=>new CanonicalRoomWatercolorExecutor(backend as never,{tile:{width:1024,height:1024},originX:0,originY:0,diagnosticMomentVector:true} as never)).toThrow('requires GPU audit')})

it('zero-rate keeps full film/base decomposition, not only displayed P/C',async()=>{
 Object.assign(globalThis,{GPUBufferUsage:{COPY_DST:1,MAP_READ:2},GPUMapMode:{READ:1}})
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 const record=(value:number)=>({value,copyTo(dest:{value:number}){dest.value=this.value},clear(){this.value=0}})
 const entry={inkLoad:record(120),inkColor:record(90),inkBase:record(20),colorBase:record(10),strokeInk:record(100),strokeColor:record(80),coverage:record(200),filmGesture:3}
 const before=JSON.stringify(entry),mobileBefore=entry.inkLoad.value-entry.inkBase.value,read={mapAsync:async()=>{},getMappedRange:()=>new Uint32Array([0]).buffer,unmap(){},destroy:vi.fn()},release=vi.fn(),publish=vi.fn(async()=>{})
 Object.assign(owner,{diagnosticMomentGpuAudit:true,retired:false,pendingMoment:{chunk:{ordinal:0,segment:{rect:[0,0,1,1],film:true},momentRecipe:{mixRate:0,advectionRate:0},live:{}}},target:{buffer:{height:1,width:1}},scratch:{captureMetadata:()=>({}),tiles:{peek:()=>entry}},backend:{device:{createBuffer:()=>read},whenIdle:async()=>{}},adapter:{retain(){},runQuantum(fn:(ctx:unknown)=>void){fn({encoder:{copyBufferToBuffer(){}}})}},momentSeam:{encodeAfterLanding:()=>({buffers:[],invalid:{},release})},finish:{encodeLive:()=>[]},momentReport:[],publishWithoutDrain:publish})
 await owner.publishCurrentToGl()
 expect(JSON.stringify(entry)).toBe(before);expect(entry.inkLoad.value-entry.inkBase.value).toBe(mobileBefore);expect(mobileBefore).toBe(100)
 expect(release).toHaveBeenCalledOnce();expect(read.destroy).toHaveBeenCalledOnce();expect(publish).toHaveBeenCalledOnce()
 // Previous unconditional rebase counterexample: same visible120, but mobile0.
 expect(entry.inkLoad.value-entry.inkLoad.value).toBe(0)
})

function ownershipFixture(enabled=true){
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 const fields=new Set<object>(),backend={ownsLiveField:(field:object)=>fields.has(field)}
 const buffer=()=>{const field={};fields.add(field);return{owner:backend,field,width:32,height:32,destroyed:false}}
 const target={buffer:buffer()},entry={coverage:buffer(),inkLoad:buffer(),inkColor:buffer()},settle={pressure:buffer()},glTile={}
 Object.assign(owner,{retired:false,diagnosticSourceOwnershipAssertions:enabled,diagnosticPublication:false,backend,target,glTile,layerId:'L',generation:1,fields:{existingFieldForOwnership:settle},scratch:{captureMetadata:()=>({}),tiles:{peek:()=>entry}},bridgeMode:'canvas'})
 return{owner,buffer,target,entry,settle,glTile,fields}
}
it('DEV owner readset prevents late GL import after same-generation target pointer replacement',async()=>{
 const f=ownershipFixture();let release!:()=>void;const imported=vi.fn(),held=new Promise<void>(r=>{release=r})
 Object.assign(f.owner,{bridge:{copyByCanvas:async(_field:unknown,_target:unknown,current:()=>boolean)=>{await held;if(current())imported()}}})
 const pending=(f.owner as any).publishWithoutDrain(),checked=expect(pending).rejects.toThrow('read set changed: target')
 f.target.buffer=f.buffer();release();await checked;expect(imported).not.toHaveBeenCalled()
})
it('DEV prepare verifies existing role references and dimensions; OFF never queries ledger',()=>{
 for(const enabled of [false,true]){const f=ownershipFixture(enabled)
  Object.assign(f.owner,{central:{isIdle:true},adapter:{runQuantum:(cb:()=>unknown)=>cb()},planner:{prepare:()=>{f.settle.pressure=f.buffer();return null}}})
  if(enabled)expect(()=>f.owner.prepareSettle({bounds:{}} as any)).toThrow('read set changed: settle:pressure')
  else{(f.owner as any).backend.ownsLiveField=()=>{throw Error('OFF ledger queried')};expect(f.owner.prepareSettle({bounds:{}} as any)).toBe(null)}
 }
})
it('DEV source validates pre-existing scratch references before live encode and rejects lost ledger publication',async()=>{
 const f=ownershipFixture(),live=vi.fn()
 Object.assign(f.owner,{central:{isIdle:true},accepted:new Set(),adapter:{runQuantum:(cb:(ctx:any)=>unknown)=>cb({encoder:{}}),retain:()=>{}},source:{execute:()=>{f.entry.inkLoad=f.buffer();return[]}},finish:{encodeLive:live}})
 Object.assign((f.owner as any).scratch,{gesture:0,activateMaterialFilm:()=>{},paints:new Set(),delivery:{}})
 const chunk={path:'live',layerId:'L',generation:1,strokeId:'fixed',ordinal:0,materialGesture:1,segment:{},live:{},metadata:{gesture:1,paints:new Set(),brushTravel:[],wetContacts:[],foreignSources:null,dryCtx:null}}
 expect(()=>f.owner.emitPrepared(chunk as any)).toThrow('read set changed: scratch:inkLoad');expect(live).not.toHaveBeenCalled()
 const g=ownershipFixture();let release!:()=>void;const held=new Promise<void>(r=>{release=r}),imported=vi.fn()
 Object.assign(g.owner,{bridge:{copyByCanvas:async(_field:unknown,_target:unknown,current:()=>boolean)=>{await held;if(current())imported()}}})
 const pending=(g.owner as any).publishWithoutDrain(),checked=expect(pending).rejects.toThrow('read set changed')
 g.fields.clear();release();await checked;expect(imported).not.toHaveBeenCalled()
})

it('DEV failed post-prepare ownership validation disposes the allocated job and preserves primary error',()=>{
 for(const cleanupThrows of [false,true]){const f=ownershipFixture(),disposed=vi.fn(()=>{if(cleanupThrows)throw Error('secondary dispose')}),retired=vi.fn(),warning=vi.spyOn(console,'warn').mockImplementation(()=>{})
  try{Object.assign(f.owner,{central:{isIdle:true},adapter:{runQuantum:(cb:()=>unknown)=>cb(),retireStaticFrontCache:retired},planner:{prepare:()=>{f.settle.pressure=f.buffer();return{dispose:disposed}}}})
   expect(()=>f.owner.prepareSettle({bounds:{}} as any)).toThrow('read set changed: settle:pressure');expect(disposed).toHaveBeenCalledOnce();expect(retired).toHaveBeenCalledOnce();expect(warning).toHaveBeenCalledTimes(cleanupThrows?1:0)
  }finally{warning.mockRestore()}
 }
})

import {expect,it,vi,afterEach} from 'vitest'
import {canonicalPrimaryTexturePin,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,type CanonicalStrokeSnapshotV3,buildCanonicalMaterial,canonicalImageSourceBinding,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import type {CanonicalRecordedInput} from '../../../engine'
import {createHash} from 'node:crypto'
import fixture from '../../../engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {createConfirmedStreamHandler,type ConfirmedStreamDeps} from './confirmedStream'
import {prepareCanonicalRecordedImageResources} from './canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from './canonicalRoomState'
import {createPendingPreviews} from './pendingPreviews'
import {createReplayGate} from '../replayGate'
import {useRoomStore} from '../../../stores/roomStore'
import {prepareCanonicalImageAssets,prepareBrushPresets} from '../../../lib/api/brushLibrary'
import {fetchHistoryPage} from './snapshotRestore'
import {api} from '../../../lib/api/api'
vi.mock('../../../lib/api/api',async original=>({...await original<typeof import('../../../lib/api/api')>(),api:vi.fn()}))
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
vi.mock('../../../lib/api/brushLibrary',()=>({prepareCanonicalImageAssets:vi.fn(async()=>{}),prepareBrushPresets:vi.fn(()=>null)}))
vi.mock('../../../lib/observability/reportInvariant',()=>({reportInvariant:vi.fn()}))
afterEach(()=>{vi.restoreAllMocks();vi.mocked(prepareCanonicalImageAssets).mockClear();vi.mocked(prepareBrushPresets).mockClear();vi.mocked(api).mockReset()})
function original(texture=false){
 let current=true
 const descriptor=fixture.descriptor as unknown as BrushDescriptor,binding=canonicalImageSourceBinding(descriptor,fixture.asset)
 const material={version:2 as const,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'S',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const pattern={id:'asset:'+'f'.repeat(64),size:8,x:0,y:0,width:4,height:4}
 const material3={version:3 as const,assets:[binding.assets[0],pattern],primarySource:binding.primarySource,primaryTexture:canonicalPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},pattern),budget:material.budget}
 const selected:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3=texture?{...snapshot,rasterProfile:generic,materialVersion:3,material:material3,assets:material3.assets}:snapshot
 const empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[{at:0,kind:'gestureEnd' as const}]}
 const packed=texture?buildCanonicalMaterial(empty,material3).packed:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{...(texture?{version:2 as const,rasterProfile:generic}:{version:1 as const,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}),brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:0,operationCount:0}}
 if(texture&&'tailOperations'in state){state.canonicalReadScope={roomId:'room',boardEpoch:1,allowedRasterProfiles:[generic]};state.canonicalAuthorRasterProfile=generic}
 const read=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead
 const payload={seq:1,operation:op,canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:selected}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}}
 const deps:ConfirmedStreamDeps={engineRef:{current:null},lastConfirmedSeqRef:{current:0},latestKnownSeqRef:{current:0},appliedOpIdsRef:{current:new Set()},pendingPreviewsRef:{current:createPendingPreviews()},catchingUpRef:{current:false},streamedStrokeIdsRef:{current:new Set()},deferredOpsQueueRef:{current:[]},previewScheduleRef:{current:null},confirmOwnOperation:vi.fn(),markLayerActive:vi.fn(),applyRemoteOp:vi.fn(()=>true),syncFromLog:vi.fn(),checkSnapshotBoundary:vi.fn(),requestFullResync:vi.fn(),canonicalReadScope:read.scope}
 return{read,payload,deps,stale:()=>{current=false}}
}
it('prepares image input without review/hold/cursor/sink effects then reuses exact original input through replay',()=>{
 const f=original(),gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>(),ticket=gate.begin()
 const hold=vi.spyOn(gate,'hold'),handler=createConfirmedStreamHandler({...f.deps,replayGate:gate}),review=vi.spyOn(useRoomStore.getState(),'observeReviewOperation');review.mockClear()
 const prepared=handler.prepare(f.payload)
 if(!prepared?.recorded)throw Error('Missing original input')
 expect(prepared.recorded.delivery.lifetime).toBe(f.read);expect(prepared.recorded.operation).toBe(prepared.payload.operation)
 expect(review).not.toHaveBeenCalled();expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(hold).not.toHaveBeenCalled()
 expect(f.deps.lastConfirmedSeqRef.current).toBe(0);expect(f.deps.requestFullResync).not.toHaveBeenCalled()
 handler(prepared.payload);expect(hold).toHaveBeenCalledOnce();gate.end(ticket)
 expect(f.deps.applyRemoteOp).toHaveBeenCalledWith(prepared.payload.operation,prepared.recorded.read,prepared.recorded)
})
it('pure malformed preflight throws before resource/review/resync effects; direct callable preserves resync',()=>{
 const f=original(),handler=createConfirmedStreamHandler(f.deps),bad={...f.payload,canonicalCapabilities:{...f.payload.canonicalCapabilities,roomId:'foreign'}}
 expect(()=>handler.prepare(bad)).toThrow();expect(f.deps.requestFullResync).not.toHaveBeenCalled();expect(prepareCanonicalImageAssets).not.toHaveBeenCalled()
 expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();handler(bad);expect(f.deps.requestFullResync).toHaveBeenCalledOnce()
})
it('does not remint copied or stale accepted payload and cannot relabel it to another same-epoch owner',()=>{
 const f=original(),handler=createConfirmedStreamHandler(f.deps),p=handler.prepare(f.payload)
 if(!p?.recorded)throw Error('Missing original input')
 expect(handler.prepare({...p.payload})).toBeUndefined()
 const next=original(),other=createConfirmedStreamHandler(next.deps)
 expect(other.prepare(p.payload)).toBeUndefined();other(p.payload);expect(next.deps.applyRemoteOp).not.toHaveBeenCalled()
 f.stale();expect(handler.prepare(p.payload)).toBeUndefined();handler(p.payload);expect(f.deps.applyRemoteOp).not.toHaveBeenCalled()
})
it('resource preparation holds only genuine original inputs and rechecks their exact original scope after await',async()=>{
 const f=original(),p=createConfirmedStreamHandler(f.deps).prepare(f.payload)
 if(!p?.recorded)throw Error('Missing original input')
 await prepareCanonicalRecordedImageResources([p.recorded],f.read.scope)
 expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',p.recorded.read!.capability.snapshot.assets,expect.any(Function))
 const callback=vi.mocked(prepareCanonicalImageAssets).mock.calls[0][2];callback();f.stale();expect(callback).toThrow()
})
it('rejects forged/copied inputs and data-only scope before loading while native empty remains synchronous',()=>{
 const f=original(),p=createConfirmedStreamHandler(f.deps).prepare(f.payload)
 if(!p?.recorded)throw Error('Missing original input')
 const input=p.recorded
 expect(prepareCanonicalRecordedImageResources([],f.read.scope)).toBeNull()
 expect(()=>prepareCanonicalRecordedImageResources([{...input}],f.read.scope)).toThrow()
 expect(()=>prepareCanonicalRecordedImageResources([input],{roomId:'room',boardEpoch:1,isCurrent:()=>true})).toThrow()
 expect(prepareCanonicalImageAssets).not.toHaveBeenCalled()
})
it('counts closed capability contexts, not assets or frame count, and retains the original input lifetime',async()=>{
 const f=original(),p=createConfirmedStreamHandler(f.deps).prepare(f.payload)
 if(!p?.recorded)throw Error('Missing original input')
 await prepareCanonicalRecordedImageResources(Array(1024).fill(p.recorded),f.read.scope)
 expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(1)
 const inputs:CanonicalRecordedInput[]=[]
 for(let i=0;i<65;i++){
  const payload={...f.payload,operation:{...f.payload.operation,id:'op'+i,frame:{...f.payload.operation.frame,strokeId:'S'+i}},canonicalCapabilities:{...f.payload.canonicalCapabilities,capabilities:[{originalUserId:'author',snapshot:{...f.payload.canonicalCapabilities.capabilities[0].snapshot,strokeId:'S'+i}}],bindings:[{...f.payload.canonicalCapabilities.bindings[0],operationId:'op'+i}]}}
  const next=createConfirmedStreamHandler(f.deps).prepare(payload);if(!next?.recorded)throw Error('Missing input');inputs.push(next.recorded)
 }
 expect(()=>prepareCanonicalRecordedImageResources(inputs,f.read.scope)).toThrow();expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(1)
})

it('holds an original image history page before preset preparation/page publication and preserves original lifetime',async()=>{
 const f=original();let resolve!:()=>void
 const pending=new Promise<void>(r=>{resolve=r});vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
 vi.mocked(api).mockResolvedValue({operations:[f.payload.operation],canonicalCapabilities:f.payload.canonicalCapabilities})
 let published=false
 const work=fetchHistoryPage('room',2,1,f.read.scope).then(page=>{published=true;return page})
 await vi.waitFor(()=>expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce())
 expect(published).toBe(false);expect(prepareBrushPresets).not.toHaveBeenCalled()
 resolve();const page=await work
 if(Array.isArray(page))throw Error('Missing original history page')
 const input=page.prepared[0] as import('../../../engine').CanonicalRecordedInput
 expect(input.delivery.lifetime).toBe(f.read);expect(input.operation).toBe(page.operations[0])
})
it.each(['failure','expired'] as const)('never publishes or prepares presets for an image page with %s resource work',async kind=>{
 const f=original();let resolve!:()=>void,reject!:(e:Error)=>void
 const pending=new Promise<void>((yes,no)=>{resolve=yes;reject=no});vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
 vi.mocked(api).mockResolvedValue({operations:[f.payload.operation],canonicalCapabilities:f.payload.canonicalCapabilities})
 const sink=vi.fn(),work=fetchHistoryPage('room',2,1,f.read.scope).then(sink)
 await vi.waitFor(()=>expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce())
 if(kind==='failure')reject(new Error('missing CAS'));else{f.stale();resolve()}
 await expect(work).rejects.toThrow();expect(sink).not.toHaveBeenCalled();expect(prepareBrushPresets).not.toHaveBeenCalled()
})

it('dispatches original replay inputs through the SAME ordered gate and defers gap/cursor effects until lexical final apply',async()=>{
 const {createOrderedBrushGate}=await import('./orderedBrushGate')
 const f=original(),replay=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>(),ticket=replay.begin(),trace:string[]=[],inputs:CanonicalRecordedInput[]=[]
 let release!:()=>void,releaseCAS!:()=>void
 const blocked=new Promise<void>(yes=>{release=yes}),outerCAS=new Promise<void>(yes=>{releaseCAS=yes})
 const gate=createOrderedBrushGate(()=>null,error=>{throw error})
 const apply=vi.fn<ConfirmedStreamDeps['applyRemoteOp']>((op)=>{trace.push(op.id);return true})
 const dispatchPrepared=(input:CanonicalRecordedInput,applyFinal:()=>void)=>{
  inputs.push(input)
  gate.dispatch([],applyFinal,()=>f.read.scope.isCurrent(),()=>input.operation.id==='A'?blocked:null)
 }
 const handler=createConfirmedStreamHandler({...f.deps,applyRemoteOp:apply,...{dispatchPrepared},replayGate:replay})
 const message=(id:string,seq:number)=>({...f.payload,seq,operation:{...f.payload.operation,id,seq,frame:{...f.payload.operation.frame,strokeId:id}},canonicalCapabilities:{...f.payload.canonicalCapabilities,capabilities:[{originalUserId:'author',snapshot:{...f.payload.canonicalCapabilities.capabilities[0].snapshot,strokeId:id}}],bindings:[{...f.payload.canonicalCapabilities.bindings[0],operationId:id,sequence:seq}]}})
 for(const [index,id] of ['A','B','C'].entries())gate.dispatch([],()=>handler(message(id,index+1)),undefined,()=>id==='A'?outerCAS:null)
 expect(inputs).toHaveLength(0);expect(apply).not.toHaveBeenCalled()
 releaseCAS();await outerCAS;await Promise.resolve()
 expect(inputs).toHaveLength(0);expect(apply).not.toHaveBeenCalled()
 expect(replay.end(ticket)).toBe(true) // delivery token is synchronously consumed, never retained across await
 expect(inputs).toHaveLength(3);expect(apply).not.toHaveBeenCalled();expect(f.deps.lastConfirmedSeqRef.current).toBe(0)
 handler(message('D',4));expect(inputs).toHaveLength(4)
 release();await blocked;await vi.waitFor(()=>expect(trace).toEqual(['A','B','C','D']))
 expect(f.deps.lastConfirmedSeqRef.current).toBe(4);expect(f.deps.requestFullResync).not.toHaveBeenCalled()
 expect(apply.mock.calls.map(call=>call[2])).toEqual(inputs)
 gate.cancel()
})
it('rechecks the original lifetime when a prepared final closure is delayed past scope expiry',()=>{
 const f=original();let finish:(()=>void)|undefined
 const dispatchPrepared=vi.fn((_input:CanonicalRecordedInput,applyFinal:()=>void)=>{finish=applyFinal})
 const handler=createConfirmedStreamHandler({...f.deps,...{dispatchPrepared}})
 handler(f.payload);expect(dispatchPrepared).toHaveBeenCalledOnce();expect(f.deps.applyRemoteOp).not.toHaveBeenCalled()
 f.stale();expect(()=>finish?.()).toThrow();expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.lastConfirmedSeqRef.current).toBe(0)
})

it('prepares BOTH original V3 tip and raw pattern through the same delivery lifetime',async()=>{
 const f=original(true),handler=createConfirmedStreamHandler(f.deps),prepared=handler.prepare(f.payload)
 if(!prepared?.recorded)throw Error('Missing genuine original3')
 const before=prepared.recorded,assets=before.read!.capability.snapshot.assets
 expect(before.read!.capability.snapshot.materialVersion).toBe(3);expect(assets).toHaveLength(2)
 await prepareCanonicalRecordedImageResources([before],f.read.scope)
 expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',assets,expect.any(Function));expect(prepared.recorded).toBe(before)
 const current=vi.mocked(prepareCanonicalImageAssets).mock.calls[0][2];current();f.stale();expect(current).toThrow()
 expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.confirmOwnOperation).not.toHaveBeenCalled()
})

function textureResourceBatch(){
 const f=original(true),handler=createConfirmedStreamHandler(f.deps),base=f.payload.canonicalCapabilities.capabilities[0].snapshot
 if(base.materialVersion!==3)throw Error('Texture fixture required')
 const atoms=Array.from({length:64},(_,i)=>{
  const primary='asset:'+(i+1).toString(16).padStart(64,'0'),pattern='asset:'+(i+65).toString(16).padStart(64,'0'),strokeId='S'+i,assets=[{...base.assets[0],id:primary},{...base.assets[1],id:pattern}]
  const snapshot={...base,strokeId,assets,material:{...base.material,assets,primarySource:{...base.material.primarySource,asset:primary},primaryTexture:{...base.material.primaryTexture,asset:pattern}}}
  const operation={...f.payload.operation,id:'op'+i,seq:i+1,frame:{...f.payload.operation.frame,strokeId,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},snapshot.material).packed}}
  const payload={seq:i+1,operation,canonicalCapabilities:{...f.payload.canonicalCapabilities,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:operation.id,sequence:i+1,originalUserId:'author',capability:0}]}}
  const prepared=handler.prepare(payload);if(!prepared?.recorded)throw Error('Original resource atom required');return prepared.recorded
 })
 return{f,atoms}
}
it('bounds a genuine 64-capability two-role ledger into two sequential availability calls',async()=>{
 const{f,atoms}=textureResourceBatch();await prepareCanonicalRecordedImageResources(atoms,f.read.scope)
 const calls=vi.mocked(prepareCanonicalImageAssets).mock.calls;expect(calls).toHaveLength(2);expect(calls.map(c=>c[1].length)).toEqual([64,64])
 const ids=calls.flatMap(c=>c[1].map(a=>a.id));expect(new Set(ids).size).toBe(128);expect(calls[0][2]).toBe(calls[1][2])
})
it('rechecks the SAME original lifetime between texture asset chunks and never starts the next stale chunk',async()=>{
 const{f,atoms}=textureResourceBatch();vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce(async()=>{f.stale()})
 await expect(prepareCanonicalRecordedImageResources(atoms,f.read.scope)).rejects.toThrow();expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(1)
})
it('does not use a V3 neighbor to expand the historical V2 availability subledger',()=>{
 const f=original(true),handler=createConfirmedStreamHandler(f.deps),first=handler.prepare(f.payload)
 if(!first?.recorded)throw Error('Original input required')
 const base=f.payload.canonicalCapabilities.capabilities[0].snapshot;if(base.materialVersion!==3)throw Error('Texture fixture required')
 const assets=Array.from({length:65},(_,i)=>({...base.assets[0],id:'asset:'+(i+200).toString(16).padStart(64,'0')})),material={version:2 as const,assets,primarySource:{...base.material.primarySource,asset:assets[0].id,frames:assets.map(a=>a.id)},budget:base.material.budget},strokeId='old-pipe'
 const snapshot={...base,strokeId,materialVersion:2 as const,assets,material},operation={...f.payload.operation,id:'old-op',seq:2,frame:{...f.payload.operation.frame,strokeId,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed}}
 const prepared=handler.prepare({seq:2,operation,canonicalCapabilities:{...f.payload.canonicalCapabilities,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'old-op',sequence:2,originalUserId:'author',capability:0}]}})
 if(!prepared?.recorded)throw Error('Original V2 input required')
 const inputs=[first.recorded,prepared.recorded]
 expect(()=>prepareCanonicalRecordedImageResources(inputs,f.read.scope)).toThrow(/legacy image resource asset limit/)
 expect(prepareCanonicalImageAssets).not.toHaveBeenCalled()
})

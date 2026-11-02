import {expect,it,vi} from 'vitest'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents,type Operation,LEGACY_ROOM_RASTER_VERSION} from '@grafetto/shared'
import {prepareCanonicalRoomState,preflightRoomStateDelivery,assertCanonicalRoomStateRead} from './canonicalRoomState'
function fixture(){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:3,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:3,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function state(){
 const f=fixture()
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment}
 return {state,f}
}
it('captures immutable exact-operation read resources and author policy from authoritative state',()=>{
 const {state:s}=state();let current=true
 s.canonicalReadScope={...s.canonicalReadScope!,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]};s.canonicalAuthorRasterProfile=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
 const result=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}),r=result.canonicalRead
 expect(r.authorRasterProfile).toBe(CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE);expect(r.preparedAtoms[0].read?.capability.originalUserId).toBe('author')
 expect(r.preparedAtoms[0].read?.rasterProfile).toBe(CANONICAL_STROKE_RASTER_PROFILE);expect(Object.isFrozen(r.scope.allowedRasterProfiles)).toBe(true)
 s.tailOperations.length=0;expect(result.tailOperations).toHaveLength(1)
 assertCanonicalRoomStateRead(r,result.tailOperations,'room')
 expect(()=>assertCanonicalRoomStateRead({...r},result.tailOperations,'room')).toThrow('foreign')
 expect(()=>assertCanonicalRoomStateRead(r,[...result.tailOperations],'room')).toThrow('foreign')
 current=false;expect(()=>assertCanonicalRoomStateRead(r,result.tailOperations,'room')).toThrow('Stale')
})
it.each(['cap','scope','author','board','stale','V1'] as const)('rejects %s before dispatch side effects',kind=>{
 const {state:s}=state()
 if(kind==='cap')s.canonicalCapabilities={...s.canonicalCapabilities!,boardEpoch:9}
 if(kind==='scope')s.canonicalReadScope={roomId:'other',boardEpoch:2}
 if(kind==='author')s.canonicalAuthorRasterProfile=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
 if(kind==='V1')s.tailOperations[0]={...s.tailOperations[0],type:'canonical_stroke',layerId:'L',frame:{...fixture().op.frame,materialPacked:'1|old'}}
 const dispatch=vi.fn(),prepare=()=>prepareCanonicalRoomState(s,{expectedBoardId:kind==='board'?'other':'room',isCurrent:()=>kind!=='stale'})
 expect(()=>dispatch(preflightRoomStateDelivery(s,prepare))).toThrow();expect(dispatch).not.toHaveBeenCalled()
})
it('keeps the default canonical gate OFF and returns legacy state unchanged',()=>{
 const {state:s}=state();expect(()=>preflightRoomStateDelivery(s)).toThrow('Unsupported')
 const legacy={...s,room:{...s.room,rasterVersion:'legacy-pm8-v1' as const},canonicalReadScope:undefined,canonicalCapabilities:undefined}
 expect(preflightRoomStateDelivery(legacy)).toBe(legacy)
})
it('requires explicit canonical sinks before starting restore and keeps read resources out of the legacy apply lane',async()=>{
 const {restoreRoomState}=await import('../restoreRoomState')
 const {createTestEngine}=await import('../../../engine/testing/engineTestUtils')
 const {createReplayGate}=await import('../replayGate')
 const {createPendingPreviews}=await import('./pendingPreviews')
 const {state:s}=state(),prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})
 const engine=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 const deps={boardId:'room',restoreFromSnapshot:vi.fn(),backfillHistory:vi.fn(),applyRemoteOp:vi.fn(),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 const begin=vi.spyOn(deps.replayGate,'begin'),suspend=vi.spyOn(engine,'suspendDisplay')
 try{
  await expect(restoreRoomState(engine,prepared,{mode:'join',alreadyHadSeq:0},deps)).rejects.toThrow('sinks unavailable')
  expect(begin).not.toHaveBeenCalled();expect(suspend).not.toHaveBeenCalled();expect(deps.dispatchParticipants).not.toHaveBeenCalled()
  const applyCanonicalOp=vi.fn(),restoreCanonicalHistory=vi.fn(async()=>{})
  await restoreRoomState(engine,prepared,{mode:'join',alreadyHadSeq:0},{...deps,applyCanonicalOp,restoreCanonicalHistory})
  expect(applyCanonicalOp).toHaveBeenCalledWith(prepared.canonicalRead.preparedAtoms[0]);expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  expect(deps.latestKnownSeqRef.current).toBe(3);expect(deps.setRoomContentReady).toHaveBeenCalledWith(true)
 }finally{engine.destroy()}
})
it('expires across restore await without applying read atoms or publishing new readiness/cursors',async()=>{
 const {restoreRoomState}=await import('../restoreRoomState')
 const {createTestEngine}=await import('../../../engine/testing/engineTestUtils')
 const {createReplayGate}=await import('../replayGate')
 const {createPendingPreviews}=await import('./pendingPreviews')
 let current=true;const {state:s}=state(),prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current})
 const engine=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 vi.spyOn(engine,'preloadImages').mockImplementation(async()=>{current=false})
 const deps={boardId:'room',restoreFromSnapshot:vi.fn(),backfillHistory:vi.fn(),applyRemoteOp:vi.fn(),applyCanonicalOp:vi.fn(),restoreCanonicalHistory:vi.fn(async()=>{}),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 try{
  await restoreRoomState(engine,prepared,{mode:'join',alreadyHadSeq:0},deps)
  expect(deps.applyCanonicalOp).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.latestKnownSeqRef.current).toBe(0)
  expect(deps.markJoinRestoreDone).not.toHaveBeenCalled();expect(deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
 }finally{engine.destroy()}
})
it('rejects explicit close metadata before granting room-state read authority',()=>{
 const {state:s}=state()
 s.tailOperations=[{id:'close',type:'canonical_stroke_close',userId:'author',timestamp:0,seq:4} as unknown as Operation]
 expect(()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow('seal owner')
 const legacy={...s,room:{...s.room,rasterVersion:LEGACY_ROOM_RASTER_VERSION},canonicalReadScope:undefined,canonicalAuthorRasterProfile:undefined,canonicalCapabilities:undefined}
 expect(()=>preflightRoomStateDelivery(legacy)).toThrow('seal owner')
})
it('carries the exact original room lifetime through local history capture and refuses copied resources',async()=>{
 const {captureCanonicalHistoryScope,prepareCanonicalHistoryPage}=await import('./canonicalHistoryPage')
 const {canonicalRecordedLifetimeOf}=await import('./canonicalRecordedDelivery')
 const {state:s,f}=state();let current=true
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}),read=prepared.canonicalRead
 const atom=read.preparedAtoms[0] as import('../../../engine/src/oplog/CanonicalRecordedDelivery').CanonicalRecordedInput
 expect(read.assertCurrent()).toBe(read.scope);expect(atom.delivery.lifetime).toBe(read)
 atom.delivery.assertCurrent(atom)
 expect(()=>atom.delivery.assertCurrent({...atom})).toThrow()
 expect(()=>({...atom.delivery}).assertCurrent(atom)).toThrow()
 expect(()=>({...read}).assertCurrent()).toThrow()
 expect(Object.keys(atom)).not.toContain('delivery');expect(()=>JSON.stringify(prepared)).not.toThrow()
 const scope=captureCanonicalHistoryScope(read.scope)!
 expect(canonicalRecordedLifetimeOf(scope)).toBe(read)
 const page=prepareCanonicalHistoryPage({operations:[f.op],canonicalCapabilities:f.attachment},'room',scope)
 if(Array.isArray(page))throw Error('Expected prepared history')
 const historical=page.prepared[0] as typeof atom
 expect(historical.delivery.lifetime).toBe(read);historical.delivery.assertCurrent(historical)
 expect(()=>canonicalRecordedLifetimeOf({...read.scope})).toThrow()
 current=false
 expect(()=>read.assertCurrent()).toThrow();expect(()=>atom.delivery.assertCurrent(atom)).toThrow()
 expect(()=>historical.delivery.assertCurrent(historical)).toThrow()
})
it.each([[false,false],[true,false],[false,true],[true,true]])('preserves original confirmed delivery lifetime (own=%s, expire=%s)',async(own,expire)=>{
 const {createConfirmedStreamHandler}=await import('./confirmedStream')
 const {createPendingPreviews}=await import('./pendingPreviews')
 const {createReplayGate}=await import('../replayGate')
 let current=true
 const {state:s,f}=state(),prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current})
 const gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>(),token=gate.begin(),applyRemoteOp=vi.fn().mockReturnValue(true),confirmOwnOperation=vi.fn(),requestFullResync=vi.fn()
 const deps={engineRef:{current:null},lastConfirmedSeqRef:{current:2},latestKnownSeqRef:{current:2},appliedOpIdsRef:{current:new Set(own?[f.op.id]:[])},pendingPreviewsRef:{current:createPendingPreviews()},catchingUpRef:{current:false},streamedStrokeIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[] as Operation[]},previewScheduleRef:{current:null},confirmOwnOperation,markLayerActive:vi.fn(),applyRemoteOp,syncFromLog:vi.fn(),checkSnapshotBoundary:vi.fn(),requestFullResync,replayGate:gate,canonicalReadScope:prepared.canonicalRead.scope}
 const handler=createConfirmedStreamHandler(deps)
 handler({seq:3,operation:f.op,canonicalCapabilities:f.attachment})
 expect(applyRemoteOp).not.toHaveBeenCalled();expect(confirmOwnOperation).not.toHaveBeenCalled()
 if(expire)current=false
 gate.end(token)
 if(expire){
  expect(applyRemoteOp).not.toHaveBeenCalled();expect(confirmOwnOperation).not.toHaveBeenCalled()
  expect(deps.lastConfirmedSeqRef.current).toBe(2);expect(deps.latestKnownSeqRef.current).toBe(2)
  return
 }
 expect(confirmOwnOperation).not.toHaveBeenCalled()
 const call=applyRemoteOp.mock.calls[0]
 const input=call[2] as import('../../../engine/src/oplog/CanonicalRecordedDelivery').CanonicalRecordedInput
 expect(input.delivery.lifetime).toBe(prepared.canonicalRead);input.delivery.assertCurrent(input)
 expect(input.operation).toBe(call[0]);expect(deps.lastConfirmedSeqRef.current).toBe(3)
 expect(requestFullResync).not.toHaveBeenCalled()
})

function emptyBaseState(){
 const {state:s,f}=state()
 s.tailOperations=[{...f.op,seq:1}]
 s.canonicalCapabilities={...f.attachment,bindings:[{...f.attachment.bindings[0],sequence:1}]}
 s.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 return s
}
it.each([false,true])('captures a verified complete empty-history baseline (empty=%s)',empty=>{
 const s=emptyBaseState();if(empty){s.tailOperations=[];s.canonicalCapabilities=undefined;s.canonicalHistoryBase={...s.canonicalHistoryBase!,throughSeq:0,operationCount:0}}
 const raw=s.canonicalHistoryBase!,result=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}),read=result.canonicalRead
 expect(read.emptyHistoryBase).toEqual(raw);expect(read.emptyHistoryBase).not.toBe(raw);expect(Object.isFrozen(read.emptyHistoryBase)).toBe(true)
 expect(result.canonicalHistoryBase).toBe(read.emptyHistoryBase)
 expect(read.assertEmptyHistoryBase(result.tailOperations)).toBe(read.emptyHistoryBase)
 Object.defineProperty(raw,'throughSeq',{value:9});expect(read.emptyHistoryBase?.throughSeq).toBe(empty?0:1)
 expect(read.preparedAtoms).toHaveLength(empty?0:1)
})
it('keeps a missing baseline on the old read path without empty-history authority',()=>{
 const {state:s}=state(),result=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})
 expect(result.canonicalRead.emptyHistoryBase).toBeUndefined()
 expect(()=>result.canonicalRead.assertEmptyHistoryBase(result.tailOperations)).toThrow()
 assertCanonicalRoomStateRead(result.canonicalRead,result.tailOperations,'room')
})
it('binds empty-history authority to the original read receiver, exact normalized tail and current original scope',()=>{
 let current=true;const result=prepareCanonicalRoomState(emptyBaseState(),{expectedBoardId:'room',isCurrent:()=>current}),read=result.canonicalRead
 expect(()=>({...read}).assertEmptyHistoryBase(result.tailOperations)).toThrow()
 expect(()=>read.assertEmptyHistoryBase([...result.tailOperations])).toThrow()
 expect(()=>read.assertEmptyHistoryBase([])).toThrow()
 const other=prepareCanonicalRoomState(emptyBaseState(),{expectedBoardId:'room',isCurrent:()=>true})
 expect(()=>read.assertEmptyHistoryBase(other.tailOperations)).toThrow()
 expect(read.assertEmptyHistoryBase(result.tailOperations)).toBe(read.emptyHistoryBase)
 current=false;expect(()=>read.assertEmptyHistoryBase(result.tailOperations)).toThrow()
})
it.each(['room','epoch','cut','count','global-sequence','truncated','unsupported','ended','null','hidden','getter'] as const)('rejects invalid empty baseline %s before dispatch',kind=>{
 const s=emptyBaseState(),raw=s.canonicalHistoryBase!,dispatch=vi.fn(),getter=vi.fn(()=>1)
 if(kind==='room')s.canonicalHistoryBase={...raw,roomId:'other'}
 if(kind==='epoch')s.canonicalHistoryBase={...raw,boardEpoch:3}
 if(kind==='cut')s.canonicalHistoryBase={...raw,throughSeq:2,operationCount:2}
 if(kind==='count')s.canonicalHistoryBase={...raw,throughSeq:0,operationCount:0}
 if(kind==='global-sequence'){s.tailOperations=[{...s.tailOperations[0],seq:3}];s.canonicalCapabilities={...s.canonicalCapabilities!,bindings:[{...s.canonicalCapabilities!.bindings[0],sequence:3}]}}
 if(kind==='truncated'){s.tailOperations=[];s.canonicalCapabilities=undefined}
 if(kind==='unsupported'){s.tailOperations=[{id:'clear',userId:'author',timestamp:0,seq:1,type:'layer_clear',layerId:'L'}];s.canonicalCapabilities=undefined}
 if(kind==='ended'){
  const first=s.tailOperations[0] as CanonicalStrokeOperation
  s.tailOperations.push({...first,id:'second',seq:2,frame:{...first.frame,frameOrdinal:1}})
  s.canonicalCapabilities={...s.canonicalCapabilities!,bindings:[...s.canonicalCapabilities!.bindings,{...s.canonicalCapabilities!.bindings[0],operationId:'second',sequence:2}]}
  s.canonicalHistoryBase={...raw,throughSeq:2,operationCount:2}
 }
 if(kind==='null')Object.defineProperty(s,'canonicalHistoryBase',{value:null})
 if(kind==='hidden')Object.defineProperty(raw,'hidden',{value:1})
 if(kind==='getter')Object.defineProperty(raw,'operationCount',{get:getter})
 expect(()=>dispatch(preflightRoomStateDelivery(s,()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})))).toThrow()
 expect(dispatch).not.toHaveBeenCalled();expect(getter).not.toHaveBeenCalled()
})
it('rejects a legacy room carrying an empty-history field and refuses a top-level baseline getter without invoking it',()=>{
 const s=emptyBaseState(),legacy={...s,room:{...s.room,rasterVersion:LEGACY_ROOM_RASTER_VERSION},canonicalReadScope:undefined,canonicalCapabilities:undefined},getter=vi.fn(()=>s.canonicalHistoryBase)
 expect(()=>preflightRoomStateDelivery(legacy)).toThrow()
 Object.defineProperty(s,'canonicalHistoryBase',{get:getter})
 expect(()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow();expect(getter).not.toHaveBeenCalled()
})

it('does not grant authority for explicit undefined metadata or an inherited baseline field',()=>{
 const {state:s}=state();s.canonicalHistoryBase=undefined
 const result=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})
 expect(result.canonicalRead.emptyHistoryBase).toBeUndefined();expect(()=>result.canonicalRead.assertEmptyHistoryBase(result.tailOperations)).toThrow()
 const inherited=Object.assign(Object.create({canonicalHistoryBase:emptyBaseState().canonicalHistoryBase}),state().state)
 expect(()=>prepareCanonicalRoomState(inherited,{expectedBoardId:'room',isCurrent:()=>true})).toThrow()
})

it('captures original room geometry once before lifetime callbacks and does not follow later wire mutations',()=>{
 const {state:s}=state();let checks=0
 const result=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>{checks++;s.room.canvasWidth=99;s.room.canvasHeight=101;s.room.infinite=true;return true}})
 expect(checks).toBeGreaterThan(0)
 expect(result.canonicalRead.roomGeometry).toEqual({width:64,height:64,infinite:false})
 expect(Object.isFrozen(result.canonicalRead.roomGeometry)).toBe(true)
 s.room.canvasWidth=2;expect(result.canonicalRead.roomGeometry.width).toBe(64)
 expect(result.canonicalRead.assertCurrent()).toBe(result.canonicalRead.scope)
})

it('captures optional author texture policy only from own DATA original room state; reconnect OFF drops it',()=>{
 const {state:s}=state();Object.assign(s,{canonicalAuthorRasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]},canonicalAuthorPrimaryTextureSource:'pressure-identity-subtract-v3'})
 let current=true
 const read=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead
 expect(read.authorPrimaryTextureSource).toBe('pressure-identity-subtract-v3')
 Reflect.deleteProperty(s,'canonicalAuthorPrimaryTextureSource');expect(read.authorPrimaryTextureSource).toBe('pressure-identity-subtract-v3')
 current=false;expect(()=>read.assertCurrent()).toThrow()
 expect(prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}).canonicalRead.authorPrimaryTextureSource).toBeUndefined()
 for(const invalid of [undefined,false,null,'other']){const value={...s,canonicalAuthorPrimaryTextureSource:invalid};expect(()=>prepareCanonicalRoomState(value as typeof s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow()}
 let calls=0;const accessor={...s};Object.defineProperty(accessor,'canonicalAuthorPrimaryTextureSource',{get(){calls++;return 'pressure-identity-subtract-v3'}})
 expect(()=>prepareCanonicalRoomState(accessor,{expectedBoardId:'room',isCurrent:()=>true})).toThrow();expect(calls).toBe(0)
 const inherited=Object.assign(Object.create({canonicalAuthorPrimaryTextureSource:'pressure-identity-subtract-v3'}),s)
 expect(()=>prepareCanonicalRoomState(inherited,{expectedBoardId:'room',isCurrent:()=>true})).toThrow()
})


it('captures author5 independently of4 from full original ownDATA only; reconnect OFF and stale stay closed',()=>{
 const {state:s}=state();s.canonicalReadScope={...s.canonicalReadScope!,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]};s.canonicalAuthorRasterProfile=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE;Reflect.set(s,'canonicalAuthorPressureTexturedSource','pressure-default-auto-texture-v5');let current=true;const r=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead;expect(r.authorPressureTexturedSource).toBe('pressure-default-auto-texture-v5');expect(r.authorTexturedSource).toBeUndefined();Reflect.deleteProperty(s,'canonicalAuthorPressureTexturedSource');expect(r.authorPressureTexturedSource).toBe('pressure-default-auto-texture-v5');expect(prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}).canonicalRead.authorPressureTexturedSource).toBeUndefined();current=false;expect(()=>r.assertCurrent()).toThrow()
 let calls=0;Object.defineProperty(s,'canonicalAuthorPressureTexturedSource',{get(){calls++;return'pressure-default-auto-texture-v5'}});expect(()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow();expect(calls).toBe(0)
})

it('captures author6 independently of4 from full original ownDATA only; reconnect OFF and stale stay closed',()=>{
 const {state:s}=state();s.canonicalReadScope={...s.canonicalReadScope!,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]};s.canonicalAuthorRasterProfile=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE;Reflect.set(s,'canonicalAuthorSoftPressureTexturedSource','pressure-soft-auto-texture-v6');let current=true;const r=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead;expect(r.authorSoftPressureTexturedSource).toBe('pressure-soft-auto-texture-v6');expect(r.authorTexturedSource).toBeUndefined();Reflect.deleteProperty(s,'canonicalAuthorSoftPressureTexturedSource');expect(r.authorSoftPressureTexturedSource).toBe('pressure-soft-auto-texture-v6');expect(prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}).canonicalRead.authorSoftPressureTexturedSource).toBeUndefined();current=false;expect(()=>r.assertCurrent()).toThrow()
 let calls=0;Object.defineProperty(s,'canonicalAuthorSoftPressureTexturedSource',{get(){calls++;return'pressure-soft-auto-texture-v6'}});expect(()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow();expect(calls).toBe(0)
})

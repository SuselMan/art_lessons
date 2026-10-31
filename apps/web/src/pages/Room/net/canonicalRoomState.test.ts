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

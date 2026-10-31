import {createConfirmedStreamHandler} from './confirmedStream'
import {createPendingPreviews} from './pendingPreviews'
import {createReplayGate} from '../replayGate'
import type {CanonicalRecordedInput} from '../../../engine'
import {expect,it,vi} from 'vitest'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents,type Operation} from '@grafetto/shared'
import {prepareCanonicalRoomState} from './canonicalRoomState'
function fixture(ended=true){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},...(ended?[{at:1,kind:'gestureEnd' as const}]:[])]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function state(ended=true){
 const f=fixture(ended)
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment}
 return {state,f}
}

function fullState(ended=true){
 const {state:s}=state(ended)
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 return s
}
function close():Operation{return{type:'canonical_stroke_close',id:'close',userId:'author',timestamp:2,seq:2,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'}}

function receiver(own=false){
 let current=true
 const s=fullState(false)
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current})
 const gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>()
 const deps={engineRef:{current:null},lastConfirmedSeqRef:{current:1},latestKnownSeqRef:{current:1},appliedOpIdsRef:{current:new Set(own?['close']:[])},pendingPreviewsRef:{current:createPendingPreviews()},catchingUpRef:{current:false},streamedStrokeIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]as Operation[]},previewScheduleRef:{current:{noteOperation:vi.fn()}},confirmOwnOperation:vi.fn(),markLayerActive:vi.fn(),applyRemoteOp:vi.fn().mockReturnValue(true),syncFromLog:vi.fn(),checkSnapshotBoundary:vi.fn(),requestFullResync:vi.fn(),replayGate:gate,canonicalReadScope:prepared.canonicalRead.scope}
 return {deps,gate,read:prepared.canonicalRead,expire:()=>{current=false},handler:createConfirmedStreamHandler(deps)}
}
it.each([false,true])('admits own=%s original close through bool sink with no frame read or own-confirm path',own=>{
 const f=receiver(own)
 f.deps.applyRemoteOp.mockImplementation(()=>{
  expect(f.deps.lastConfirmedSeqRef.current).toBe(1);expect(f.deps.latestKnownSeqRef.current).toBe(1)
  expect(f.deps.syncFromLog).not.toHaveBeenCalled();return true
 })
 f.handler({seq:2,operation:close()})
 const [op,read,input]=f.deps.applyRemoteOp.mock.calls[0]as unknown as [Operation,undefined,CanonicalRecordedInput]
 expect(read).toBeUndefined();expect(input.operation).toBe(op);expect(input.read).toBeUndefined()
 expect(input.delivery.lifetime).toBe(f.read);input.delivery.assertCurrent(input)
 expect(Object.isFrozen(op)).toBe(true);expect(f.deps.confirmOwnOperation).not.toHaveBeenCalled()
 expect(f.deps.lastConfirmedSeqRef.current).toBe(2);expect(f.deps.latestKnownSeqRef.current).toBe(2)
 expect(f.deps.syncFromLog).toHaveBeenCalledOnce();expect(f.deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
 expect(f.deps.requestFullResync).not.toHaveBeenCalled()
})
it.each(['valid','stale','newOwner','copied']as const)('holds close under exact original delivery until %s release',kind=>{
 const f=receiver(),ticket=f.gate.begin(),raw=close()
 f.handler({seq:2,operation:raw});expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.lastConfirmedSeqRef.current).toBe(1)
 Object.assign(raw,{recordedNext:99})
 if(kind==='stale')f.expire()
 if(kind==='newOwner')createConfirmedStreamHandler({...f.deps,canonicalReadScope:{...f.deps.canonicalReadScope}})
 if(kind==='copied')f.gate.setHandler(payload=>f.handler({...payload}))
 f.gate.end(ticket)
 if(kind==='valid'){
  expect(f.deps.applyRemoteOp).toHaveBeenCalledOnce()
  expect(f.deps.applyRemoteOp.mock.calls[0][0]).toMatchObject({recordedNext:1})
  expect(f.deps.lastConfirmedSeqRef.current).toBe(2)
 }else{expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.lastConfirmedSeqRef.current).toBe(1)}
})
it.each(['false','throw','pending','gap','capability','badSeq','extra','dataOnly','missingScope']as const)('rejects close %s without precommitting cursor',kind=>{
 const f=receiver(),op=close()
 if(kind==='false')f.deps.applyRemoteOp.mockReturnValue(false)
 if(kind==='throw')f.deps.applyRemoteOp.mockImplementation(()=>{throw Error('seal rejected')})
 if(kind==='pending')f.deps.pendingPreviewsRef.current.add('pending',1)
 if(kind==='badSeq')op.seq=3
 if(kind==='extra')Object.assign(op,{unknown:true})
 const scope=kind==='missingScope'?undefined:kind==='dataOnly'?{roomId:'room',boardEpoch:2,isCurrent:()=>true}:f.deps.canonicalReadScope
 const handler=createConfirmedStreamHandler({...f.deps,canonicalReadScope:scope})
 handler({seq:kind==='gap'?3:2,operation:op,...kind==='capability'?{canonicalCapabilities:fixture().attachment}:{}})
 expect(f.deps.requestFullResync).toHaveBeenCalledOnce();expect(f.deps.lastConfirmedSeqRef.current).toBe(1)
 expect(f.deps.latestKnownSeqRef.current).toBe(1);expect(f.deps.syncFromLog).not.toHaveBeenCalled()
 expect(f.deps.previewScheduleRef.current.noteOperation).not.toHaveBeenCalled()
 if(kind!=='false'&&kind!=='throw')expect(f.deps.applyRemoteOp).not.toHaveBeenCalled()
})

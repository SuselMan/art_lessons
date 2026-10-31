import {expect,it,vi} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type Operation} from '@grafetto/shared'
import {createConfirmedStreamHandler,type ConfirmedStreamDeps} from './confirmedStream'
import {createPendingPreviews} from './pendingPreviews'
import {createReplayGate} from '../replayGate'
import {useRoomStore} from '../../../stores/roomStore'
vi.mock('../../../lib/observability/reportInvariant',()=>({reportInvariant:vi.fn()}))
import {prepareCanonicalRoomState} from './canonicalRoomState'
import type {ServerToClientEvents} from '@grafetto/shared'
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
function setup(){
 const f=fixture(),isCurrent=vi.fn(()=>true)
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalHistoryBase:{kind:'empty-room-prefix-v1',...f.expected,throughSeq:0,operationCount:0}}
 const read=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent}).canonicalRead
 const deps={engineRef:{current:{previewOperation:vi.fn(),dropPendingPreview:vi.fn(()=>null)}},lastConfirmedSeqRef:{current:2},latestKnownSeqRef:{current:2},appliedOpIdsRef:{current:new Set<string>()},pendingPreviewsRef:{current:createPendingPreviews()},catchingUpRef:{current:false},streamedStrokeIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[] as Operation[]},previewScheduleRef:{current:{noteOperation:vi.fn()}},confirmOwnOperation:vi.fn(),markLayerActive:vi.fn(),applyRemoteOp:vi.fn<ConfirmedStreamDeps['applyRemoteOp']>(()=>true),syncFromLog:vi.fn(),checkSnapshotBoundary:vi.fn(),requestFullResync:vi.fn(),canonicalReadScope:read.scope}
 return{...f,read,isCurrent,deps,payload:{seq:3,operation:f.op,canonicalCapabilities:f.attachment}}
}
it.each(['false','throw'] as const)('does not publish review, cursors or snapshot after a canonical receiver %s',mode=>{
 const s=setup(),observe=vi.spyOn(useRoomStore.getState(),'observeReviewOperation');observe.mockClear()
 s.deps.applyRemoteOp.mockImplementation(()=>{if(mode==='throw')throw Error('Source admission failed');return false})
 try{
  expect(()=>createConfirmedStreamHandler(s.deps)(s.payload)).not.toThrow()
  expect(s.deps.requestFullResync).toHaveBeenCalledOnce();expect(observe).not.toHaveBeenCalled()
  expect(s.deps.lastConfirmedSeqRef.current).toBe(2);expect(s.deps.latestKnownSeqRef.current).toBe(2)
  expect(s.deps.previewScheduleRef.current.noteOperation).not.toHaveBeenCalled();expect(s.deps.syncFromLog).not.toHaveBeenCalled();expect(s.deps.checkSnapshotBoundary).not.toHaveBeenCalled()
 }finally{observe.mockRestore()}
})
it('uses the same original recorded receiver for own and peer frames before publication',()=>{
 const s=setup();s.deps.appliedOpIdsRef.current.add('op')
 createConfirmedStreamHandler(s.deps)(s.payload)
 expect(s.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(s.deps.applyRemoteOp).toHaveBeenCalledOnce()
 const [op,read,input]=s.deps.applyRemoteOp.mock.calls[0];if(!input)throw Error('Missing original input')
 expect(input.operation).toBe(op);expect(input.read).toBe(read);expect(input.delivery.lifetime).toBe(s.read);input.delivery.assertCurrent(input)
 expect(s.deps.lastConfirmedSeqRef.current).toBe(3);expect(s.deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
})
it('refuses an unresolved legacy reveal before any canonical admission or legacy commit',()=>{
 const s=setup();s.deps.pendingPreviewsRef.current.add('legacy',2)
 createConfirmedStreamHandler(s.deps)(s.payload)
 expect(s.deps.requestFullResync).toHaveBeenCalledOnce();expect(s.deps.applyRemoteOp).not.toHaveBeenCalled();expect(s.deps.engineRef.current.dropPendingPreview).not.toHaveBeenCalled()
 expect(s.deps.pendingPreviewsRef.current.has('legacy')).toBe(true);expect(s.deps.lastConfirmedSeqRef.current).toBe(2)
})
it('does not turn a data-only scope into execution delivery or retain it in the replay gate',()=>{
 const s=setup(),hold=vi.fn(()=>false)
 createConfirmedStreamHandler({...s.deps,canonicalReadScope:{...s.expected,isCurrent:s.isCurrent},replayGate:{hold,setHandler:vi.fn()}})(s.payload)
 expect(hold).not.toHaveBeenCalled();expect(s.deps.applyRemoteOp).not.toHaveBeenCalled();expect(s.deps.requestFullResync).toHaveBeenCalledOnce()
})
it('keeps the original input through the existing gate and rejects its stale owner before application',()=>{
 const s=setup(),gate=createReplayGate<typeof s.payload>(),ticket=gate.begin()
 createConfirmedStreamHandler({...s.deps,replayGate:gate})(s.payload)
 expect(s.deps.applyRemoteOp).not.toHaveBeenCalled();s.isCurrent.mockReturnValue(false);gate.end(ticket)
 expect(s.deps.applyRemoteOp).not.toHaveBeenCalled();expect(s.deps.lastConfirmedSeqRef.current).toBe(2)
})

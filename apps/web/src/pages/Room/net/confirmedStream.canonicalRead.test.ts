import {expect,it,vi} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type Operation} from '@grafetto/shared'
import {createConfirmedStreamHandler,type ConfirmedStreamEngine} from './confirmedStream'
import {createPendingPreviews} from './pendingPreviews'
import {createReplayGate} from '../replayGate'
import {useRoomStore} from '../../../stores/roomStore'
vi.mock('../../../lib/observability/reportInvariant',()=>({reportInvariant:vi.fn()}))
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
function setup() {
  const engine: ConfirmedStreamEngine = {
    previewOperation: vi.fn(),
    dropPendingPreview: vi.fn(() => null),
  }
  const deps = {
    engineRef: { current: engine },
    lastConfirmedSeqRef: { current: 0 },
    latestKnownSeqRef: { current: 0 },
    appliedOpIdsRef: { current: new Set<string>() },
    pendingPreviewsRef: { current: createPendingPreviews() },
    catchingUpRef: { current: false },
    streamedStrokeIdsRef: { current: new Set<string>() },
    deferredOpsQueueRef: { current: [] as Operation[] },
    previewScheduleRef: { current: { noteOperation: vi.fn() } },
    confirmOwnOperation: vi.fn(),
    markLayerActive: vi.fn(),
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    requestFullResync: vi.fn(),
  }
  return { engine, deps, confirm: createConfirmedStreamHandler(deps) }
}

function current(){const f=fixture(),s=setup();s.deps.lastConfirmedSeqRef.current=2;s.deps.latestKnownSeqRef.current=2
 return {...s,...f,scope:{...f.expected,isCurrent:vi.fn(()=>true)},payload:{seq:3,operation:f.op,canonicalCapabilities:f.attachment}}}
it('rejects capability mismatch before review, replay queue, cursors or application',()=>{
 const s=current(),observe=vi.spyOn(useRoomStore.getState(),'observeReviewOperation'),hold=vi.fn(()=>false)
 observe.mockClear()
 const confirm=createConfirmedStreamHandler({...s.deps,canonicalReadScope:s.scope,replayGate:{hold,setHandler:vi.fn()}})
 const bad=structuredClone(s.payload);(bad.canonicalCapabilities.capabilities[0].snapshot as unknown as {pigmentRgb8:number[]}).pigmentRgb8=[9,8,7]
 confirm(bad)
 expect(observe).not.toHaveBeenCalled();expect(hold).not.toHaveBeenCalled();expect(s.deps.lastConfirmedSeqRef.current).toBe(2)
 expect(s.deps.applyRemoteOp).not.toHaveBeenCalled();expect(s.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(s.deps.requestFullResync).toHaveBeenCalledOnce()
 observe.mockRestore()
})
it('passes the immutable atomic read to the existing remote and own confirmation callbacks',()=>{
 const s=current(),confirm=createConfirmedStreamHandler({...s.deps,canonicalReadScope:s.scope})
 confirm(s.payload)
 const [op,read]=s.deps.applyRemoteOp.mock.calls[0]
 expect(op.id).toBe('op');expect(read.sequence).toBe(3);expect(Object.isFrozen(read.capability.snapshot)).toBe(true)
 const own=current();own.deps.appliedOpIdsRef.current.add('op')
 createConfirmedStreamHandler({...own.deps,canonicalReadScope:own.scope})(own.payload)
 expect(own.deps.confirmOwnOperation).toHaveBeenCalledWith(expect.objectContaining({id:'op'}),3,expect.objectContaining({sequence:3}))
 expect(own.deps.applyRemoteOp).not.toHaveBeenCalled()
})
it('holds the complete immutable attachment in the SAME replay gate and rechecks lifetime on release',()=>{
 const s=current(),gate=createReplayGate<typeof s.payload>();gate.begin()
 const confirm=createConfirmedStreamHandler({...s.deps,canonicalReadScope:s.scope,replayGate:gate})
 confirm(s.payload);expect(s.deps.applyRemoteOp).not.toHaveBeenCalled()
 ;(s.payload.canonicalCapabilities.capabilities[0].snapshot as unknown as {pigmentRgb8:number[]}).pigmentRgb8=[9,9,9]
 gate.end()
 expect(s.deps.applyRemoteOp).toHaveBeenCalledWith(expect.objectContaining({frame:expect.objectContaining({pigmentRgb8:[1,2,3]})}),expect.objectContaining({sequence:3}))
 const stale=current(),staleGate=createReplayGate<typeof stale.payload>();staleGate.begin()
 createConfirmedStreamHandler({...stale.deps,canonicalReadScope:stale.scope,replayGate:staleGate})(stale.payload)
 stale.scope.isCurrent.mockReturnValue(false);staleGate.end()
 expect(stale.deps.applyRemoteOp).not.toHaveBeenCalled();expect(stale.deps.lastConfirmedSeqRef.current).toBe(2)
})
it('requires both a captured room-state scope and a capability for the new read lane',()=>{
 const s=current();createConfirmedStreamHandler(s.deps)(s.payload)
 expect(s.deps.requestFullResync).toHaveBeenCalledOnce();expect(s.deps.lastConfirmedSeqRef.current).toBe(2)
 const missing=current();createConfirmedStreamHandler({...missing.deps,canonicalReadScope:missing.scope})({seq:3,operation:missing.op})
 expect(missing.deps.requestFullResync).toHaveBeenCalledOnce();expect(missing.deps.applyRemoteOp).not.toHaveBeenCalled()
})

it('captures immutable room-state fields instead of reading a later mutated caller scope',()=>{
 const s=current(),confirm=createConfirmedStreamHandler({...s.deps,canonicalReadScope:s.scope})
 s.scope.boardEpoch=99
 confirm(s.payload)
 expect(s.deps.applyRemoteOp).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({boardEpoch:2}))
 expect(s.deps.requestFullResync).not.toHaveBeenCalled()
})

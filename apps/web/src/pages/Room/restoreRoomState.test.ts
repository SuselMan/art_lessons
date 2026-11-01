import {indexedSocketFixture} from '../../engine/testing/canonicalIndexedReadFixture'
import { expect, it, vi } from 'vitest'
import type { Operation, OperationUndoOperation, OperationRedoOperation } from '@grafetto/shared'

import { createTestEngine, dab, makeStroke, readLayerPixels } from '../../engine/testing/engineTestUtils'
import { restoreRoomState, isCurrentIndexedRestoreOwner, type RestoreRoomStateDeps } from './restoreRoomState'
import { createPendingPreviews } from './net/pendingPreviews'
import { createReplayGate } from './replayGate'
import { createConfirmedStreamHandler } from './net/confirmedStream'
import { createSnapshotUploader } from './net/snapshotSync'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

it('seeds inclusive undo5 before tail redo6 using actual engine history and pixels', async () => {
  const target = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  const source = createTestEngine({ userId: 'A' }, { width: 8, height: 8 }).engine
  target.setBaseLayers(['L']); source.setBaseLayers(['L'])
  const colour = { ...makeStroke('A', 'L', [dab(6, 4, { size: 4, opacity: 0.5 })]), seq: 3 }
  const undo: OperationUndoOperation = { type: 'operation_undo', id: 'u5', userId: 'A', timestamp: 5, seq: 5, targetOpId: colour.id }
  const redo: OperationRedoOperation = { type: 'operation_redo', id: 'r6', userId: 'A', timestamp: 6, seq: 6, targetOpId: colour.id }
  const ops: Operation[] = [
    { ...makeStroke('A', 'L', [dab(2, 4, { size: 4, opacity: 0.5 })]), seq: 1 },
    { ...makeStroke('B', 'L', [dab(4, 4, { size: 4, opacity: 0.5 })]), seq: 2 }, colour,
    { type: 'paper_dry', id: 'd4', userId: 'A', timestamp: 4, seq: 4 }, undo, redo,
  ]
  for (const op of ops) source.appendOperation(op, 'remote')
  const applied: string[] = []
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', restoreFromSnapshot: vi.fn().mockResolvedValue('restored'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp(op) {
      if (op.id === redo.id) expect(target.getOperations().some(o => o.id === colour.id)).toBe(false)
      applied.push(op.id); target.appendOperation(op, 'remote')
    },
    syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
    setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(),
    getSnapshotUploader: () => null, latestKnownSeqRef: { current: 6 }, replayIncompleteRef: { current: false },
    pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  await restoreRoomState(target, { latestSnapshotSeq: 5, tailOperations: ops, participants: [], palette: [], frozen: false }, { mode: 'join', alreadyHadSeq: 0 }, deps)
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  expect(applied).toEqual(['r6'])
  // Ordinary backfill receives an inclusive snapshot seq; its hook converts
  // that boundary to the exclusive history API cursor.
  expect(deps.backfillHistory).toHaveBeenCalledWith('room', target, 5)
  expect([...readLayerPixels(target, 'L')!]).toEqual([...readLayerPixels(source, 'L')!])
  expect(target.getOperationsSinceRestore().map(op => op.id)).toEqual(['r6'])
})


it.each([
  { name: 'opt-in complete fresh join', enabled: true, mode: 'join' as const, already: 0, snapshot: null, head: 3, paints: 1 },
  { name: 'default OFF', enabled: false, mode: 'join' as const, already: 0, snapshot: null, head: 3, paints: 2 },
  { name: 'catch-up', enabled: true, mode: 'catchup' as const, already: 0, snapshot: null, head: 3, paints: 2 },
  { name: 'already held history', enabled: true, mode: 'join' as const, already: 1, snapshot: null, head: 3, paints: 2 },
  { name: 'snapshot authority present', enabled: true, mode: 'join' as const, already: 0, snapshot: 0, head: 3, paints: 2 },
  { name: 'tail does not reach known head', enabled: true, mode: 'join' as const, already: 0, snapshot: null, head: 4, paints: 2 },
])('clear-prefix gate: $name preserves real history and later undo of clear', async test => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  engine.setBaseLayers(['L'])
  const wc = (x: number, seq: number): Operation => ({
    ...makeStroke('A', 'L', [dab(x, 4, { size: 2, opacity: 0.5 })]),
    tool: 'watercolor', preset: 'normal:100:60:PB29:round', strokeId: 'gesture-' + seq, seq,
  })
  const before = wc(2, 1), after = wc(6, 3)
  const clear: Operation = { id: 'clear2', type: 'layer_clear', layerId: 'L', userId: 'A', timestamp: 2, seq: 2 }
  const ops = [before, clear, after]
  const internals = engine as unknown as { _paintDabs: (...args: unknown[]) => unknown; _startRebuildJob: (...args: unknown[]) => unknown; _log: { entries: Array<{op: Operation; state: string}>; layerPixelOps: (id: string) => Operation[] } }
  const paint = vi.spyOn(internals, '_paintDabs')
  const replay = vi.spyOn(internals, '_startRebuildJob')
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', diagnosticClearPrefixElision: test.enabled,
    restoreFromSnapshot: vi.fn().mockResolvedValue('none'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp: op => { engine.appendOperation(op, 'remote') }, syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(),
    dispatchParticipants: vi.fn(), setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(),
    notifyReplayIncomplete: vi.fn(), getSnapshotUploader: () => null, latestKnownSeqRef: { current: test.head },
    replayIncompleteRef: { current: false }, pendingPreviewsRef: { current: createPendingPreviews() },
    openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  await restoreRoomState(engine, { latestSnapshotSeq: test.snapshot, tailOperations: ops, participants: [], palette: [], frozen: false }, { mode: test.mode, alreadyHadSeq: test.already }, deps)
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  expect(paint).toHaveBeenCalledTimes(test.paints)
  expect(engine.getOperations().map(op => op.id)).toEqual(ops.map(op => op.id))
  expect(internals._log.entries.find(q => q.op.id === before.id)?.state).toBe('done')
  engine.appendOperation({ id: 'undo-clear', type: 'operation_undo', userId: 'A', timestamp: 4, seq: 4, targetOpId: clear.id }, 'remote')
  expect(replay).toHaveBeenCalledWith('L')
  expect(internals._log.layerPixelOps('L').some(op => op.id === before.id)).toBe(true)
  engine.appendOperation({ id: 'redo-clear', type: 'operation_redo', userId: 'A', timestamp: 5, seq: 5, targetOpId: clear.id }, 'remote')
  expect(replay).toHaveBeenCalledTimes(2)
  expect(internals._log.layerPixelOps('L').some(op => op.id === clear.id)).toBe(true)
  expect(engine.getOperations().some(op => op.id === before.id)).toBe(true)
  engine.destroy()
})


it('drains the real confirmed stream before requesting first snapshot at the advanced watermark', async () => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  engine.setBaseLayers(['L'])
  const before: Operation = { ...makeStroke('A', 'L', [dab(2, 4)]), tool: 'watercolor', strokeId: 'before', seq: 1 }
  const clear: Operation = { id: 'clear2', type: 'layer_clear', layerId: 'L', userId: 'A', timestamp: 2, seq: 2 }
  const after: Operation = { ...makeStroke('A', 'L', [dab(6, 4)]), tool: 'watercolor', strokeId: 'after', seq: 3 }
  const undo: OperationUndoOperation = { id: 'peerUndo4', type: 'operation_undo', userId: 'A', timestamp: 4, targetOpId: clear.id }
  const latestKnownSeqRef = { current: 3 }, lastConfirmedSeqRef = { current: 3 }
  const replayGate = createReplayGate<{ seq: number; operation: Operation }>()
  const pendingPreviewsRef = { current: createPendingPreviews() }
  const appliedOpIdsRef = { current: new Set<string>() }
  const apply = (op: Operation) => {
    if (op.id === undo.id) expect((engine as unknown as { _skippedInBatch: Set<string> })._skippedInBatch.size).toBe(0)
    appliedOpIdsRef.current.add(op.id); engine.appendOperation(op, 'remote')
  }
  const resync = vi.fn(), uploader = createSnapshotUploader('room')
  const arm = vi.spyOn(uploader, 'requestFirstSnapshot')
  const observe = vi.spyOn(uploader, 'onSeqObserved')
  const confirm = createConfirmedStreamHandler({
    engineRef: { current: engine }, latestKnownSeqRef, lastConfirmedSeqRef, replayGate, pendingPreviewsRef, appliedOpIdsRef,
    catchingUpRef: { current: false }, streamedStrokeIdsRef: { current: new Set<string>() }, deferredOpsQueueRef: { current: [] },
    previewScheduleRef: { current: null }, confirmOwnOperation: vi.fn(), markLayerActive: vi.fn(),
    applyRemoteOp: apply, syncFromLog: vi.fn(), checkSnapshotBoundary: vi.fn(), requestFullResync: resync,
  })
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', diagnosticClearPrefixElision: true,
    restoreFromSnapshot: vi.fn().mockResolvedValue('none'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp(op) { apply(op); if (op.id === before.id) { confirm({ seq: 4, operation: undo }); expect(latestKnownSeqRef.current).toBe(3) } },
    syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(), setRestoreFailure: vi.fn(),
    setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(), getSnapshotUploader: () => uploader,
    latestKnownSeqRef, replayIncompleteRef: { current: false }, pendingPreviewsRef, openTimerRef: { current: null },
    replayGate: replayGate as RestoreRoomStateDeps['replayGate'],
  }
  try {
    await restoreRoomState(engine, { latestSnapshotSeq: null, tailOperations: [before, clear, after], participants: [], palette: [], frozen: false }, { mode: 'join', alreadyHadSeq: 0 }, deps)
    expect(deps.setRestoreFailure).not.toHaveBeenCalled(); expect(resync).not.toHaveBeenCalled()
    expect(lastConfirmedSeqRef.current).toBe(4); expect(latestKnownSeqRef.current).toBe(4)
    expect(arm).toHaveBeenCalledOnce(); expect(observe.mock.calls[0]?.slice(0, 2)).toEqual([0, 4])
    const log = (engine as unknown as { _log: { entries: Array<{ op: Operation; state: string }> } })._log.entries
    expect(log.map(q => q.op.id)).toEqual([before.id, clear.id, after.id, undo.id])
    expect(log.find(q => q.op.id === clear.id)?.state).toBe('undone')
  } finally { engine.destroy() }
})

it.each(['restored', 'failed'] as const)('records only successfully restored server history for reconnect (%s, #739)', async status => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  const op: Operation = { type: 'layer_add', id: 'layer6', seq: 106048, userId: 'A', timestamp: 6, layerId: 'L', name: 'Layer' }
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', restoreFromSnapshot: vi.fn().mockResolvedValue(status), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp: vi.fn(), syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
    setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(),
    getSnapshotUploader: () => null, latestKnownSeqRef: { current: 0 }, replayIncompleteRef: { current: false },
    pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  try {
    await restoreRoomState(engine, { latestSnapshotSeq: 106000, tailOperations: [op], participants: [], palette: [], frozen: false },
      { mode: 'join', alreadyHadSeq: 0 }, deps)
    expect(deps.latestKnownSeqRef.current).toBe(status === 'restored' ? 106048 : 0)
    if (status === 'restored') {
      await restoreRoomState(engine, { latestSnapshotSeq: 106000, tailOperations: [], participants: [], palette: [], frozen: false },
        { mode: 'catchup', alreadyHadSeq: deps.latestKnownSeqRef.current }, deps)
      expect(deps.restoreFromSnapshot).toHaveBeenCalledOnce()
    }
  } finally { engine.destroy() }
})

it('an older actual restore cannot release a newer restore gate or publish failure/ready after yielding',async()=>{
 const engine=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 let resolveA!:()=>void,resolveB!:()=>void
 const a=new Promise<void>(yes=>{resolveA=yes}),b=new Promise<void>(yes=>{resolveB=yes})
 vi.spyOn(engine,'preloadImages').mockReturnValueOnce(a).mockReturnValueOnce(b)
 const resume=vi.spyOn(engine,'resumeDisplay'),gate=createReplayGate<unknown>(),seen:unknown[]=[]
 gate.setHandler(value=>{seen.push(value)})
 const makeDeps=():RestoreRoomStateDeps=>({
  boardId:'room',restoreFromSnapshot:vi.fn().mockResolvedValue('none'),backfillHistory:vi.fn().mockResolvedValue(undefined),
  applyRemoteOp:vi.fn(),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),
  setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,
  latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},
  openTimerRef:{current:null},replayGate:gate,
 })
 const old=makeDeps(),next=makeDeps(),state={latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false}
 try{
  const restoreA=restoreRoomState(engine,state,{mode:'join',alreadyHadSeq:0},old)
  expect(gate.hold('before-B')).toBe(true)
  const restoreB=restoreRoomState(engine,state,{mode:'catchup',alreadyHadSeq:0},next)
  expect(gate.hold('during-B')).toBe(true)
  resolveA();await restoreA
  expect(seen).toEqual([]);expect(gate.hold('after-A')).toBe(true)
  expect(old.setRestoreFailure).not.toHaveBeenCalled();expect(old.replayIncompleteRef.current).toBe(false)
  expect(old.syncFromLogNow).not.toHaveBeenCalled();expect(old.markJoinRestoreDone).not.toHaveBeenCalled()
  expect(old.setRoomContentReady).not.toHaveBeenCalled();expect(old.finishOpenTimer).not.toHaveBeenCalled()
  expect(resume).toHaveBeenCalledOnce()
  resolveB();await restoreB
  expect(seen).toEqual(['before-B','during-B','after-A']);expect(gate.hold('after-B')).toBe(false)
  expect(next.setRestoreFailure).not.toHaveBeenCalled();expect(next.setRoomContentReady).toHaveBeenCalledExactlyOnceWith(true)
  expect(next.syncFromLogNow).toHaveBeenCalledOnce();expect(resume).toHaveBeenCalledTimes(2)
 }finally{resolveA();resolveB();engine.destroy()}
})

import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from './net/canonicalRoomState'
function baseFixture(){
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
function baseState(){
 const f=baseFixture()
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment}
 return {state,f}
}

function emptyRestoreFixture(empty=false){
 const {state:s,f}=baseState();let current=true
 s.tailOperations=empty?[]:[{...f.op,seq:1},{...f.op,id:'other-op',seq:2,userId:'other',frame:{...f.op.frame,strokeId:'other-stroke'}}]
 if(empty)s.canonicalCapabilities=undefined
 else s.canonicalCapabilities={...f.attachment,capabilities:[f.attachment.capabilities[0],{originalUserId:'other',snapshot:{...f.attachment.capabilities[0].snapshot,strokeId:'other-stroke'}}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0},{operationId:'other-op',sequence:2,originalUserId:'other',capability:1}]}
 s.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:s.tailOperations.length,operationCount:s.tailOperations.length}
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current})
 const engine=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 const sink=vi.fn(async()=>{})
 const deps:RestoreRoomStateDeps={boardId:'room',restoreFromSnapshot:vi.fn(),backfillHistory:vi.fn(),applyRemoteOp:vi.fn(),restoreCanonicalEmptyRoom:sink,syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:vi.fn(()=>null),latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 return{prepared,engine,deps,sink,expire:()=>{current=false}}
}
it.each([false,true])('hands the full original baseline to one transaction, including empty=%s',async empty=>{
 const f=emptyRestoreFixture(empty),preload=vi.spyOn(f.engine,'preloadImages'),unpainted=vi.spyOn(f.engine,'setUnpaintedInBatch')
 try{await restoreRoomState(f.engine,f.prepared,{mode:'join',alreadyHadSeq:0},f.deps)
 expect(f.sink).toHaveBeenCalledExactlyOnceWith(f.engine,f.prepared.canonicalRead,f.prepared.tailOperations)
 expect(preload).not.toHaveBeenCalled();expect(unpainted).not.toHaveBeenCalled();expect(f.deps.applyRemoteOp).not.toHaveBeenCalled()
 expect(f.deps.latestKnownSeqRef.current).toBe(empty?0:2);expect(f.deps.setRoomContentReady).toHaveBeenCalledWith(true)
 expect(f.deps.getSnapshotUploader).not.toHaveBeenCalled()
 }finally{f.engine.destroy()}
})
it.each(['stale','throw','superseded'] as const)('fails whole canonical baseline restore after %s transaction without readiness/cursor',async kind=>{
 const f=emptyRestoreFixture(),suspend=vi.spyOn(f.engine,'suspendDisplay'),resume=vi.spyOn(f.engine,'resumeDisplay')
 f.sink.mockImplementation(async()=>{await Promise.resolve();if(kind==='stale')f.expire();if(kind==='throw')throw Error('transaction failed');if(kind==='superseded')f.deps.replayGate.begin()})
 try{await restoreRoomState(f.engine,f.prepared,{mode:'join',alreadyHadSeq:0},f.deps)
 expect(f.deps.syncFromLogNow).not.toHaveBeenCalled();expect(f.deps.latestKnownSeqRef.current).toBe(0);expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
 expect(suspend).toHaveBeenCalledTimes(1);expect(resume).toHaveBeenCalledTimes(1)
 }finally{f.engine.destroy()}
})

it.each(['sink','engine','snapshot','catchup','cursor','pending','copy','stale'] as const)('rejects invalid full-baseline %s before any restore side effect',async kind=>{
 const f=emptyRestoreFixture(),begin=vi.spyOn(f.deps.replayGate,'begin'),suspend=vi.spyOn(f.engine,'suspendDisplay'),remove=vi.spyOn(f.deps.pendingPreviewsRef.current,'remove')
 const state=kind==='copy'?{...f.prepared,tailOperations:[...f.prepared.tailOperations]}:kind==='snapshot'?{...f.prepared,latestSnapshotSeq:1}:f.prepared
 if(kind==='sink')f.deps.restoreCanonicalEmptyRoom=undefined
 if(kind==='pending')f.deps.pendingPreviewsRef.current.add('pending',3)
 if(kind==='stale')f.expire()
 try{await expect(restoreRoomState(kind==='engine'?null:f.engine,state,{mode:kind==='catchup'?'catchup':'join',alreadyHadSeq:kind==='cursor'?1:0},f.deps)).rejects.toThrow()
 expect(begin).not.toHaveBeenCalled();expect(suspend).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(f.sink).not.toHaveBeenCalled()
 expect(f.deps.dispatchParticipants).not.toHaveBeenCalled();expect(f.deps.setRoomContentReady).not.toHaveBeenCalled();expect(f.deps.latestKnownSeqRef.current).toBe(0)
 }finally{f.engine.destroy()}
})
it('rechecks the original baseline owner after replay drain callbacks before publishing readiness',async()=>{
 const f=emptyRestoreFixture()
 f.deps.replayGate.setHandler(()=>f.expire())
 f.sink.mockImplementation(async()=>{f.deps.replayGate.hold('held')})
 try{await restoreRoomState(f.engine,f.prepared,{mode:'join',alreadyHadSeq:0},f.deps)
 expect(f.deps.syncFromLogNow).not.toHaveBeenCalled();expect(f.deps.latestKnownSeqRef.current).toBe(0);expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
 }finally{f.engine.destroy()}
})

function fullRestoreFixture(){
 const f=emptyRestoreFixture(),{state:s}=baseState();let current=true
 s.tailOperations=[{...s.tailOperations[0],seq:1},
  {type:'operation_undo',id:'undo',userId:'author',timestamp:2,seq:2,targetOpId:'op'},
  {type:'operation_redo',id:'redo',userId:'author',timestamp:3,seq:3,targetOpId:'undo'}]
 s.canonicalCapabilities={...s.canonicalCapabilities!,bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:3,operationCount:3}
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current})
 return {...f,prepared,expire:()=>{current=false}}
}
it('routes original full V2 frame/undo/redo history to the same single atomic baseline sink',async()=>{
 const f=fullRestoreFixture(),preload=vi.spyOn(f.engine,'preloadImages')
 try{
  await restoreRoomState(f.engine,f.prepared,{mode:'join',alreadyHadSeq:0},f.deps)
  expect(f.sink).toHaveBeenCalledExactlyOnceWith(f.engine,f.prepared.canonicalRead,f.prepared.tailOperations)
  expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(preload).not.toHaveBeenCalled()
  expect(f.deps.backfillHistory).not.toHaveBeenCalled();expect(f.deps.restoreFromSnapshot).not.toHaveBeenCalled()
  expect(f.deps.latestKnownSeqRef.current).toBe(3);expect(f.deps.setRoomContentReady).toHaveBeenCalledWith(true)
  expect(f.deps.getSnapshotUploader).not.toHaveBeenCalled()
 }finally{f.engine.destroy()}
})
it.each(['sink','copy','stale','catchup','pending']as const)('rejects unavailable original full V2 baseline (%s) before side effects',async kind=>{
 const f=fullRestoreFixture(),begin=vi.spyOn(f.deps.replayGate,'begin'),suspend=vi.spyOn(f.engine,'suspendDisplay')
 if(kind==='sink')f.deps.restoreCanonicalEmptyRoom=undefined
 if(kind==='stale')f.expire()
 if(kind==='pending')f.deps.pendingPreviewsRef.current.add('pending',1)
 try{
  await expect(restoreRoomState(f.engine,kind==='copy'?{...f.prepared,tailOperations:[...f.prepared.tailOperations]}:f.prepared,{mode:kind==='catchup'?'catchup':'join',alreadyHadSeq:0},f.deps)).rejects.toThrow()
  expect(begin).not.toHaveBeenCalled();expect(suspend).not.toHaveBeenCalled();expect(f.sink).not.toHaveBeenCalled()
  expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.setRoomContentReady).not.toHaveBeenCalled()
 }finally{f.engine.destroy()}
})
it.each(['stale','throw','superseded']as const)('does not publish full V2 baseline after %s while atomic sink yields',async kind=>{
 const f=fullRestoreFixture(),resume=vi.spyOn(f.engine,'resumeDisplay')
 f.sink.mockImplementation(async()=>{await Promise.resolve();if(kind==='stale')f.expire();if(kind==='throw')throw Error('atomic failed');if(kind==='superseded')f.deps.replayGate.begin()})
 try{
  await restoreRoomState(f.engine,f.prepared,{mode:'join',alreadyHadSeq:0},f.deps)
  expect(f.sink).toHaveBeenCalledOnce();expect(resume).toHaveBeenCalledOnce()
  expect(f.deps.latestKnownSeqRef.current).toBe(0);expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
  expect(f.deps.applyRemoteOp).not.toHaveBeenCalled();expect(f.deps.syncFromLogNow).not.toHaveBeenCalled()
 }finally{f.engine.destroy()}
})

it('restores indexed admission through one original cursor sink without legacy tail or uploader',async()=>{
 const f=emptyRestoreFixture(),issuer=indexedSocketFixture(),read=await issuer.open()
 const sink=vi.fn(async()=>{read.assertCurrent(read)})
 f.deps.restoreCanonicalIndexedRoom=sink
 const state={canonicalIndexedRead:read,latestSnapshotSeq:null,participants:[],palette:[],frozen:false}
 try{
  await restoreRoomState(f.engine,state,{mode:'join',alreadyHadSeq:0},f.deps)
  expect(sink).toHaveBeenCalledExactlyOnceWith(f.engine,read,expect.any(Function))
  expect(f.sink).not.toHaveBeenCalled()
  expect(f.deps.applyRemoteOp).not.toHaveBeenCalled()
  expect(f.deps.restoreFromSnapshot).not.toHaveBeenCalled()
  expect(f.deps.backfillHistory).not.toHaveBeenCalled()
  expect(f.deps.getSnapshotUploader).not.toHaveBeenCalled()
  expect(f.deps.latestKnownSeqRef.current).toBe(1)
  expect(f.deps.setRoomContentReady).toHaveBeenCalledWith(true)
 }finally{f.engine.destroy()}
})

it.each(['stale','throw','superseded']as const)('does not announce indexed content after %s restore',async kind=>{
 const f=emptyRestoreFixture(),issuer=indexedSocketFixture(),read=await issuer.open()
 f.deps.restoreCanonicalIndexedRoom=vi.fn(async()=>{
  await Promise.resolve()
  if(kind==='stale')issuer.setCurrent(false)
  if(kind==='throw')throw Error('Indexed restore failed')
  if(kind==='superseded')f.deps.replayGate.begin()
 })
 try{
  await restoreRoomState(f.engine,{canonicalIndexedRead:read,latestSnapshotSeq:null,participants:[],palette:[],frozen:false},{mode:'join',alreadyHadSeq:0},f.deps)
  expect(f.deps.latestKnownSeqRef.current).toBe(0)
  expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
  expect(f.deps.syncFromLogNow).not.toHaveBeenCalled()
  expect(f.sink).not.toHaveBeenCalled()
 }finally{f.engine.destroy()}
})

it.each(['current','origin-expired','engine-replaced','origin-replaced','board-changed','unjoined','absent-guard'] as const)('reports cancelled indexed failure only for current original owner: %s',async kind=>{
 const f=emptyRestoreFixture(),issuer=indexedSocketFixture(),read=await issuer.open()
 let actualEngine:unknown=f.engine,actualOrigin:unknown=read.lifetime,board='room',joined=true
 f.deps.isIndexedRestoreOwnerCurrent=kind==='absent-guard'?undefined:(engine,input)=>actualEngine===engine&&actualOrigin===input.lifetime&&board===input.scope.roomId&&joined
 f.deps.restoreCanonicalIndexedRoom=vi.fn(async()=>{
  await read.cancel()
  if(kind==='origin-expired')issuer.setCurrent(false)
  if(kind==='engine-replaced')actualEngine=null
  if(kind==='origin-replaced')actualOrigin=null
  if(kind==='board-changed')board='other-board'
  if(kind==='unjoined')joined=false
  throw Error('Actual indexed sink failed after finite cleanup')
 })
 try{
  await restoreRoomState(f.engine,{canonicalIndexedRead:read,latestSnapshotSeq:null,participants:[],palette:[],frozen:false},{mode:'join',alreadyHadSeq:0},f.deps)
  if(kind==='current'){expect(f.deps.setRestoreFailure).toHaveBeenCalledExactlyOnceWith('apply');expect(f.deps.replayIncompleteRef.current).toBe(true)}
  else{expect(f.deps.setRestoreFailure).not.toHaveBeenCalled();expect(f.deps.replayIncompleteRef.current).toBe(false)}
  expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true);expect(f.deps.latestKnownSeqRef.current).toBe(0)
 }finally{f.engine.destroy()}
})
it('checks owner identity again after original current callback reenters replacement',async()=>{
 const f=emptyRestoreFixture(),issuer=indexedSocketFixture();let owner=true,replace=false
 const {openCanonicalIndexedRoomForSocket}=await import('./net/canonicalIndexedRead')
 const read=await openCanonicalIndexedRoomForSocket(issuer.socket,issuer.offer,{expectedBoardId:'room',isCurrent:()=>{if(replace)owner=false;return true}})
 await read.cancel();const guard=vi.fn(()=>owner)
 try{replace=true;expect(isCurrentIndexedRestoreOwner(f.engine,read,guard)).toBe(false);expect(guard).toHaveBeenCalledTimes(2)}finally{f.engine.destroy()}
})

it.each(['sink-rejected','end-failed','owner-callback-superseded'] as const)('retains failure ticket identity without gate release probing: %s',async kind=>{
 const f=emptyRestoreFixture(),issuer=indexedSocketFixture(),read=await issuer.open()
 f.deps.isIndexedRestoreOwnerCurrent=()=>{if(kind==='owner-callback-superseded')f.deps.replayGate.begin();return true}
 f.deps.restoreCanonicalIndexedRoom=vi.fn(async()=>{
  if(kind==='end-failed'){f.deps.replayGate.setHandler(()=>{throw Error('Own gate drain failed')});f.deps.replayGate.hold({});return}
  await read.cancel();if(kind==='sink-rejected')f.deps.replayGate.begin();throw Error('Old indexed sink failed')
 })
 try{
  await restoreRoomState(f.engine,{canonicalIndexedRead:read,latestSnapshotSeq:null,participants:[],palette:[],frozen:false},{mode:'join',alreadyHadSeq:0},f.deps)
  if(kind==='end-failed'){expect(f.deps.setRestoreFailure).toHaveBeenCalledExactlyOnceWith('apply');expect(f.deps.replayIncompleteRef.current).toBe(true)}
  else{expect(f.deps.setRestoreFailure).not.toHaveBeenCalled();expect(f.deps.replayIncompleteRef.current).toBe(false)}
  expect(f.deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
 }finally{f.engine.destroy()}
})

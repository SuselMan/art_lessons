import {prepareCanonicalRoomState} from './canonicalRoomState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanonicalStrokeOperation,CanonicalStrokeSnapshotV2,CanonicalRecordedAttachmentV1,ServerToClientEvents } from '@grafetto/shared'
import type { QueryClient } from '@tanstack/react-query'

import type { PencilEngineAPI } from '../../../engine'
import { prepareCanonicalImageAssets,prepareBrushPresets,setBrushRoomScope,loadBrushLibrary } from '../../../lib/api/brushLibrary'
import { dismissNotice, notifyError } from '../../../stores/noticeStore'
import { noteBanned } from '../../../lib/api/banned'
import { createPendingPreviews } from './pendingPreviews'
import { connectRoomSocket, type RoomSocket, type RoomSocketDeps } from './roomSocket'

vi.mock('../../../lib/api/banned', () => ({ BANNED_ERROR_CODE: 'banned', noteBanned: vi.fn() }))

vi.mock('../../../lib/api/brushLibrary', () => ({ prepareCanonicalImageAssets:vi.fn(async()=>{}), prepareBrushPresets: vi.fn(() => null), setBrushRoomScope: vi.fn(), loadBrushLibrary: vi.fn(async () => {}) }))
vi.mock('../../../stores/noticeStore', () => ({ notifyError: vi.fn(() => 'brush-notice'), dismissNotice: vi.fn() }))
beforeEach(() => { vi.mocked(prepareBrushPresets).mockReset().mockReturnValue(null);vi.mocked(prepareCanonicalImageAssets).mockReset().mockResolvedValue(undefined) })

/** (#493) The room socket's own lifecycle — what is wired, what a teardown
 *  undoes, how a refused handshake is read. The handlers themselves have their
 *  own tests (joinFlow, roomStateHandler, confirmedStream, peerEvents,
 *  boardEvents, roomControlEvents); this is the table that binds them. */

type Listener = (...args: never[]) => void

function fakeSocket() {
  const listeners = new Map<string, Listener>()
  const fake = {
    active: true,
    connected: false,
    on: (event: string, listener: Listener) => { listeners.set(event, listener); return fake },
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  // A structural stand-in: the handlers only ever call on/emit/disconnect,
  // and revival reads `active` and calls `connect`.
  return { socket: fake as unknown as RoomSocket, fake, listeners }
}

function setup() {
  const { socket, fake, listeners } = fakeSocket()
  const onConnectionChange = vi.fn()
  const deps: RoomSocketDeps = {
    sessionId: 'L', isCreator: false, creatorDraft: undefined,
    openSocket: () => socket,
    onConnectionChange,
    engineRef: { current: null as PencilEngineAPI | null },
    socketRef: { current: null },
    switchBoardRef: { current: null },
    requestFullResyncRef: { current: null },
    outboxRef: { current: { resendAll: vi.fn(async () => {}), whenIdle: vi.fn(async () => {}) } },
    boardIdRef: { current: 'L' },
    wantedBoardRef: { current: 'B2' },
    socketBoardRef: { current: 'L' },
    isOwnerRef: { current: false },
    roomContentReadyRef: { current: false },
    hasJoinedRef: { current: false },
    lastJoinAttemptRef: { current: null },
    myDisplayNameRef: { current: 'Ann' },
    tRef: { current: (key: string) => key },
    retryJoinRef: { current: () => {} },
    setJoinState: vi.fn(),
    queryClient: {} as QueryClient,
    firstRoomStateReceivedRef: { current: true },
    awaitingSeededBoardStateRef: { current: false },
    pendingSnapshotRef: { current: null },
    snapshotGateRef: { current: { restoreStarted: vi.fn() } },
    previewScheduleRef: { current: null },
    replaceUrl: vi.fn(),
    applyIdentity: vi.fn(),
    setRoomContentReady: vi.fn(),
    enterBoard: vi.fn(),
    awaitPaper: vi.fn(async () => true),
    markJoinRestoreDone: vi.fn(),
    clearRestoreFailure: vi.fn(),
    restoreCatchup: vi.fn(async () => {}),
    appliedOpIdsRef: { current: new Set() },
    lastConfirmedSeqRef: { current: 0 },
    latestKnownSeqRef: { current: 0 },
    pendingPreviewsRef: { current: createPendingPreviews() },
    catchingUpRef: { current: false },
    streamedStrokeIdsRef: { current: new Set() },
    deferredOpsQueueRef: { current: [] },
    confirmOwnOperation: vi.fn(),
    markActive: vi.fn(),
    markLayerActive: vi.fn(),
    forgetDrawingActivity: vi.fn(),
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
  }
  return { deps, fake, listeners, onConnectionChange }
}

describe('connectRoomSocket (#493)', () => {
  it('locks the room and stops the socket when imported resources fail', async () => {
    const { deps, listeners, fake, onConnectionChange } = setup()
    const lock = vi.fn()
    deps.engineRef.current = { setLocked: lock } as unknown as PencilEngineAPI
    let reject!: (error: Error) => void
    const load = new Promise<void>((_resolve, no) => { reject = no })
    vi.mocked(prepareBrushPresets).mockReturnValueOnce(load)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const close = connectRoomSocket(deps)
    try {
      const live = listeners.get('peer_stroke_live') as ServerToClientEvents['peer_stroke_live']
      live({ preset: 'imported-a@1' } as Parameters<ServerToClientEvents['peer_stroke_live']>[0])
      reject(new Error('unavailable'))
      await load.catch(() => {})
      expect(onConnectionChange).toHaveBeenLastCalledWith(false)
      expect(lock).toHaveBeenCalledWith(true)
      expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
      expect(notifyError).toHaveBeenCalledWith('brushLibrary.error', { key: 'brush-library', durationMs: null, action: { label: 'common.retry', onClick: expect.any(Function) } })
      expect(fake.disconnect).toHaveBeenCalledOnce()
      expect(fake.emit).not.toHaveBeenCalled()
    } finally { close(); errorLog.mockRestore() }
  })

  it('retries a failed brush stream explicitly with a fresh gate and ignores discarded or disposed work', async () => {
    const { deps, listeners, fake } = setup()
    const end = vi.fn()
    deps.hasJoinedRef.current = true
    deps.lastJoinAttemptRef.current = { name: 'Ann' }
    deps.engineRef.current = { setLocked: vi.fn(), endPeerLiveStroke: end } as unknown as PencilEngineAPI
    let reject!: (error: Error) => void
    const failed = new Promise<void>((_yes, no) => { reject = no })
    vi.mocked(prepareBrushPresets).mockReturnValueOnce(failed)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const close = connectRoomSocket(deps)
    const receive = listeners.get('peer_stroke_live_end') as ServerToClientEvents['peer_stroke_live_end']
    try {
      receive({ userId: 'peer', strokeId: 'discarded' })
      receive({ userId: 'peer', strokeId: 'queued-old' })
      reject(new DOMException('metadata deadline', 'TimeoutError'))
      await failed.catch(() => {})
      receive({ userId: 'peer', strokeId: 'after-failure' })
      expect(end).not.toHaveBeenCalled()
      expect(fake.connect).not.toHaveBeenCalled() // No automatic retry.
      const retry = vi.mocked(notifyError).mock.calls.at(-1)![1]!.action!.onClick
      retry(); retry()
      expect(fake.connect).toHaveBeenCalledOnce()
      const connected = listeners.get('connect') as () => void
      connected()
      expect(fake.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({ name: 'Ann' }), expect.any(Function))
      expect(errorLog).toHaveBeenCalledWith('Imported brush preparation failed', 'TimeoutError: metadata deadline')
      expect(dismissNotice).toHaveBeenCalledWith('brush-notice')
      receive({ userId: 'peer', strokeId: 'fresh' })
      expect(end).toHaveBeenCalledExactlyOnceWith('peer', 'fresh')
      let resolve!: () => void
      const pending = new Promise<void>(yes => { resolve = yes })
      vi.mocked(prepareBrushPresets).mockReturnValueOnce(pending)
      receive({ userId: 'peer', strokeId: 'late-after-close' })
      close()
      resolve(); await pending
      retry()
      expect(end).toHaveBeenCalledTimes(1)
      expect(fake.connect).toHaveBeenCalledTimes(1)
    } finally { close(); errorLog.mockRestore() }
  })

  it('answers every event the page handles, and not peer_cursor (#152)', () => {
    const { deps, listeners } = setup()
    connectRoomSocket(deps)
    expect([...listeners.keys()].sort()).toEqual([
      'active_board_changed', 'board_created', 'board_deleted', 'board_renamed', 'board_thumbnail_updated',
      'boards_reordered', 'connect', 'connect_error', 'disconnect', 'join_request_created', 'join_request_resolved',
      'kicked', 'lesson_state', 'operation_confirmed', 'palette_updated', 'participant_frozen_changed',
      'participant_hand_changed', 'peer_board_changed', 'peer_joined', 'peer_left', 'peer_stroke_live',
      'peer_stroke_live_end', 'room_closed_changed', 'room_frozen_changed', 'room_state', 'room_tools_changed',
    ])
  })

  it('publishes the socket, a page turn and the resync, and starts a fresh first room_state', () => {
    const { deps } = setup()
    connectRoomSocket(deps)
    expect(deps.socketRef.current).not.toBeNull()
    expect(deps.switchBoardRef.current).toBeTypeOf('function')
    expect(deps.requestFullResyncRef.current).toBeTypeOf('function')
    expect(deps.firstRoomStateReceivedRef.current).toBe(false)
  })

  it('takes all of it back on teardown', () => {
    const { deps, fake } = setup()
    const close = connectRoomSocket(deps)
    close()
    expect(fake.disconnect).toHaveBeenCalled()
    expect(deps.socketRef.current).toBeNull()
    expect(deps.switchBoardRef.current).toBeNull()
    expect(deps.requestFullResyncRef.current).toBeNull()
    expect(deps.socketBoardRef.current).toBeNull()
    expect(deps.wantedBoardRef.current).toBeNull()
  })

  it('reports the connection going up and down', () => {
    const { deps, listeners, onConnectionChange } = setup()
    connectRoomSocket(deps)
    listeners.get('connect')?.()
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
    const disconnect = listeners.get('disconnect') as ((reason: string) => void) | undefined
    disconnect?.('transport close')
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)
  })

  it('sends the whole app to the ban screen on a banned handshake, and only then (#587)', () => {
    const { deps, listeners } = setup()
    connectRoomSocket(deps)
    const connectError = listeners.get('connect_error') as ((err: Error) => void) | undefined
    connectError?.(new Error('xhr poll error'))
    expect(noteBanned).not.toHaveBeenCalled()
    connectError?.(new Error('banned'))
    expect(noteBanned).toHaveBeenCalledTimes(1)
  })
})
it('rejects a wrong room-state capability before brush scope/load, queues, refs or replay handlers',()=>{
 const {deps,listeners}=setup()
 deps.prepareCanonicalRoomState=state=>prepareCanonicalRoomState(state,{expectedBoardId:'B2',isCurrent:()=>true})
 const close=connectRoomSocket(deps)
 vi.mocked(setBrushRoomScope).mockClear();vi.mocked(loadBrushLibrary).mockClear();vi.mocked(prepareBrushPresets).mockClear()
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'B2',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'B2',boardEpoch:2},canonicalCapabilities:{version:1,roomId:'foreign',boardEpoch:2,capabilities:[],bindings:[]}}
 try{
  Reflect.apply(listeners.get('room_state')!,null,[state])
  expect(setBrushRoomScope).not.toHaveBeenCalled();expect(loadBrushLibrary).not.toHaveBeenCalled();expect(prepareBrushPresets).not.toHaveBeenCalled()
  expect(deps.socketBoardRef.current).toBe('L');expect(deps.pendingSnapshotRef.current).toBeNull();expect(deps.latestKnownSeqRef.current).toBe(0)
  expect(deps.enterBoard).not.toHaveBeenCalled();expect(deps.restoreCatchup).not.toHaveBeenCalled();expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
 }finally{close()}
})

function emptyCanonicalState():Parameters<ServerToClientEvents['room_state']>[0]{return {room:{id:'B2',lessonId:'L',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'B2',boardEpoch:2},canonicalCapabilities:{version:1,roomId:'B2',boardEpoch:2,capabilities:[],bindings:[]}}}
function sourceSetup(){
 const setupResult=setup(),reads:ReturnType<typeof prepareCanonicalRoomState>['canonicalRead'][]=[]
 setupResult.fake.connected=true
 setupResult.deps.prepareCanonicalRoomState=(state,lifetime)=>{
  const prepared=prepareCanonicalRoomState(state,{expectedBoardId:'B2',isCurrent:lifetime.isCurrent})
  reads.push(prepared.canonicalRead);return prepared
 }
 return {...setupResult,reads}
}
it('publishes a fresh same-epoch owner and preserves the previous owner after failed preflight',()=>{
 const {deps,listeners,reads}=sourceSetup(),close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads[0].scope.isCurrent()).toBe(true)
  const invalid=emptyCanonicalState();invalid.canonicalCapabilities={...invalid.canonicalCapabilities!,roomId:'foreign'}
  Reflect.apply(listeners.get('room_state')!,null,[invalid])
  expect(reads[0].scope.isCurrent()).toBe(true)
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads[0].scope.isCurrent()).toBe(false);expect(reads[1].scope.isCurrent()).toBe(true)
 }finally{close()}
 expect(reads[1].scope.isCurrent()).toBe(false)
})
it('drops superseded queued room states before brush scope and metadata loading',async()=>{
 const {deps,listeners,reads}=sourceSetup()
 let resolve!:()=>void
 const pending=new Promise<void>(yes=>{resolve=yes})
 vi.mocked(prepareBrushPresets).mockReturnValueOnce(pending)
 const close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('peer_stroke_live')!,null,[{preset:'blocking'}])
  vi.mocked(setBrushRoomScope).mockClear();vi.mocked(loadBrushLibrary).mockClear()
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads[0].scope.isCurrent()).toBe(false)
  expect(setBrushRoomScope).not.toHaveBeenCalled();expect(loadBrushLibrary).not.toHaveBeenCalled()
  resolve();await pending
  expect(setBrushRoomScope).toHaveBeenCalledExactlyOnceWith('B2')
  expect(loadBrushLibrary).toHaveBeenCalledOnce()
 }finally{close()}
})
it.each(['disconnect','switch','resync','kicked'] as const)('invalidates captured source lifetime on %s',action=>{
 const {deps,listeners,reads}=sourceSetup(),close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads[0].scope.isCurrent()).toBe(true)
  if(action==='switch')deps.switchBoardRef.current?.('next')
  else if(action==='resync')deps.requestFullResyncRef.current?.()
  else Reflect.apply(listeners.get(action)!,null,[action==='disconnect'?'transport close':{reason:'removed'}])
  expect(reads[0].scope.isCurrent()).toBe(false)
 }finally{close()}
})
it('captures confirmation lifetime at wire arrival before the brush queue waits',async()=>{
 const {deps,listeners}=sourceSetup(),close=connectRoomSocket(deps)
 let resolve!:()=>void
 const pending=new Promise<void>(yes=>{resolve=yes})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  vi.mocked(prepareBrushPresets).mockReturnValueOnce(pending)
  Reflect.apply(listeners.get('peer_stroke_live')!,null,[{preset:'blocking'}])
  const message:Parameters<ServerToClientEvents['operation_confirmed']>[0]={seq:1,operation:{id:'old-wire',userId:'author',timestamp:0,seq:1,type:'layer_clear',layerId:'layer'}}
  Reflect.apply(listeners.get('operation_confirmed')!,null,[message])
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  vi.mocked(prepareBrushPresets).mockClear()
  resolve();await pending
  expect(prepareBrushPresets).toHaveBeenCalledExactlyOnceWith([])
  expect(deps.confirmOwnOperation).not.toHaveBeenCalled()
  expect(deps.appliedOpIdsRef.current.has('old-wire')).toBe(false)
  expect(deps.lastConfirmedSeqRef.current).toBe(0)
 }finally{close()}
})
it('rejects a preparer substituting its own lifetime callback',()=>{
 const {deps,listeners,fake}=setup();fake.connected=true
 deps.prepareCanonicalRoomState=state=>prepareCanonicalRoomState(state,{expectedBoardId:'B2',isCurrent:()=>true})
 const close=connectRoomSocket(deps)
 vi.mocked(setBrushRoomScope).mockClear();vi.mocked(loadBrushLibrary).mockClear()
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(setBrushRoomScope).not.toHaveBeenCalled();expect(loadBrushLibrary).not.toHaveBeenCalled()
  expect(deps.enterBoard).not.toHaveBeenCalled()
 }finally{close()}
})

it('publishes one typed join wrapper and pins requested board before state, independently of later ACK',()=>{
 const {deps,fake,listeners}=sourceSetup(),joinRoomRef:{current:import('@grafetto/shared').ClientToServerEvents['join_room']|null}={current:null},reads:ReturnType<typeof prepareCanonicalRoomState>['canonicalRead'][]=[]
 deps.joinRoomRef=joinRoomRef
 deps.prepareCanonicalRoomState=(s,lifetime)=>{
  if(!lifetime.expectedBoardId)throw Error('Missing requested board')
  const result=prepareCanonicalRoomState(s,{expectedBoardId:lifetime.expectedBoardId,isCurrent:lifetime.isCurrent});reads.push(result.canonicalRead);return result
 }
 const close=connectRoomSocket(deps),ack=vi.fn()
 try{
  expect(joinRoomRef.current).not.toBeNull()
  joinRoomRef.current!({roomId:'B2',name:'Ann'},ack)
  expect(deps.wantedBoardRef.current).toBe('B2');expect(fake.emit).toHaveBeenLastCalledWith('join_room',{roomId:'B2',name:'Ann'},ack)
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads).toHaveLength(1);expect(reads[0].scope.isCurrent()).toBe(true)
  ack({ok:true,userId:'reader'});expect(reads[0].scope.isCurrent()).toBe(true)
  joinRoomRef.current!({roomId:'other',name:'Ann'},vi.fn())
  expect(reads[0].scope.isCurrent()).toBe(false)
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads).toHaveLength(1)
 }finally{close()}
 expect(joinRoomRef.current).toBeNull()
})

async function gateFrameFixture(ended=true){
 const {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE}=await import('@grafetto/shared')
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
it('holds new-scope frame and close before mount, seeds baseline IDs before release and never appends its frame twice',async()=>{
 const {createReplayGate}=await import('../replayGate'),{OperationLog}=await import('../../../engine/src/oplog/OperationLog')
 const f=await gateFrameFixture(false),{deps,listeners,reads}=sourceSetup(),gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>(),log=new OperationLog(),ids=new Set<string>()
 let mounted=false,commits=0
 deps.replayGate=gate;deps.holdReviewArrivals=()=>{gate.begin()}
 deps.applyRemoteOp=(op,_read,input)=>{
  if(!mounted)throw Error('New scope reached the old engine')
  if(!input)throw Error('Missing original delivery')
  if(ids.has(op.id))return true
  log.append(op,{serverSeq:op.seq,canonicalInput:input});ids.add(op.id);commits++;return true
 }
 const wire=emptyCanonicalState();wire.tailOperations=[f.op];wire.canonicalCapabilities={...f.attachment,roomId:'B2'}
 wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:1,operationCount:1}
 const close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[wire])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:f.op,canonicalCapabilities:{...f.attachment,roomId:'B2'}}])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:2,operation:{type:'canonical_stroke_close',id:'seal',userId:'author',timestamp:2,seq:2,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'}}])
  expect(commits).toBe(0);expect(log.entries).toHaveLength(0);expect(deps.lastConfirmedSeqRef.current).toBe(0)
  expect(deps.latestKnownSeqRef.current).toBe(0)
  expect(reads[0].scope.isCurrent()).toBe(true)
  const original=reads[0].preparedAtoms[0] as import('../../../engine').CanonicalRecordedInput
  log.append(original.operation,{serverSeq:1,canonicalInput:original});ids.add(original.operation.id)
  mounted=true
  const restoreTicket=gate.begin();expect(gate.end(restoreTicket)).toBe(true)
  expect(commits).toBe(1);expect(log.entries.map(e=>e.op.id)).toEqual(['op','seal'])
  expect(deps.lastConfirmedSeqRef.current).toBe(2);expect(ids).toEqual(new Set(['op','seal']))
 }finally{close()}
})

async function imageWireState(){
 const {canonicalImageMaterialPin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE}=await import('@grafetto/shared')
 const binding=canonicalImageMaterialPin({kind:'image',asset:'asset:'+'a'.repeat(64),brushScale:.05,brushAngle:0},[{id:'asset:'+'a'.repeat(64),size:256,x:53,y:53,width:150,height:150}])
 const material={version:2 as const,...binding,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:original@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'image',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const state=emptyCanonicalState();state.tailOperations=[op];state.canonicalCapabilities={version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'image',sequence:1,originalUserId:'author',capability:0}]}
 return state
}
it('prepares original room image resources before ANY lesson/store/stash/engine publication',async()=>{
 const {deps,listeners,reads}=sourceSetup(),state=await imageWireState();let resolve!:()=>void
 const pending=new Promise<void>(r=>{resolve=r});vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
 const {useRoomStore}=await import('../../../stores/roomStore'),lesson=vi.spyOn(useRoomStore.getState(),'setLesson'),close=connectRoomSocket(deps)
 lesson.mockClear()
 try{
  Reflect.apply(listeners.get('room_state')!,null,[state])
  expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(lesson).not.toHaveBeenCalled();expect(deps.enterBoard).not.toHaveBeenCalled();expect(deps.pendingSnapshotRef.current).toBeNull()
  const assert=vi.mocked(prepareCanonicalImageAssets).mock.calls[0][2];assert();resolve();await pending
  await vi.waitFor(()=>expect(deps.enterBoard).toHaveBeenCalledOnce())
  const stash=vi.mocked(deps.enterBoard).mock.calls[0][1];expect(stash.canonicalRead).toBe(reads[0]);expect(stash.tailOperations).toBe(reads[0].tailOperations)
 }finally{close();lesson.mockRestore()}
})
it('drops stale failed room-image work without locking/disconnecting the newer original room',async()=>{
 const {deps,listeners,fake,reads}=sourceSetup(),state=await imageWireState();let reject!:(e:Error)=>void
 const pending=new Promise<void>((_,r)=>{reject=r});vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
 const close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[state]);Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  expect(reads[0].scope.isCurrent()).toBe(false);reject(new Error('old asset failed'));await pending.catch(()=>{})
  await vi.waitFor(()=>expect(deps.enterBoard).toHaveBeenCalledOnce())
  expect(vi.mocked(deps.enterBoard).mock.calls[0][1].canonicalRead).toBe(reads[1]);expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{close()}
})
it('serializes original confirmed image CAS before the sink/cursors and captures the original input once',async()=>{
 const {deps,listeners}=sourceSetup(),state=await imageWireState();let resolve!:()=>void
 const pending=new Promise<void>(r=>{resolve=r}),apply=vi.fn<RoomSocketDeps['applyRemoteOp']>(()=>true);deps.applyRemoteOp=apply
 const close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(apply).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0)
  resolve();await pending;await vi.waitFor(()=>expect(apply).toHaveBeenCalledOnce())
  const input=apply.mock.calls[0][2];expect(input?.operation).toBe(apply.mock.calls[0][0]);expect(input?.read).toBe(apply.mock.calls[0][1]);expect(deps.lastConfirmedSeqRef.current).toBe(1)
 }finally{close()}
})
it('drops a confirmed image CAS result if a newer same-epoch room arrived during its wait',async()=>{
 const {deps,listeners,fake}=sourceSetup(),state=await imageWireState();let reject!:(e:Error)=>void
 const pending=new Promise<void>((_,r)=>{reject=r});const close=connectRoomSocket(deps)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending)
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);reject(new Error('old read gone'));await pending.catch(()=>{})
  expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0);expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{close()}
})
it('rejects malformed original confirmed capability before even legacy resource selection or cursors',async()=>{
 const {deps,listeners,fake}=sourceSetup(),state=await imageWireState(),close=connectRoomSocket(deps)
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);vi.mocked(prepareBrushPresets).mockClear();vi.mocked(prepareCanonicalImageAssets).mockClear()
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:{...state.tailOperations[0],preset:'brush:imported-a@1'},canonicalCapabilities:{...state.canonicalCapabilities!,roomId:'foreign'}}])
  expect(prepareBrushPresets).not.toHaveBeenCalled();expect(prepareCanonicalImageAssets).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0);expect(fake.disconnect).toHaveBeenCalledOnce()
 }finally{close();log.mockRestore()}
})

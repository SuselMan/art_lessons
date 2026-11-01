import {attachCanonicalRecordedDelivery} from './canonicalRecordedDelivery'
import {createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {createTestEngine} from '../../../engine/testing/engineTestUtils'
import stockNative from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import basic6Native from '../../../engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,canonicalImageSourceBinding,decodeCanonicalStrokeFrame,prepareCanonicalRecordedAttachment,type BrushDescriptor,type CanonicalStrokeBeginResult,type Operation,type SendResult} from '@grafetto/shared'
import {SourceStrokeAuthor} from '../../../engine/src/presets/sourceStrokeAuthor'
import {sourceStrokeAuthorDescriptor} from '../../../engine/src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from '../../../engine/src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../../../engine/src/presets/sourceCanonicalFrameEncoder'
import {installBrushLibrary,installBrushPixels,clearImportedBrushPixels} from '../../../engine/src/presets/importedBrushes'
import {createCanonicalRecoveryControl,createCanonicalRoomVerdicts,prepareCanonicalRoomRecordedInput,restoreCanonicalRoomBaseline} from '../canonicalRoomController'
import {createReplayGate} from '../replayGate'
import {Outbox} from './outbox'
import {createOutboxVerdicts} from './outboxVerdict'
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

function emptyCanonicalState():import('@grafetto/shared').RoomStateLegacyPayload{return {room:{id:'B2',lessonId:'L',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'B2',boardEpoch:2},canonicalCapabilities:{version:1,roomId:'B2',boardEpoch:2,capabilities:[],bindings:[]}}}
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

it('awaits captured engine preparation after original image CAS before the existing sync sink',async()=>{
 const {deps,listeners}=sourceSetup(),state=await imageWireState();let release!:()=>void
 const pending=new Promise<void>(yes=>{release=yes}),prepareCanonicalRecordedInput=vi.fn(async()=>{await pending;return 'ready' as const})
 deps.engineRef.current={setLocked:vi.fn()}as unknown as PencilEngineAPI
 deps.applyRemoteOp=vi.fn(()=>true)
 const configured={...deps,prepareCanonicalRecordedInput},close=connectRoomSocket(configured)
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  await vi.waitFor(()=>expect(prepareCanonicalRecordedInput).toHaveBeenCalledOnce())
  expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0)
  release();await pending;await vi.waitFor(()=>expect(deps.applyRemoteOp).toHaveBeenCalledOnce())
 }finally{release();close()}
})
it('does not prepare an engine before bootstrap replay handoff and routes close through the same final resource lane',async()=>{
 const f=await gateFrameFixture(false),{deps,listeners}=sourceSetup(),{createReplayGate}=await import('../replayGate')
 const gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>();let mounted=false
 deps.replayGate=gate;deps.holdReviewArrivals=()=>{gate.begin()}
 const prepareCanonicalRecordedInput=vi.fn(async()=>{if(!mounted)throw Error('Engine unavailable during bootstrap');return 'ready' as const})
 deps.applyRemoteOp=vi.fn(()=>true)
 const configured={...deps,prepareCanonicalRecordedInput},close=connectRoomSocket(configured)
 const wire=emptyCanonicalState();wire.tailOperations=[f.op];wire.canonicalCapabilities={...f.attachment,roomId:'B2'}
 wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:1,operationCount:1}
 try{
  Reflect.apply(listeners.get('room_state')!,null,[wire])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:f.op,canonicalCapabilities:{...f.attachment,roomId:'B2'}}])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:2,operation:{type:'canonical_stroke_close',id:'seal',userId:'author',timestamp:2,seq:2,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'}}])
  expect(prepareCanonicalRecordedInput).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  mounted=true;deps.engineRef.current={setLocked:vi.fn()}as unknown as PencilEngineAPI;const ticket=gate.begin();expect(gate.end(ticket)).toBe(true)
  await vi.waitFor(()=>expect(prepareCanonicalRecordedInput).toHaveBeenCalledTimes(2))
  await vi.waitFor(()=>expect(deps.lastConfirmedSeqRef.current).toBe(2))
  expect(vi.mocked(deps.applyRemoteOp).mock.calls.map(call=>call[0].id)).toEqual(['op','seal'])
 }finally{close()}
})
it('drops an already prepared final closure when room state replaces its handler during engine preparation',async()=>{
 const {deps,listeners,fake}=sourceSetup(),state=await imageWireState();let release!:()=>void
 const pending=new Promise<void>(yes=>{release=yes}),prepareCanonicalRecordedInput=vi.fn(async()=>{await pending;return 'ready' as const})
 deps.engineRef.current={setLocked:vi.fn()}as unknown as PencilEngineAPI
 deps.applyRemoteOp=vi.fn(()=>true)
 const close=connectRoomSocket({...deps,prepareCanonicalRecordedInput})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  await vi.waitFor(()=>expect(prepareCanonicalRecordedInput).toHaveBeenCalledOnce())
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  release();await pending;await Promise.resolve();await Promise.resolve()
  expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0);expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{release();close()}
})

it.each(['obsolete','reject']as const)('does not apply or lock a replacement engine under the SAME original read after %s resource completion',async outcome=>{
 const {deps,listeners,fake,reads}=sourceSetup(),state=await imageWireState(),oldLock=vi.fn(),newLock=vi.fn(),old={setLocked:oldLock}as unknown as PencilEngineAPI,next={setLocked:newLock}as unknown as PencilEngineAPI
 deps.engineRef.current=old;let release!:()=>void
 const waiting=new Promise<void>(done=>{release=done}),prepareCanonicalRecordedInput=vi.fn(async()=>{await waiting;if(outcome==='reject')throw Error('old engine failure');return 'obsolete' as const})
 deps.applyRemoteOp=vi.fn(()=>true)
 const close=connectRoomSocket({...deps,prepareCanonicalRecordedInput})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  await vi.waitFor(()=>expect(prepareCanonicalRecordedInput).toHaveBeenCalledOnce());expect(reads[0].scope.isCurrent()).toBe(true)
  deps.engineRef.current=next;release();await waiting;await Promise.resolve();await Promise.resolve()
  expect(reads[0].scope.isCurrent()).toBe(true);expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0);expect(newLock).not.toHaveBeenCalled();expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{release();close()}
})
it('refuses an obsolete preparation result while its captured engine and original read are still current',async()=>{
 const {deps,listeners,fake}=sourceSetup(),state=await imageWireState(),lock=vi.fn();deps.engineRef.current={setLocked:lock}as unknown as PencilEngineAPI;deps.applyRemoteOp=vi.fn(()=>true)
 const log=vi.spyOn(console,'error').mockImplementation(()=>{}),close=connectRoomSocket({...deps,prepareCanonicalRecordedInput:async()=> 'obsolete' as const})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}])
  await vi.waitFor(()=>expect(fake.disconnect).toHaveBeenCalledOnce());expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0)
 }finally{close();log.mockRestore()}
})

function actualImagePrefix(){
 const descriptor=basic6Native.descriptor as unknown as BrushDescriptor,binding=canonicalImageSourceBinding(descriptor,basic6Native.asset),compiled=sourceStrokeAuthorDescriptor(descriptor,{asset:basic6Native.asset,colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program),state=author.createState(4321,7654,.3),material:SourceStrokeMaterialContextV2={version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}},snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'original-peer-B',boardEpoch:2,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder(snapshot),[xb,yb,t,pb]=basic6Native.packets[0],f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=basic6Native.mapping
 const packets:CanonicalStrokeOperation[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const encoded=encoder.encode(chunk.packed);packets.push({id:'original-peer-'+packets.length,type:'canonical_stroke',userId:'peer',timestamp:0,layerId:'layer-1',seq:packets.length+1,frame:encoded.envelope})}}
 accept(adapter.beginInput(state));const work=author.plan(state,{x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
 while(true){const next=work.next();if(next.done)break;accept(adapter.accept(next.value));const cut=adapter.flush();if(cut)accept([cut])}
 if(!packets.length)throw Error('Missing actual source prefix')
 return {op:packets[0],snapshot}
}
function actualEngineForRead(read:ReturnType<typeof prepareCanonicalRoomState>['canonicalRead'],onLocalOperation:(op:Operation)=>void,onFault:()=>void,begin?:NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor'],onIdle?:()=>void){
 const r=createTestEngine({userId:'author',rasterVersion:'straight-rgba8-v1',pageWidth:64,pageHeight:64,canonicalEmptyRoom:{read,tail:read.tailOperations},canonicalAuthor:begin,onLocalOperation,onCanonicalRecoveryRequired:onFault,onCanonicalAuthorIdle:onIdle},{width:64,height:64}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,64,64]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return r
}
it('retires the actual faulted source before independent Outbox ACKs join, then restores fresh full history through the SAME active socket gate',async()=>{
 const {deps,listeners,fake,reads}=sourceSetup(),{useRoomStore}=await import('../../../stores/roomStore'),descriptor=stockNative.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor,preset=`brush:${descriptor.id}@${descriptor.version}`,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1'),image=actualImagePrefix()
 const coverage=new Uint8Array(inflateSync(Buffer.from(basic6Native.asset.deflateBase64,'base64'),{maxOutputLength:65536}));expect('asset:'+createHash('sha256').update(coverage).digest('hex')).toBe(basic6Native.asset.id)
 installBrushPixels(basic6Native.asset.id,coverage);installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'native Basic2',source:'native',warnings:[]}],assets:[],skipped:[]})
 useRoomStore.setState({boardId:'B2',reviewBoardId:null});deps.boardIdRef.current='B2';deps.socketBoardRef.current='B2'
 const replay=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>();deps.replayGate=replay;deps.holdReviewArrivals=()=>{replay.begin()}
 let engine:ReturnType<typeof actualEngineForRead>['engine']|undefined,nextEngine:typeof engine,authorSnapshot:CanonicalStrokeSnapshotV2|undefined,releaseStorage!:()=>void,lastId=''
 const pendingIdsRef={current:new Set<string>()}
 const storagePending=new Promise<void>(done=>{releaseStorage=done}),operations:CanonicalStrokeOperation[]=[],attempts:{op:Operation;resolve:(result:SendResult)=>void}[]=[],stored=new Map<string,import('./outboxStorage').OutboxEntry>(),faultObservations:{holds:boolean;cpu:number;owner:boolean}[]=[]
 let outbox!:Outbox
 const control=createCanonicalRecoveryControl({getEngine:()=>deps.engineRef.current,getBoard:()=>deps.boardIdRef.current,hasPendingLocals:()=>outbox.pendingCount!==0||pendingIdsRef.current.size!==0,canRequest:()=>fake.connected,resync:()=>deps.requestFullResyncRef.current!(),onWaiting:()=>deps.setRoomContentReady(false)})
 const verdicts=createOutboxVerdicts({pendingIdsRef,latestKnownSeqRef:deps.latestKnownSeqRef,confirmOperation:deps.confirmOwnOperation,discardOperation:vi.fn(),checkSnapshotBoundary:deps.checkSnapshotBoundary,resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:vi.fn(),setLostWork:vi.fn(),canonicalVerdicts:createCanonicalRoomVerdicts({repair:()=>{if(engine)control.request(engine,'B2')},isReplacing:control.isReplacing,drain:control.drain})})
 outbox=new Outbox({roomId:'B2',storage:{getAll:async()=>[...stored.values()],put:async entry=>{stored.set(entry.op.id,entry)},delete:async id=>{if(id===lastId)await storagePending;stored.delete(id)}},send:op=>new Promise(resolve=>{attempts.push({op,resolve})}),canSend:()=>true,...verdicts})
 deps.prepareCanonicalRecordedInput=(input,captured)=>prepareCanonicalRoomRecordedInput(captured,input,{currentEngine:()=>deps.engineRef.current,currentBoard:()=>deps.boardIdRef.current,recovery:control})
 deps.applyRemoteOp=vi.fn((op,read,recorded)=>{if(!recorded||recorded.operation!==op||recorded.read!==read)throw Error('Original sink mismatch');deps.engineRef.current!.appendOriginalRecorded(recorded);return true})
 const stashes:import('../restoreRoomState').RoomStatePayload[]=[];deps.replaceCanonicalRoom=(_board,stash)=>{stashes.push(stash)};deps.enterBoard=vi.fn((_board,stash)=>{stashes.push(stash)})
 const close=connectRoomSocket(deps)
 try{
  const initial=emptyCanonicalState();initial.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:0,operationCount:0}
  Reflect.apply(listeners.get('room_state')!,null,[initial]);await vi.waitFor(()=>expect(stashes).toHaveLength(1));const read=reads[0]
  const begin:NonNullable<NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor']>={begin:async request=>{authorSnapshot={layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}};return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:authorSnapshot} satisfies CanonicalStrokeBeginResult}}
  engine=actualEngineForRead(read,op=>{if(op.type!=='canonical_stroke')throw Error('Unexpected fabricated close/legacy input');operations.push(op);void outbox.enqueue(op)},()=>{if(engine){faultObservations.push({holds:engine.hasActiveCanonicalAuthor(),cpu:engine['_brushMipCache'].reservedBytes,owner:!!engine['_canonicalLayerOwner']});control.retired(engine,'B2')}},begin).engine
  deps.engineRef.current=engine;control.bind(engine,'B2');await engine.paperReady();await restoreCanonicalRoomBaseline(engine,read,read.tailOperations,()=>deps.engineRef.current,deps.appliedOpIdsRef.current);control.restored(engine);const ticket=replay.begin();expect(replay.end(ticket)).toBe(true)
  engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40);engine.setLocked(false);await engine.prepareBrush(preset)
  const packet=(x:number,timeStamp:number)=>({x,y:20,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen' as const,timeStamp,dispatchTime:timeStamp})
  engine['_onStart'](packet(20,0));engine['_onMove'](packet(24,10));await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine!['_authorInput'].pending).toBe(false));lastId=operations.at(-1)!.id
  expect(engine.hasActiveCanonicalAuthor()).toBe(true);expect(engine['_log'].entries).toHaveLength(0);expect(outbox.pendingCount).toBe(operations.length)
  expect(operations.reduce((sum,op)=>sum+decodeCanonicalStrokeFrame(op.frame,{rasterProfile:authorSnapshot!.rasterProfile,brush:authorSnapshot!.brush,strokeId:authorSnapshot!.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:authorSnapshot!.pigmentRgb8,composition:authorSnapshot!.composition,material:authorSnapshot!.material}).frame.draws.length,0)).toBeGreaterThan(0)
  const prepare=vi.spyOn(engine,'prepareOriginalRecorded');let localFinished=false
  const localWork=engine['_brushPreparation'].run(Array.from({length:64},()=>()=>{}),{},()=>true,'finite-before-context-loss',()=>{localFinished=true;return undefined})
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:image.op,canonicalCapabilities:{version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:'peer',snapshot:image.snapshot}],bindings:[{operationId:image.op.id,sequence:1,originalUserId:'peer',capability:0}]}}])
  for(const [i,op]of operations.entries())Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:i+2,operation:{...op,seq:i+2},canonicalCapabilities:{version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot:authorSnapshot!}],bindings:[{operationId:op.id,sequence:i+2,originalUserId:op.userId,capability:0}]}}])
  await vi.waitFor(()=>expect(prepare).toHaveBeenCalledOnce(),{interval:1});expect(localFinished).toBe(false);expect(engine['_canonicalLayerOwner']!.resourceCandidate).toBeUndefined()
  vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));await localWork
  await vi.waitFor(()=>expect(faultObservations.length).toBeGreaterThan(0));expect(faultObservations.at(-1)).toEqual({holds:false,cpu:0,owner:false});expect(read.scope.isCurrent()).toBe(true);expect(fake.emit).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.lastConfirmedSeqRef.current).toBe(0)
  for(let i=0;i<operations.length;i++){await vi.waitFor(()=>expect(attempts.length).toBeGreaterThan(i));attempts[i].resolve({ok:true,seq:i+2})}
  await outbox.whenIdle(1000);expect(outbox.pendingCount).toBe(0);expect(fake.emit).not.toHaveBeenCalled();expect(read.scope.isCurrent()).toBe(true);releaseStorage()
  await vi.waitFor(()=>expect(fake.emit).toHaveBeenCalledWith('join_room',expect.objectContaining({roomId:'B2',lastKnownSeq:operations.length+1}),expect.any(Function)))
  expect(read.scope.isCurrent()).toBe(false);expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.confirmOwnOperation).not.toHaveBeenCalled();expect(fake.disconnect).not.toHaveBeenCalled()
  const tail=[image.op,...operations.map((op,i)=>({...op,seq:i+2}))],full=emptyCanonicalState();full.tailOperations=tail;full.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:tail.length,operationCount:tail.length};full.canonicalCapabilities={version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:'peer',snapshot:image.snapshot},{originalUserId:'author',snapshot:authorSnapshot!}],bindings:tail.map((op,i)=>({operationId:op.id,sequence:i+1,originalUserId:op.userId,capability:i===0?0:1}))}
  Reflect.apply(listeners.get('room_state')!,null,[full]);await vi.waitFor(()=>expect(stashes).toHaveLength(2));const fresh=reads.at(-1)!;expect(fresh).not.toBe(read)
  control.detach(engine);engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);nextEngine=actualEngineForRead(fresh,()=>{throw Error('Unexpected source emission')},()=>{}).engine;deps.engineRef.current=nextEngine
  await restoreCanonicalRoomBaseline(nextEngine,fresh,fresh.tailOperations,()=>deps.engineRef.current,deps.appliedOpIdsRef.current)
  expect(nextEngine['_log'].entries.map(e=>e.serverSeq)).toEqual(tail.map(op=>op.seq));expect(nextEngine['_canonicalPixelsReady']).toBe(true);expect(deps.appliedOpIdsRef.current).toEqual(new Set(tail.map(op=>op.id)))
 }finally{releaseStorage();close();outbox.dispose();nextEngine?.destroy();engine?.destroy();clearImportedBrushPixels();if(nextEngine)expect(nextEngine['_brushMipCache'].reservedBytes).toBe(0);if(engine)expect(engine['_brushMipCache'].reservedBytes).toBe(0);vi.restoreAllMocks()}
},45000)

it('retries only real cancellation after UI preparation replaces a remote candidate once, preserving the open pointer source',async()=>{
 const descriptor=stockNative.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor,preset=`brush:${descriptor.id}@${descriptor.version}`,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1'),image=actualImagePrefix(),wire=emptyCanonicalState();wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:0,operationCount:0}
 const prepared=prepareCanonicalRoomState(wire,{expectedBoardId:'B2',isCurrent:()=>true}),coverage=new Uint8Array(inflateSync(Buffer.from(basic6Native.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
 installBrushPixels(basic6Native.asset.id,coverage);installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'native Basic2',source:'native',warnings:[]}],assets:[],skipped:[]})
 const operations:Operation[]=[],fault=vi.fn(),begin:NonNullable<NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor']>={begin:async request=>({ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}})},engine=actualEngineForRead(prepared.canonicalRead,op=>operations.push(op),fault,begin).engine
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(prepared.canonicalRead,prepared.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40);engine.setLocked(false);await engine.prepareBrush(preset)
  const packet=(x:number,timeStamp:number)=>({x,y:20,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen' as const,timeStamp,dispatchTime:timeStamp});engine['_onStart'](packet(20,0));engine['_onMove'](packet(24,10));await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const owner=engine['_canonicalLayerOwner']!,epoch=owner.prepass.preparedCapacity().epoch,coordinator=owner.coordinator,atom=prepareCanonicalRecordedAttachment({version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:'peer',snapshot:image.snapshot}],bindings:[{operationId:image.op.id,sequence:1,originalUserId:'peer',capability:0}]},[image.op],prepared.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,prepared.canonicalRead.scope);if(!('delivery'in input))throw Error('Missing original resource delivery')
  const prepare=vi.spyOn(engine,'prepareOriginalRecorded'),control=createCanonicalRecoveryControl({getEngine:()=>engine,getBoard:()=> 'B2',hasPendingLocals:()=>false,canRequest:()=>true,resync:()=>{throw Error('Unexpected repair')},onWaiting:()=>{}});control.bind(engine,'B2');control.restored(engine)
  const pending=prepareCanonicalRoomRecordedInput(engine,input,{currentEngine:()=>engine,currentBoard:()=> 'B2',recovery:control})
  await vi.waitFor(()=>expect(owner.resourceCandidate).toBeDefined(),{interval:1})
  const ui=engine.prepareBrush(preset)
  expect(await pending).toBe('ready');expect(await ui).toEqual({status:'ready'});expect(prepare).toHaveBeenCalledTimes(2)
  await expect(prepare.mock.results[0].value).resolves.toEqual({status:'cancelled'});await expect(prepare.mock.results[1].value).resolves.toEqual({status:'ready'})
  expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.coordinator).toBe(coordinator);expect(owner.resourceCandidate).toBeUndefined();expect(owner.bank).toBeDefined();expect(engine.hasActiveCanonicalAuthor()).toBe(true);expect(fault).not.toHaveBeenCalled();expect(engine['_log'].entries).toHaveLength(0)
  const count=operations.length;engine['_onMove'](packet(28,20));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false));expect(operations.length).toBeGreaterThan(count);expect(fault).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);clearImportedBrushPixels();vi.restoreAllMocks()}
},30000)
it('does not relabel an existing engine after original CAS preparation awaits under the same read',async()=>{
 const {deps,listeners,fake,reads}=sourceSetup(),state=await imageWireState(),old={setLocked:vi.fn()}as unknown as PencilEngineAPI,nextLock=vi.fn(),next={setLocked:nextLock}as unknown as PencilEngineAPI;deps.engineRef.current=old
 let release!:()=>void;const pending=new Promise<void>(done=>{release=done}),prepareCanonicalRecordedInput=vi.fn(async()=> 'ready' as const)
 vi.mocked(prepareCanonicalImageAssets).mockReturnValueOnce(pending);deps.applyRemoteOp=vi.fn(()=>true)
 const close=connectRoomSocket({...deps,prepareCanonicalRecordedInput})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:state.tailOperations[0],canonicalCapabilities:state.canonicalCapabilities}]);expect(prepareCanonicalImageAssets).toHaveBeenCalled()
  deps.engineRef.current=next;release();await pending;await Promise.resolve();await Promise.resolve()
  expect(reads[0].scope.isCurrent()).toBe(true);expect(prepareCanonicalRecordedInput).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(nextLock).not.toHaveBeenCalled();expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{release();close()}
})
it('preserves a queued legacy stroke across same-board engine replacement while canonical preparation is installed',async()=>{
 const {deps,listeners,fake}=sourceSetup(),old={setLocked:vi.fn()}as unknown as PencilEngineAPI,next={setLocked:vi.fn()}as unknown as PencilEngineAPI
 deps.engineRef.current=old
 const prepareCanonicalRecordedInput=vi.fn(async()=> 'ready' as const),close=connectRoomSocket({...deps,prepareCanonicalRecordedInput})
 let release!:()=>void
 const pending=new Promise<void>(done=>{release=done})
 const state=emptyCanonicalState();state.room.rasterVersion='legacy-pm8-v1';delete state.canonicalReadScope;delete state.canonicalCapabilities
 const operation:Operation={id:'legacy-after-engine-replacement',userId:'peer',timestamp:0,type:'stroke',strokeId:'legacy-stream',layerId:'layer-1',tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]}
 try{
  Reflect.apply(listeners.get('room_state')!,null,[state])
  deps.streamedStrokeIdsRef.current.add('legacy-stream')
  vi.mocked(prepareBrushPresets).mockReturnValueOnce(pending)
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation}])
  expect(prepareBrushPresets).toHaveBeenLastCalledWith(['HB']);expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  deps.engineRef.current=next;release();await pending
  await vi.waitFor(()=>expect(deps.applyRemoteOp).toHaveBeenCalledWith(operation))
  expect(deps.lastConfirmedSeqRef.current).toBe(1);expect(deps.syncFromLog).toHaveBeenCalled();expect(deps.checkSnapshotBoundary).toHaveBeenCalled()
  expect(prepareCanonicalRecordedInput).not.toHaveBeenCalled();expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{release();close()}
})
it('keeps a capacity-held ninth original ahead of replayed later frames, close and reentrant arrivals without ACK paint',async()=>{
 const {deps,listeners,fake}=sourceSetup(),f=await gateFrameFixture(false),replay=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>(),{engine}=createTestEngine()
 deps.engineRef.current=engine;deps.replayGate=replay;deps.holdReviewArrivals=()=>{replay.begin()}
 const payload=(seq:number):Parameters<ServerToClientEvents['operation_confirmed']>[0]=>{
  const operation={...f.op,id:'burst-'+seq,seq,frame:{...f.op.frame,strokeId:'S'+seq}},snapshot={...f.attachment.capabilities[0].snapshot,strokeId:'S'+seq}
  return{seq,operation,canonicalCapabilities:{version:1,roomId:'B2',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:operation.id,sequence:seq,originalUserId:'author',capability:0}]}}
 }
 let release!:()=>void
 const pending=new Promise<void>(done=>{release=done}),prepared=new Map<string,import('../../../engine').CanonicalRecordedInput>(),applied:number[]=[]
 const prepareCanonicalRecordedInput=vi.fn(async(input:import('../../../engine').CanonicalRecordedInput)=>{input.delivery.assertCurrent(input);prepared.set(input.operation.id,input);if(input.operation.seq===9)await pending;return 'ready' as const})
 deps.applyRemoteOp=vi.fn((op,_read,input)=>{expect(input).toBe(prepared.get(op.id));input!.delivery.assertCurrent(input!);applied.push(op.seq!);if(op.seq===9)Reflect.apply(listeners.get('operation_confirmed')!,null,[payload(14)]);return true})
 const close=connectRoomSocket({...deps,prepareCanonicalRecordedInput})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()]);const ticket=replay.begin()
  for(let seq=1;seq<=12;seq++)Reflect.apply(listeners.get('operation_confirmed')!,null,[payload(seq)])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:13,operation:{type:'canonical_stroke_close',id:'burst-close',userId:'author',timestamp:2,seq:13,layerId:'L',targetUserId:'author',strokeId:'S12',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'burst-12',lastFrameOpId:'burst-12'}}])
  expect(prepareCanonicalRecordedInput).not.toHaveBeenCalled();expect(replay.end(ticket)).toBe(true)
  await vi.waitFor(()=>expect(prepared.has('burst-9')).toBe(true))
  expect(applied).toEqual([1,2,3,4,5,6,7,8]);expect(deps.lastConfirmedSeqRef.current).toBe(8)
  deps.latestKnownSeqRef.current=14;expect(deps.lastConfirmedSeqRef.current).toBe(8)
  release();await pending;await vi.waitFor(()=>expect(applied).toHaveLength(14))
  expect(applied).toEqual(Array.from({length:14},(_,i)=>i+1));expect(deps.lastConfirmedSeqRef.current).toBe(14);expect(fake.disconnect).not.toHaveBeenCalled()
 }finally{release();close();engine.destroy()}
})

it('passes closed healthy metadata with the exact original Room read and engine without cursors or legacy paint',()=>{
 const {deps,listeners,reads}=sourceSetup(),engine={setLocked:vi.fn()}as unknown as PencilEngineAPI,history=vi.fn()
 deps.engineRef.current=engine
 const close=connectRoomSocket({...deps,onCanonicalHistoryConfirmed:history})
 try{
  Reflect.apply(listeners.get('room_state')!,null,[emptyCanonicalState()])
  const operation={id:'undo',type:'operation_undo' as const,userId:'peer',timestamp:0,targetOpId:'frame',seq:1}
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation}])
  expect(history).toHaveBeenCalledWith(operation,reads[0],engine);expect(deps.lastConfirmedSeqRef.current).toBe(0);expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.confirmOwnOperation).not.toHaveBeenCalled();expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled()
 }finally{close()}
})
it('retains fresh-scope suffix across old-engine replacement before the genuine new baseline mounts',async()=>{
 const {deps,listeners,reads,fake}=sourceSetup(),f=await gateFrameFixture(false),old={setLocked:vi.fn()}as unknown as PencilEngineAPI,next={setLocked:vi.fn()}as unknown as PencilEngineAPI,gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>()
 deps.engineRef.current=old;deps.replayGate=gate;deps.holdReviewArrivals=()=>{gate.begin()};deps.applyRemoteOp=vi.fn(()=>true)
 let installed:typeof reads[number]|undefined,release!:()=>void
 const waiting=new Promise<void>(done=>{release=done}),prepareCanonicalRecordedInput=vi.fn(async()=> 'ready' as const)
 const history=vi.fn(),metadata={type:'operation_undo' as const,id:'fresh-history',userId:f.op.userId,timestamp:1,targetOpId:f.op.id,seq:2}
 const close=connectRoomSocket({...deps,prepareCanonicalRecordedInput,onCanonicalHistoryConfirmed:history,isCanonicalEngineCurrent:(engine,read)=>engine===deps.engineRef.current&&installed===read})
 try{
  vi.mocked(prepareBrushPresets).mockReturnValueOnce(waiting)
  Reflect.apply(listeners.get('peer_stroke_live')!,null,[{preset:'blocking'}])
  const wire=emptyCanonicalState();wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'B2',boardEpoch:2,throughSeq:0,operationCount:0}
  Reflect.apply(listeners.get('room_state')!,null,[wire])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:1,operation:f.op,canonicalCapabilities:{...f.attachment,roomId:'B2'}}])
  Reflect.apply(listeners.get('operation_confirmed')!,null,[{seq:2,operation:metadata}])
  expect(history).not.toHaveBeenCalled()
  deps.engineRef.current=next;installed=reads[0];release();await waiting;await Promise.resolve();await Promise.resolve()
  expect(deps.applyRemoteOp).not.toHaveBeenCalled();const ticket=gate.begin();expect(gate.end(ticket)).toBe(true)
  await vi.waitFor(()=>expect(deps.applyRemoteOp).toHaveBeenCalledOnce());expect(prepareCanonicalRecordedInput).toHaveBeenCalledWith(expect.objectContaining({operation:expect.objectContaining({id:f.op.id})}),next);expect(deps.lastConfirmedSeqRef.current).toBe(1);expect(fake.disconnect).not.toHaveBeenCalled();expect(history).toHaveBeenCalledWith(metadata,reads[0],next);expect(history).toHaveBeenCalledOnce()
 }finally{release();close()}
})

it('joins healthy full history after OPEN local CPU exceeds eight packets while originals wait behind metadata and ACKs drain independently', async () => {
    const { deps, listeners, fake, reads } = sourceSetup(), { useRoomStore } = await import('../../../stores/roomStore'), descriptor = stockNative.rows.find(row => row.index === 4)!.descriptor as unknown as BrushDescriptor, preset = `brush:${descriptor.id}@${descriptor.version}`, sha = createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'), pin = canonicalDefaultAutoSourceBinding(descriptor, sha, 'neon64-f32-fma-v1');
    installBrushLibrary({ schemaVersion: 1, brushes: [{ descriptor, name: 'native Basic2', source: 'native', warnings: [] }], assets: [], skipped: [] });
    useRoomStore.setState({ boardId: 'B2', reviewBoardId: null });
    deps.boardIdRef.current = 'B2';
    deps.socketBoardRef.current = 'B2';
    const replay = createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>();
    deps.replayGate = replay;
    deps.holdReviewArrivals = () => { replay.begin(); };
    let engine: ReturnType<typeof actualEngineForRead>['engine'] | undefined, nextEngine: typeof engine, installed: typeof reads[number] | undefined, outbox!: Outbox, read: typeof reads[number], sequence = 0, acked = 0;
    const operations: CanonicalStrokeOperation[] = [], snapshots = new Map<string, CanonicalStrokeSnapshotV2>(), attempts: {
        op: Operation;
        resolve: (r: SendResult) => void;
    }[] = [], tail: Operation[] = [], fault = vi.fn(), joining = vi.fn(), stashes: import('../restoreRoomState').RoomStatePayload[] = [];
    const control = createCanonicalRecoveryControl({ getEngine: () => deps.engineRef.current, getBoard: () => deps.boardIdRef.current, hasPendingLocals: () => outbox.pendingCount !== 0, canRequest: () => fake.connected, resync: () => deps.requestFullResyncRef.current!(), onWaiting: vi.fn(), getControlLineage: () => ({ socket: fake, connectionId: 'actual', boardId: 'B2', originalRead: read }), noteKnownSequence: seq => { deps.latestKnownSeqRef.current = Math.max(deps.latestKnownSeqRef.current, seq); }, onHistoryJoining: joining, holdHistory: () => { const ticket = replay.begin(); void control.whenHistoryTransition(engine!, 'B2').then(outcome => { if (outcome === 'joining')
            replay.end(ticket); }); } });
    outbox = new Outbox({ roomId: 'B2', storage: { getAll: async () => [], put: async () => { }, delete: async () => { } }, getCanonicalSendLineage: () => ({ socket: fake, connectionId: 'actual', boardId: 'B2', originalRead: read }), send: op => new Promise(resolve => attempts.push({ op, resolve })), onSettled: (op, result, context) => { if (result.ok)
            deps.latestKnownSeqRef.current = Math.max(deps.latestKnownSeqRef.current, result.seq); if (op.type === 'operation_undo' || op.type === 'operation_redo')
            control.settleControl(op, result, context); control.drain(); }, canSend: () => true });
    const original = (op: CanonicalStrokeOperation, seq: number) => ({ seq, operation: { ...op, seq }, canonicalCapabilities: { version: 1 as const, roomId: 'B2', boardEpoch: 2, capabilities: [{ originalUserId: op.userId, snapshot: snapshots.get(op.frame.strokeId)! }], bindings: [{ operationId: op.id, sequence: seq, originalUserId: op.userId, capability: 0 }] } });
    async function acknowledge() { while (acked < operations.length) {
        await vi.waitFor(() => expect(attempts.length).toBeGreaterThan(acked));
        const a = attempts[acked++];
        const op = a.op;
        if (op.type !== 'canonical_stroke')
            throw Error('Unexpected source control');
        const seq = ++sequence;
        tail.push({ ...op, seq });
        Reflect.apply(listeners.get('operation_confirmed')!, null, [original(op, seq)]);
        a.resolve({ ok: true, seq });
    } await outbox.whenIdle(2000); }
    deps.prepareCanonicalRecordedInput = (input, captured) => prepareCanonicalRoomRecordedInput(captured, input, { currentEngine: () => deps.engineRef.current, currentBoard: () => deps.boardIdRef.current, recovery: control });
    deps.isCanonicalEngineCurrent = (candidate, scope) => candidate === deps.engineRef.current && scope === installed;
    deps.applyRemoteOp = vi.fn((op, cap, input) => { if (!input || input.operation !== op || input.read !== cap)
        throw Error('Lost original'); deps.engineRef.current!.appendOriginalRecorded(input); return true; });
    deps.onCanonicalHistoryConfirmed = (op, scope, captured) => { expect(control.confirmedControl(captured, 'B2', scope, scope.tailOperations, op)).toBe(true); };
    deps.replaceCanonicalRoom = (_board, stash) => { stashes.push(stash); };
    deps.enterBoard = vi.fn((_board, stash) => { stashes.push(stash); });
    const close = connectRoomSocket(deps);
    try {
        const initial = emptyCanonicalState();
        initial.canonicalHistoryBase = { kind: 'full-room-prefix-v2', roomId: 'B2', boardEpoch: 2, throughSeq: 0, operationCount: 0 };
        Reflect.apply(listeners.get('room_state')!, null, [initial]);
        await vi.waitFor(() => expect(stashes).toHaveLength(1));
        read = reads[0];
        installed = read;
        const begin: NonNullable<NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor']> = { begin: async (request) => { const snapshot: CanonicalStrokeSnapshotV2 = { layerId: request.layerId, brush: request.brush, strokeId: request.strokeId, pigmentRgb8: request.pigmentRgb8, boardEpoch: 2, descriptorSha256: sha, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, composition: { mode: 'wash', alphaDarken: request.alphaDarken, outerResourceOpacity: request.outerResourceOpacity, outerBlend: 'over' }, assets: [], materialVersion: 2, material: { version: 2, assets: [], primarySource: pin, budget: { workUnits: 64 * 1048576, outputBytes: 16 * 1048576, drawPixels: 16 * 1048576 } } }; snapshots.set(request.strokeId, snapshot); return { ok: true, recordedNext: 0, liveNext: 0, ended: false, snapshot }; } };
        engine = actualEngineForRead(read, op => { if (op.type !== 'canonical_stroke')
            throw Error('No synthetic END/control'); operations.push(op); void outbox.enqueue(op); }, fault, begin, () => control.authorIdle(engine!, 'B2')).engine;
        deps.engineRef.current = engine;
        control.bind(engine, 'B2');
        await engine.paperReady();
        await restoreCanonicalRoomBaseline(engine, read, read.tailOperations, () => deps.engineRef.current, deps.appliedOpIdsRef.current);
        control.restored(engine);
        const ticket = replay.begin();
        replay.end(ticket);
        engine.setActiveLayer('layer-1');
        engine.setTool('digitalBrush');
        engine.setPencil(preset);
        engine.setSize(40);
        engine.setLocked(false);
        await engine.prepareBrush(preset);
        const packet = (x: number, t: number) => ({ x, y: 20, pressure: .5, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen' as const, timeStamp: t, dispatchTime: t });
        engine['_onStart'](packet(20, 0));
        engine['_onMove'](packet(24, 10));
        engine['_onEnd'](packet(24, 20));
        await vi.waitFor(() => expect(engine!.hasActiveCanonicalAuthor()).toBe(false), { timeout: 10000 });
        await acknowledge();
        await vi.waitFor(() => expect(engine!['_canonicalExportReady']()).toBe(true), { timeout: 10000 });
        const firstCount = operations.length, target = operations.at(-1)!.id;
        engine['_onStart'](packet(10, 100));
        engine['_onMove'](packet(12, 110));
        await vi.waitFor(() => expect(operations.length).toBeGreaterThan(firstCount));
        await vi.waitFor(() => expect(engine!['_authorInput'].pending).toBe(false));
        expect(engine.hasActiveCanonicalAuthor()).toBe(true);
        const metadata: Operation = { type: 'operation_undo', id: 'actual-peer-undo', userId: 'author', timestamp: 120, seq: ++sequence, targetOpId: target };
        tail.push(metadata);
        Reflect.apply(listeners.get('operation_confirmed')!, null, [{ seq: sequence, operation: metadata }]);
        expect(control.controlBusy(engine, 'B2')).toBe(true);
        expect(joining).not.toHaveBeenCalled();
        for (let i = 0; i < 18; i++)
            engine['_onMove'](packet(12 + i * 2, 130 + i * 10));
        engine['_onEnd'](packet(48, 320));
        await vi.waitFor(() => expect(engine!.hasActiveCanonicalAuthor()).toBe(false), { timeout: 15000 });
        expect(operations.length - firstCount).toBeGreaterThan(8);
        expect(engine['_log'].entries).toHaveLength(firstCount);
        expect(fault).not.toHaveBeenCalled();
        expect(joining).not.toHaveBeenCalled();
        expect(deps.lastConfirmedSeqRef.current).toBe(firstCount);
        await acknowledge();
        await vi.waitFor(() => expect(joining).toHaveBeenCalledOnce());
        expect(read.scope.isCurrent()).toBe(false);
        expect(engine['_log'].entries).toHaveLength(firstCount);
        expect(deps.confirmOwnOperation).not.toHaveBeenCalled();
        expect(fake.disconnect).not.toHaveBeenCalled();
        expect(deps.latestKnownSeqRef.current).toBe(sequence);
        const full = emptyCanonicalState();
        full.tailOperations = tail;
        full.canonicalHistoryBase = { kind: 'full-room-prefix-v2', roomId: 'B2', boardEpoch: 2, throughSeq: sequence, operationCount: tail.length };
        const all = [...snapshots.values()];
        full.canonicalCapabilities = { version: 1, roomId: 'B2', boardEpoch: 2, capabilities: all.map(snapshot => ({ originalUserId: 'author', snapshot })), bindings: tail.flatMap(op => op.type === 'canonical_stroke' ? [{ operationId: op.id, sequence: op.seq!, originalUserId: 'author', capability: all.findIndex(s => s.strokeId === op.frame.strokeId) }] : []) };
        Reflect.apply(listeners.get('room_state')!, null, [full]);
        await vi.waitFor(() => expect(stashes).toHaveLength(2));
        const fresh = reads.at(-1)!;
        control.detach(engine);
        engine.destroy();
        nextEngine = actualEngineForRead(fresh, op => { if (op.type !== 'operation_undo' && op.type !== 'operation_redo')
            throw Error('Unexpected local write'); const receipt = control.beginControl(nextEngine!, 'B2', fresh, stashes.at(-1)!.tailOperations, op); void outbox.enqueue(op, { deliveryLane: 'canonical-control-v1' }).catch(() => { control.cancelControl(receipt); }); }, fault, begin, () => control.authorIdle(nextEngine!, 'B2')).engine;
        installed = fresh;
        deps.engineRef.current = nextEngine;
        await restoreCanonicalRoomBaseline(nextEngine, fresh, fresh.tailOperations, () => deps.engineRef.current, deps.appliedOpIdsRef.current);
        expect(nextEngine['_log'].entries.map(e => e.serverSeq)).toEqual(tail.map(op => op.seq));
        expect(nextEngine['_log'].entries.every(e => e.canonicalInput?.operation.id === e.op.id)).toBe(true);
        // The second gesture's frame0 is durably placed AFTER metadata even
        // though its local CPU started earlier. Existing U4 retires that branch.
        const firstGesture = nextEngine['_log'].entries.filter(e => e.op.type === 'canonical_stroke' && e.op.frame.strokeId === operations[0].frame.strokeId);
        const secondGesture = nextEngine['_log'].entries.filter(e => e.op.type === 'canonical_stroke' && e.op.frame.strokeId === operations[firstCount].frame.strokeId);
        expect(firstGesture).toHaveLength(firstCount);
        expect(firstGesture.length).toBeGreaterThan(0);
        expect(firstGesture.every(e => e.state === 'gone')).toBe(true);
        expect(secondGesture).toHaveLength(operations.length - firstCount);
        expect(secondGesture.length).toBeGreaterThan(0);
        expect(secondGesture.every(e => e.state === 'done')).toBe(true);
        expect(nextEngine['_canonicalPixelsReady']).toBe(true);
        expect(fault).not.toHaveBeenCalled();
        // The real U1 candidate goes through the SAME local classification and Attempt.
        // Its ACK, with no broadcast at all, must keep the command busy until a new full cut.
        engine = nextEngine;
        read = fresh;
        control.bind(engine, 'B2');
        control.restored(engine);
        engine.setLocked(false);
        expect(engine['_canonicalLayerOwner']?.coordinator?.hasPendingLocal).not.toBe(true);
        const journal = engine['_log'].entries, revision = engine['_log'].revision, priorAttempts = attempts.length, request = () => { if (control.controlBusy(engine!, 'B2') || outbox.pendingCount)
            return null; return engine!.undo(); };
        expect(control.controlBusy(engine, 'B2')).toBe(false);
        expect(outbox.pendingCount).toBe(0);
        expect(request()).not.toBeNull();
        expect(control.controlBusy(engine, 'B2')).toBe(true);
        expect(request()).toBeNull();
        await vi.waitFor(() => expect(attempts).toHaveLength(priorAttempts + 1));
        const own = attempts.at(-1)!.op;
        expect(own.type).toBe('operation_undo');
        expect(engine['_log'].entries).toBe(journal);
        expect(engine['_log'].revision).toBe(revision);
        attempts.at(-1)!.resolve({ ok: true, seq: sequence + 1 });
        await outbox.whenIdle(2000);
        await vi.waitFor(() => expect(joining).toHaveBeenCalledTimes(2));
        expect(fresh.scope.isCurrent()).toBe(false);
        expect(control.controlBusy(engine, 'B2')).toBe(true);
        expect(request()).toBeNull();
        expect(engine['_log'].entries).toBe(journal);
        expect(engine['_log'].revision).toBe(revision);
        expect(deps.latestKnownSeqRef.current).toBe(sequence + 1);
        expect(fault).not.toHaveBeenCalled();
    }
    finally {
        close();
        outbox.dispose();
        nextEngine?.destroy();
        engine?.destroy();
        if (engine)
            expect(engine['_brushMipCache'].reservedBytes).toBe(0);
        if (nextEngine)
            expect(nextEngine['_brushMipCache'].reservedBytes).toBe(0);
        vi.restoreAllMocks();
    }
}, 45000);

async function indexedIngressSetup(){
 const {indexedSocketFixture,indexedFrame,indexedAttachment}=await import('../../../engine/testing/canonicalIndexedReadFixture')
 const operations:import('@grafetto/shared').CanonicalIndexedOperation[]=[],issuer=indexedSocketFixture(operations,64),s=setup()
 s.fake.connected=true;s.deps.wantedBoardRef.current='room'
 Object.assign(s.fake,{timeout:()=>s.fake,emitWithAck:(event:string,body:Record<string,unknown>)=>(issuer.socket as unknown as {emitWithAck:(event:string,body:Record<string,unknown>)=>Promise<unknown>}).emitWithAck(event,body)})
 const wire=emptyCanonicalState(),{tailOperations:_tail,canonicalReadScope:_scope,canonicalCapabilities:_caps,...metadata}=wire
 const state={...metadata,room:{...wire.room,id:'room',canvasWidth:8,canvasHeight:8},canonicalIndexedHistory:issuer.offer}
 const followRef:{current:(()=>void)|null}={current:null},stashes:import('../restoreRoomState').RoomStatePayload[]=[]
 s.deps.indexedFollowRef=followRef;s.deps.holdReviewArrivals=vi.fn();s.deps.isCanonicalEngineCurrent=(_engine,read)=>read===stashes.at(-1)?.canonicalIndexedRead?.lifetime
 s.deps.enterBoard=vi.fn((_board,stash)=>{stashes.push(stash)});s.deps.replaceCanonicalRoom=(_board,stash)=>{stashes.push(stash)}
 return{...s,issuer,operations,indexedFrame,indexedAttachment,state,followRef,stashes}
}
it('opens indexed offer before room dispatch and rejects late old actual open ACK without publishing it',async()=>{
 const h=await indexedIngressSetup(),old=h.issuer.handlers.canonical_history_stream_open
 let resolve!:()=>void
 h.issuer.handlers.canonical_history_stream_open=body=>new Promise(yes=>{resolve=()=>yes(old(body))})
 const close=connectRoomSocket(h.deps)
 try{
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state])
  expect(h.deps.holdReviewArrivals).toHaveBeenCalledOnce();expect(h.deps.setRoomContentReady).toHaveBeenCalledWith(false)
  expect(h.stashes).toHaveLength(0);expect(h.issuer.requests.filter(r=>r.event==='canonical_history_stream_open')).toHaveLength(1)
  h.deps.wantedBoardRef.current='other';resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()
  expect(h.stashes).toHaveLength(0);expect(h.fake.disconnect).not.toHaveBeenCalled()
 }finally{close()}
 expect(h.followRef.current).toBeNull()
})
it('rejects indexed offer without explicit consumer and rejects forbidden full-tail own field before open',async()=>{
 const h=await indexedIngressSetup();h.deps.indexedFollowRef=undefined
 let close=connectRoomSocket(h.deps)
 Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);expect(h.issuer.requests).toHaveLength(0);close()
 h.deps.indexedFollowRef=h.followRef;close=connectRoomSocket(h.deps)
 try{Reflect.apply(h.listeners.get('room_state')!,null,[{...h.state,tailOperations:undefined}]);expect(h.issuer.requests).toHaveLength(0)}finally{close()}
})

function indexedSocketEngine(read:import('./canonicalIndexedRead').CanonicalIndexedSocketRead,onCanonicalIndexedMetadata?:(input:import('../../../engine').CanonicalRecordedInput)=>void,onCanonicalIndexedReadIdle?:()=>void){
 const side=8
 const result=createTestEngine({onLocalOperation:vi.fn(),onCanonicalIndexedMetadata,onCanonicalIndexedReadIdle,canonicalAuthor:{begin:async()=>{throw Error('Unexpected socket test author begin')}},rasterVersion:'straight-rgba8-v1',pageWidth:side,pageHeight:side,canonicalIndexedRoom:read},{width:side,height:side}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
 const extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 // Local state observation supplements only; real engine/services/jobs execute.
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,
  getAttribLocation:(_program:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),
  getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},
  getTexParameter:(_target:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,
  getParameter:(key:number)=>key===9001?[0,0,side,side]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 for(const id of ['background','layer-1'])result.engine.initLayer(id)
 result.engine.setCompositeOrder([{id:'layer-1',opacity:1}])
 return result
}
it('consumes original indexed FOLLOW ranges while continuous peer hints retain no broadcast bodies or watermark minimum',async()=>{
 const h=await indexedIngressSetup(),close=connectRoomSocket(h.deps)
 let engine:PencilEngineAPI|undefined
 try{
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);await vi.waitFor(()=>expect(h.stashes).toHaveLength(1))
  const read=h.stashes[0].canonicalIndexedRead!;engine=indexedSocketEngine(read).engine;h.deps.engineRef.current=engine
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(prepareCanonicalImageAssets).not.toHaveBeenCalled();expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled()
  const continueOriginal=engine.appendCanonicalIndexedContinuation.bind(engine),cut=engine.getCanonicalIndexedCut()!
  let ranges=0
  const append=vi.spyOn(engine,'appendCanonicalIndexedContinuation').mockImplementation(async source=>{
   const outcome=await continueOriginal(source)
   if(++ranges===1){h.operations.push(h.indexedFrame(131,'writer-during-follow'));hint(131)}
   return outcome
  })
  h.operations.push(...Array.from({length:130},(_,i)=>h.indexedFrame(i+1,'continuous',i===129,i)))
  const hint=(n:number)=>Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:n,operation:h.operations[n-1],canonicalCapabilities:h.indexedAttachment([h.operations[n-1]])}])
  hint(129);hint(130);expect(append).not.toHaveBeenCalled();expect(h.deps.latestKnownSeqRef.current).toBe(0)
  h.deps.roomContentReadyRef.current=true;h.followRef.current!()
  await vi.waitFor(()=>expect(engine!.getCanonicalIndexedCut()?.throughSeq).toBe(131),{timeout:10000})
  expect(append).toHaveBeenCalledTimes(3);expect(engine.getCanonicalIndexedCut()!.lifetime).toBe(read.lifetime);expect(cut.throughSeq).toBe(0)
  expect(h.deps.applyRemoteOp).not.toHaveBeenCalled();expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(h.deps.latestKnownSeqRef.current).toBe(0)
  expect(h.issuer.requests.filter(r=>r.event==='canonical_history_stream_reopen').map(r=>r.body.afterSeq)).toEqual([0,64,128])
 }finally{close();engine?.destroy()}
},15000)
it('pauses indexed FOLLOW at original metadata while SAME healthy U3 waits local drain without source fault or reopen spin',async()=>{
 const h=await indexedIngressSetup(),close=connectRoomSocket(h.deps)
 let engine:PencilEngineAPI|undefined,pending=true
 try{
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);await vi.waitFor(()=>expect(h.stashes).toHaveLength(1))
  const read=h.stashes[0].canonicalIndexedRead!,origin=read.lifetime,hold=vi.fn(),known=vi.fn(),metadata=vi.fn()
  const recovery=createCanonicalRecoveryControl({getEngine:()=>engine??null,getBoard:()=> 'room',hasPendingLocals:()=>pending,canRequest:()=>true,resync:()=>h.deps.requestFullResyncRef.current!(),onWaiting:vi.fn(),onHistoryJoining:()=>{h.deps.roomContentReadyRef.current=false},holdHistory:hold,noteKnownSequence:known,getControlLineage:()=>({socket:h.deps.socketRef.current!,connectionId:'one',boardId:'room',originalRead:origin})})
  engine=indexedSocketEngine(read,input=>{metadata(input);expect(recovery.confirmedIndexedControl(engine!,'room',origin,input)).toBe(true)}).engine
  h.deps.engineRef.current=engine;recovery.bind(engine,'room');await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);recovery.restored(engine)
  h.operations.push(h.indexedFrame(1),{id:'undo',type:'operation_undo',userId:'actor',timestamp:0,targetOpId:'frame1',seq:2})
  h.deps.roomContentReadyRef.current=true
  const hint={seq:2,operation:h.operations[1]}
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[hint])
  await vi.waitFor(()=>expect(metadata).toHaveBeenCalledOnce())
  expect(hold).toHaveBeenCalledOnce();expect(known).toHaveBeenLastCalledWith(2);expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(0)
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[hint]);h.followRef.current!();await Promise.resolve();await Promise.resolve()
  expect(h.issuer.requests.filter(r=>r.event==='canonical_history_stream_reopen')).toHaveLength(1);expect(h.fake.disconnect).not.toHaveBeenCalled()
  pending=false;expect(recovery.drain()).toBe(true);expect(()=>origin.assertCurrent()).toThrow()
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:3,operation:{id:'expired-during-rejoin',type:'layer_clear',layerId:'layer-1',userId:'peer',timestamp:0,seq:3}}])
  expect(h.deps.applyRemoteOp).not.toHaveBeenCalled();expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled()
 }finally{close();engine?.destroy()}
},15000)
it('drops late indexed FOLLOW ACK after a newer room origin without faulting the replacement gate',async()=>{
 const h=await indexedIngressSetup(),close=connectRoomSocket(h.deps)
 let engine:PencilEngineAPI|undefined,release!:()=>void
 try{
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);await vi.waitFor(()=>expect(h.stashes).toHaveLength(1))
  const oldRead=h.stashes[0].canonicalIndexedRead!;engine=indexedSocketEngine(oldRead).engine;h.deps.engineRef.current=engine
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(oldRead);h.deps.roomContentReadyRef.current=true
  h.operations.push(h.indexedFrame(1))
  const original=h.issuer.handlers.canonical_history_stream_reopen
  h.issuer.handlers.canonical_history_stream_reopen=body=>{const result=original(body);return new Promise(resolve=>{release=()=>resolve(result)})}
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:1,operation:h.operations[0],canonicalCapabilities:h.indexedAttachment(h.operations)}])
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);release()
  await vi.waitFor(()=>expect(h.stashes).toHaveLength(2))
  expect(h.stashes[1].canonicalIndexedRead!.lifetime).not.toBe(oldRead.lifetime)
  expect(h.fake.disconnect).not.toHaveBeenCalled();expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(h.deps.applyRemoteOp).not.toHaveBeenCalled()
 }finally{release?.();close();engine?.destroy()}
},15000)
it('defers indexed FOLLOW acquisition during engine-owned history selection and resumes from exact read idle',async()=>{
 const h=await indexedIngressSetup(),close=connectRoomSocket(h.deps)
 let engine:PencilEngineAPI|undefined,release!:()=>void
 try{
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);await vi.waitFor(()=>expect(h.stashes).toHaveLength(1))
  const read=h.stashes[0].canonicalIndexedRead!
  engine=indexedSocketEngine(read,undefined,()=>queueMicrotask(()=>h.followRef.current?.())).engine;h.deps.engineRef.current=engine
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);engine.setUserId('actor');engine.setLocked(false)
  h.deps.roomContentReadyRef.current=true
  h.issuer.handlers.canonical_history_stream_select=()=>new Promise(resolve=>{release=()=>resolve({ok:true,value:null})})
  const selecting=engine.requestHistory('undo');await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  h.operations.push(h.indexedFrame(1))
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:1,operation:h.operations[0],canonicalCapabilities:h.indexedAttachment(h.operations)}])
  await Promise.resolve();await Promise.resolve()
  expect(h.issuer.requests.filter(r=>r.event==='canonical_history_stream_reopen')).toHaveLength(0)
  expect(h.fake.disconnect).not.toHaveBeenCalled();release();expect(await selecting).toBeNull()
  await vi.waitFor(()=>expect(engine!.getCanonicalIndexedCut()?.throughSeq).toBe(1),{timeout:10000})
  expect(h.issuer.requests.filter(r=>r.event==='canonical_history_stream_reopen')).toHaveLength(1);expect(h.fake.disconnect).not.toHaveBeenCalled()
 }finally{release?.();close();engine?.destroy()}
},15000)
it('drains prior legacy held arrivals through a closed indexed replay lane after actual baseline without paint or ACK',async()=>{
 const h=await indexedIngressSetup(),gate=createReplayGate<Parameters<ServerToClientEvents['operation_confirmed']>[0]>()
 let ticket=gate.begin(),engine:PencilEngineAPI|undefined
 h.deps.replayGate=gate;h.deps.holdReviewArrivals=()=>{ticket=gate.begin()}
 h.deps.appliedOpIdsRef.current.add('legacy-own')
 const close=connectRoomSocket(h.deps)
 try{
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:1,operation:{id:'legacy-own',type:'layer_clear',layerId:'layer-1',userId:'actor',timestamp:0,seq:1}}])
  Reflect.apply(h.listeners.get('operation_confirmed')!,null,[{seq:2,operation:{id:'legacy-peer',type:'layer_clear',layerId:'layer-1',userId:'peer',timestamp:0,seq:2}}])
  expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(h.deps.applyRemoteOp).not.toHaveBeenCalled()
  Reflect.apply(h.listeners.get('room_state')!,null,[h.state]);await vi.waitFor(()=>expect(h.stashes).toHaveLength(1))
  const read=h.stashes[0].canonicalIndexedRead!;engine=indexedSocketEngine(read).engine;h.deps.engineRef.current=engine
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(gate.end(ticket)).toBe(true)
  expect(h.deps.confirmOwnOperation).not.toHaveBeenCalled();expect(h.deps.applyRemoteOp).not.toHaveBeenCalled();expect(h.deps.syncFromLog).not.toHaveBeenCalled()
  expect(h.deps.lastConfirmedSeqRef.current).toBe(0);expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(0)
  const remainder=vi.fn();gate.setHandler(remainder);expect(gate.end(gate.begin())).toBe(true);expect(remainder).not.toHaveBeenCalled()
 }finally{close();engine?.destroy()}
},15000)

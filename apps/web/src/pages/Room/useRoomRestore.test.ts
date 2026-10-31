import { expect, it, vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { createTestEngine, dab, makeStroke } from '../../engine/testing/engineTestUtils'
import { createPendingPreviews } from './net/pendingPreviews'
import { createReplayGate } from './replayGate'
import { useRoomRestore, type RoomRestoreDeps } from './useRoomRestore'

// Execute the real hook and real restoreRoomState. Node models React's
// memo/ref retention; no DOM renderer or physical GPU is claimed here.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value: unknown; deps?: unknown[] }> }))
vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const slot = hooks.cursor++
    if (!hooks.slots[slot]) hooks.slots[slot] = { value: { current: value } }
    return hooks.slots[slot].value
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const slot = hooks.cursor++, prev = hooks.slots[slot]
    if (!prev || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps![i]))) hooks.slots[slot] = { value: callback, deps }
    return hooks.slots[slot].value
  },
}))
vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../../stores/noticeStore', () => ({ notifyError: vi.fn() }))
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

it('forwards opt-in through the real Room hook without duplicating restore on unchanged render', async () => {
  hooks.cursor = 0; hooks.slots = []
  const off = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  const on = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  off.setBaseLayers(['L']); on.setBaseLayers(['L'])
  const first: Operation = { ...makeStroke('A', 'L', [dab(2, 4)]), tool: 'watercolor', preset: 'normal:100:100:PB29:round', strokeId: 'first', seq: 1 }
  const last: Operation = { ...makeStroke('A', 'L', [dab(6, 4)]), tool: 'watercolor', preset: 'normal:100:100:PB29:round', strokeId: 'last', seq: 3 }
  const ops: Operation[] = [first, { type: 'layer_clear', id: 'clear', userId: 'A', timestamp: 2, layerId: 'L', seq: 2 }, last]
  let target = on
  const apply = vi.fn((op: Operation) => target.appendOperation(op, 'remote'))
  const deps: RoomRestoreDeps = {
    diagnosticClearPrefixElision: true,
    restoreFromSnapshot: vi.fn().mockResolvedValue('none'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp: apply, syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
    setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), latestKnownSeqRef: { current: 3 }, replayIncompleteRef: { current: false },
    pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  const state = { latestSnapshotSeq: null, tailOperations: ops, participants: [], palette: [], frozen: false }
  const occasion = { mode: 'join' as const, alreadyHadSeq: 0 }
  const call = { boardId: 'room', finishOpenTimer: vi.fn(), getSnapshotUploader: () => null }
  const restore = useRoomRestore(deps)
  hooks.cursor = 0
  expect(useRoomRestore(deps)).toBe(restore)
  expect(apply).not.toHaveBeenCalled()
  const onPaint = vi.spyOn(on as unknown as { _paintDabs: (...args: unknown[]) => unknown }, '_paintDabs')
  await restore(on, state, occasion, call)
  expect(onPaint).toHaveBeenCalledTimes(1)
  expect(on.getOperations().map(op => op.id)).toEqual(ops.map(op => op.id))
  hooks.cursor = 0
  const ordinary = useRoomRestore({ ...deps, diagnosticClearPrefixElision: undefined })
  expect(ordinary).not.toBe(restore)
  target = off
  const offPaint = vi.spyOn(off as unknown as { _paintDabs: (...args: unknown[]) => unknown }, '_paintDabs')
  await ordinary(off, state, occasion, call)
  expect(offPaint).toHaveBeenCalledTimes(2)
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  on.destroy(); off.destroy()
})

it('forwards the original full-history baseline sink through the Room hook to the real empty engine transaction',async()=>{
 hooks.cursor=0;hooks.slots=[]
 const {prepareCanonicalRoomState}=await import('./net/canonicalRoomState')
 const wire:Parameters<import('@grafetto/shared').ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const state=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),{engine}=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:state.canonicalRead,tail:state.tailOperations}},{width:8,height:8})
 engine.initLayer('background');engine.initLayer('layer-1')
 const sink=vi.fn<NonNullable<RoomRestoreDeps['restoreCanonicalEmptyRoom']>>(async(target,read,tail)=>{await target.restoreCanonicalEmptyRoom(read,tail)})
 const deps:RoomRestoreDeps={restoreCanonicalEmptyRoom:sink,restoreFromSnapshot:vi.fn(),backfillHistory:vi.fn(),applyRemoteOp:vi.fn(),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 try{
  const restore=useRoomRestore(deps);hooks.cursor=0;expect(useRoomRestore(deps)).toBe(restore)
  await restore(engine,state,{mode:'join',alreadyHadSeq:0},{boardId:'room',finishOpenTimer:vi.fn(),getSnapshotUploader:()=>null})
  expect(sink).toHaveBeenCalledExactlyOnceWith(engine,state.canonicalRead,state.tailOperations)
  expect(engine['_canonicalPixelsReady']).toBe(true);expect(deps.setRestoreFailure).not.toHaveBeenCalled();expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  hooks.cursor=0;expect(useRoomRestore({...deps,restoreCanonicalEmptyRoom:undefined})).not.toBe(restore)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

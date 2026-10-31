import { describe, expect, it, vi } from 'vitest'
import type { PencilEngineAPI } from '../../engine'
import type { RemoteOperationsDeps } from './useRemoteOperations'

// Node has no DOM renderer. Model only React's memo/ref retention contract;
// execute the real Room hook, including its actual dependency arrays.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value: unknown; deps?: unknown[] }> }))
vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const slot = hooks.cursor++
    if (!hooks.slots[slot]) hooks.slots[slot] = { value: { current: value } }
    return hooks.slots[slot].value
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const slot = hooks.cursor++, prev = hooks.slots[slot]
    if (!prev || !prev.deps || prev.deps.length !== deps.length || deps.some((d, i) => !Object.is(d, prev.deps![i]))) hooks.slots[slot] = { value: callback, deps }
    return hooks.slots[slot].value
  },
}))
vi.mock('./net/snapshotRestore', () => ({ restoreLatestSnapshot: vi.fn(), walkHistoryBackward: vi.fn(async () => {}) }))
import { useRemoteOperations } from './useRemoteOperations'
import { walkHistoryBackward } from './net/snapshotRestore'
import { createTestEngine, dab, makeStroke } from '../../engine/testing/engineTestUtils'
import { createBrushRandomStrokeId } from '@grafetto/shared'

describe('Room repair hook render identity', () => {
  it('keeps restore/backfill callbacks stable while calling the latest failure handler', async () => {
    hooks.slots = []; hooks.cursor = 0
    const engine = { pendingSnapshotHistoryRepairs: () => [{ layerId: 'L', beforeSeq: 3 }], absorbHistoricalOperations: vi.fn() } as unknown as PencilEngineAPI
    const firstFailure = vi.fn(), latestFailure = vi.fn(), noop = vi.fn()
    const deps = {
      engineRef: { current: engine }, boardId: 'room', onHistoryRepairFailure: firstFailure,
      appliedOpIdsRef: { current: new Set<string>() }, deferredOpsQueueRef: { current: [] }, restoredLayerStateRef: { current: null },
      markActive: noop, resolveTransformCommit: noop, confirmOwnOperation: noop, noteOperationSeq: noop, syncFromLog: noop, checkSnapshotBoundary: noop,
    } as RemoteOperationsDeps
    const first = useRemoteOperations(deps)
    hooks.cursor = 0
    const next = useRemoteOperations({ ...deps, onHistoryRepairFailure: latestFailure })
    expect(next.repairSnapshotHistory).toBe(first.repairSnapshotHistory)
    expect(next.backfillHistory).toBe(first.backfillHistory)
    expect(next.restoreFromSnapshot).toBe(first.restoreFromSnapshot)
    next.repairSnapshotHistory()
    await vi.waitFor(() => expect(latestFailure).toHaveBeenCalledOnce())
    expect(firstFailure).not.toHaveBeenCalled()
  })
})

it('rejects invalid random metadata before dedupe and restores retryability when the engine rejects an operation', () => {
 hooks.slots=[];hooks.cursor=0
 const appendOperation=vi.fn(),failure=vi.fn(),noop=vi.fn()
 const deps={engineRef:{current:{appendOperation} as unknown as PencilEngineAPI},boardId:'room',onHistoryRepairFailure:failure,
 appliedOpIdsRef:{current:new Set<string>(['seen'])},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
 markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop} as RemoteOperationsDeps
 const {applyRemoteOp}=useRemoteOperations(deps)
 const base={id:'seen',type:'stroke' as const,userId:'peer',timestamp:0,layerId:'ink',tool:'digitalBrush' as const,preset:'hard-round',color:[0,0,0] as [number,number,number],dabs:[],strokeId:'legacy'}
 applyRemoteOp({...base,brushRandom:{version:1,sequentialSeed:0,strokeSeed:1}})
 expect(failure).toHaveBeenCalledTimes(1);expect(appendOperation).not.toHaveBeenCalled()
 appendOperation.mockImplementation(()=>{throw new Error('Invalid brush random context')})
 applyRemoteOp({...base,id:'retry'})
 expect(deps.appliedOpIdsRef.current.has('retry')).toBe(false)
 expect(failure).toHaveBeenCalledTimes(2)
})

it('includes the snapshot boundary in ordinary history backfill through the real exclusive walker', async () => {
 hooks.slots=[];hooks.cursor=0
 const {walkHistoryBackward: realWalk}=await vi.importActual<typeof import('./net/snapshotRestore')>('./net/snapshotRestore')
 const {engine}=createTestEngine({userId:'observer'},{width:16,height:16})
 const seeds={version:1 as const,sequentialSeed:0,strokeSeed:0xffffffff}
 const strokeId=createBrushRandomStrokeId('history000',seeds)
 const ops=[
  {...makeStroke('author','L',[dab(4,4)],{tool:'digitalBrush',preset:'hard-round',strokeId,brushRandom:seeds}),id:'prefix',seq:1},
  {...makeStroke('author','L',[],{tool:'digitalBrush',preset:'hard-round',strokeId,brushRandom:seeds,strokeEnd:true}),id:'snapshot-boundary-final',seq:2},
  {...makeStroke('author','L',[dab(8,8)],{tool:'pencil',preset:'HB',strokeId:'tail'}),id:'tail',seq:3},
 ]
 const calls:Array<{beforeSeq:number;limit:number}>=[]
 vi.mocked(walkHistoryBackward).mockImplementation((room,from,depth,onPage)=>realWalk(room,from,depth,onPage,async(_room,beforeSeq,limit=250)=>{
  calls.push({beforeSeq,limit});return ops.filter(op=>op.seq<beforeSeq).slice(-limit)
 }))
 const noop=vi.fn(),deps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:vi.fn(),
 appliedOpIdsRef:{current:new Set<string>(['tail'])},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
 markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop} as RemoteOperationsDeps
 try {
  engine.setBaseLayers(['L']);engine.appendOperation(ops[2],'remote')
  await useRemoteOperations(deps).backfillHistory('room',engine,2)
  expect(calls[0].beforeSeq).toBe(3)
  expect(engine.getOperations().map(op=>op.id)).toEqual(['prefix','snapshot-boundary-final','tail'])
  expect(engine.getOperations()[1]).toMatchObject({strokeEnd:true,brushRandom:seeds,strokeId})
  expect(deps.appliedOpIdsRef.current).toEqual(new Set(ops.map(op=>op.id)))
  // Reconnect/backfill repeats the inclusive boundary; history merge stays idempotent.
  await useRemoteOperations(deps).backfillHistory('room',engine,2)
  expect(engine.getOperations().map(op=>op.id)).toEqual(['prefix','snapshot-boundary-final','tail'])
 } finally {engine.destroy();vi.mocked(walkHistoryBackward).mockReset()}
})

it('latches snapshot expected encoding from the engine before await and forwards decoded format',async()=>{
 const {restoreLatestSnapshot}=await import('./net/snapshotRestore')
 for(const [version,encoding] of [['legacy-pm8-v1','premultiplied-rgba8'],['straight-rgba8-v1','straight-rgba8']] as const){
  hooks.slots=[];hooks.cursor=0
  let currentVersion:string=version,reads=0,complete!:(value:{status:'none'})=>void
  const restore=vi.fn(),noop=vi.fn()
  const engine={get rasterVersion(){reads++;return currentVersion},restoreLayerFromSnapshot:restore,takeSnapshotRestoreAudit:()=>[],gpuInfo:()=>({})} as unknown as PencilEngineAPI
  const deps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:noop,appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop} as RemoteOperationsDeps
  vi.mocked(restoreLatestSnapshot).mockImplementationOnce((_id,sink)=>{
   expect(sink.expectedPixelEncoding).toBe(encoding)
   return new Promise(resolve=>{complete=resolve;queueMicrotask(()=>sink.applyLayer('L',[],7,encoding))})
  })
  const pending=useRemoteOperations(deps).restoreFromSnapshot(engine,'room')
  currentVersion=version==='legacy-pm8-v1'?'straight-rgba8-v1':'legacy-pm8-v1' // later room/ref changes cannot select this restore mode
  await Promise.resolve();complete({status:'none'});expect(await pending).toBe('none')
  expect(reads).toBe(1);expect(restore).toHaveBeenCalledWith('L',[],7,encoding)
 }
})
it('requires explicit per-call canonical history owner and forwards captured scope to the existing snapshot sink',async()=>{
 hooks.slots=[];hooks.cursor=0
 const {prepareCanonicalRoomState}=await import('./net/canonicalRoomState'),{restoreLatestSnapshot}=await import('./net/snapshotRestore')
 const {engine}=createTestEngine({userId:'reader'},{width:8,height:8})
 const wire:Parameters<import('@grafetto/shared').ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2}}
 let current=true
 const read=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead,noop=vi.fn()
 const deps:RemoteOperationsDeps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:noop,appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop}
 try{
  vi.mocked(restoreLatestSnapshot).mockClear()
  await expect(useRemoteOperations(deps).restoreFromSnapshot(engine,'room',read)).rejects.toThrow('sinks unavailable')
  expect(restoreLatestSnapshot).not.toHaveBeenCalled()
  hooks.cursor=0;const restore=vi.fn(async()=>{}),absorb=vi.fn()
  vi.mocked(restoreLatestSnapshot).mockImplementationOnce(async(_id,sink)=>{
   expect(sink.canonicalRead).toBe(read.scope);expect(sink.restoreCanonicalHistory).toBeDefined()
   await sink.restoreCanonicalHistory!([],true)
   return {status:'none'}
  })
  expect(await useRemoteOperations({...deps,canonicalHistory:{restore,absorb}}).restoreFromSnapshot(engine,'room',read)).toBe('none')
  expect(restore).toHaveBeenCalledWith(engine,[],true);expect(absorb).not.toHaveBeenCalled()
  hooks.cursor=0;const hook=useRemoteOperations({...deps,canonicalHistory:{restore,absorb}})
  const op={id:'scoped-legacy',seq:1,userId:'author',timestamp:0,type:'layer_add' as const,layerId:'L',name:'Layer'}
  vi.mocked(walkHistoryBackward).mockImplementationOnce(async(_room,_from,_depth,_legacy,_fetch,canonical)=>{
   expect(canonical?.scope).toBe(read.scope);canonical!.onPage([{operation:op}])
  })
  await hook.backfillHistory('room',engine,1,read)
  expect(absorb).toHaveBeenCalledWith(engine,[{operation:op}]);expect(deps.appliedOpIdsRef.current.has(op.id)).toBe(true)
  vi.spyOn(engine,'pendingSnapshotHistoryRepairs').mockReturnValue([{layerId:'L',beforeSeq:1}])
  vi.mocked(walkHistoryBackward).mockImplementationOnce(async(_room,_from,_depth,_legacy,_fetch,canonical)=>{current=false;canonical!.onPage([{operation:{...op,id:'stale'}}])})
  await expect(hook.backfillHistory('room',engine,1,read)).rejects.toThrow('Stale')
  expect(deps.appliedOpIdsRef.current.has('stale')).toBe(false);expect(noop).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})

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
  it('keeps repair/restore/backfill callbacks stable across board changes and calls the latest failure handler', async () => {
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
    const next = useRemoteOperations({ ...deps, boardId: 'next-room', onHistoryRepairFailure: latestFailure })
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

it('keeps one in-flight repair while a busy-hook higher request is drained by that same continuation',async()=>{
 hooks.slots=[];hooks.cursor=0;vi.mocked(walkHistoryBackward).mockReset()
 let needed=[{layerId:'A',beforeSeq:20}],release!:()=>void,cursor=0
 const gate=new Promise<void>(resolve=>{release=resolve})
 const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{if(cursor===50)needed=[]})}as unknown as PencilEngineAPI
 vi.mocked(walkHistoryBackward).mockImplementation(async(_room,from,_depth,consume)=>{cursor=from;if(from===20)await gate;consume([])})
 const noop=vi.fn(),failure=vi.fn(),deps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:failure,
 appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
 markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop}as RemoteOperationsDeps
 const hook=useRemoteOperations(deps);hook.repairSnapshotHistory();await Promise.resolve();expect(walkHistoryBackward).toHaveBeenCalledTimes(1)
 needed=[{layerId:'B',beforeSeq:50}];hook.repairSnapshotHistory();expect(walkHistoryBackward).toHaveBeenCalledTimes(1)
 release();await vi.waitFor(()=>expect(walkHistoryBackward).toHaveBeenCalledTimes(2));await vi.waitFor(()=>expect(noop).toHaveBeenCalled())
 expect(vi.mocked(walkHistoryBackward).mock.calls.map(x=>x[1])).toEqual([20,50]);expect(failure).not.toHaveBeenCalled();expect(needed).toEqual([])
})

it('hands off a NEW pending range in the successful last-check/finally window, without changing the existing in-flight map',async()=>{
 hooks.slots=[];hooks.cursor=0;vi.mocked(walkHistoryBackward).mockReset()
 let needed=[{layerId:'A',beforeSeq:20}],introduced=false
 const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{needed=[]})}as unknown as PencilEngineAPI
 vi.mocked(walkHistoryBackward).mockImplementation(async(_room,_from,_depth,consume)=>{consume([])})
 const noop=vi.fn(),failure=vi.fn();let hook:ReturnType<typeof useRemoteOperations>
 const sync=vi.fn(()=>{if(!introduced){introduced=true;needed=[{layerId:'B',beforeSeq:50}];hook.repairSnapshotHistory();expect(walkHistoryBackward).toHaveBeenCalledTimes(1)}})
 const deps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:failure,
 appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
 markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:sync,checkSnapshotBoundary:noop}as RemoteOperationsDeps
 hook=useRemoteOperations(deps);hook.repairSnapshotHistory()
 await vi.waitFor(()=>expect(sync).toHaveBeenCalledTimes(2));expect(vi.mocked(walkHistoryBackward).mock.calls.map(x=>x[1])).toEqual([20,50]);expect(failure).not.toHaveBeenCalled();expect(needed).toEqual([])
})

it.each(['error','navigation','empty']as const)('does not hand off after %s',async mode=>{
 hooks.slots=[];hooks.cursor=0;vi.mocked(walkHistoryBackward).mockReset()
 let needed=[{layerId:'A',beforeSeq:20}]
 const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{if(mode==='empty')needed=[]})}as unknown as PencilEngineAPI
 const engineRef:{current:PencilEngineAPI|null}={current:engine}
 vi.mocked(walkHistoryBackward).mockImplementation(async(_room,_from,_depth,consume)=>{if(mode==='navigation')engineRef.current=null;consume([])})
 const noop=vi.fn(),failure=vi.fn(),sync=vi.fn(),deps={engineRef,boardId:'room',onHistoryRepairFailure:failure,
 appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
 markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:sync,checkSnapshotBoundary:noop}as RemoteOperationsDeps
 const hook=useRemoteOperations(deps);hook.repairSnapshotHistory();for(let n=0;n<10;n++)await Promise.resolve()
 expect(walkHistoryBackward).toHaveBeenCalledTimes(1)
 if(mode==='error')expect(failure).toHaveBeenCalledTimes(1);else expect(failure).not.toHaveBeenCalled()
 if(mode==='empty')expect(sync).toHaveBeenCalledTimes(1);else expect(sync).not.toHaveBeenCalled()
})

it('does not run a queued successful handoff against a successor engine after navigation',async()=>{
 hooks.slots=[];hooks.cursor=0;vi.mocked(walkHistoryBackward).mockReset()
 const queued:Array<()=>void>=[],schedule=vi.spyOn(globalThis,'queueMicrotask').mockImplementation(task=>{queued.push(task)})
 try{
  let needed=[{layerId:'A',beforeSeq:20}]
  const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{needed=[]})}as unknown as PencilEngineAPI
  const engineRef:{current:PencilEngineAPI|null}={current:engine};vi.mocked(walkHistoryBackward).mockImplementation(async(_room,_from,_depth,consume)=>{consume([])})
  const noop=vi.fn(),failure=vi.fn(),sync=vi.fn(()=>{needed=[{layerId:'B',beforeSeq:50}]}),deps={engineRef,boardId:'oldroom',onHistoryRepairFailure:failure,
  appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},
  markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:sync,checkSnapshotBoundary:noop}as RemoteOperationsDeps
  useRemoteOperations(deps).repairSnapshotHistory();for(let n=0;n<10;n++)await Promise.resolve();expect(queued).toHaveLength(1)
  engineRef.current={pendingSnapshotHistoryRepairs:()=>[{layerId:'new',beforeSeq:90}]}as unknown as PencilEngineAPI
  queued[0]();for(let n=0;n<4;n++)await Promise.resolve();expect(walkHistoryBackward).toHaveBeenCalledTimes(1);expect(failure).not.toHaveBeenCalled()
 }finally{schedule.mockRestore()}
})
it.each(['board','engine'] as const)('does not install or publish an awaited snapshot after its %s owner changes',async change=>{
 hooks.slots=[];hooks.cursor=0
 const noop=vi.fn(),engine={setBaseLayers:vi.fn(),restoreLayerFromSnapshot:vi.fn(),takeSnapshotRestoreAudit:vi.fn(),setActiveLayer:vi.fn(),setCompositeOrder:vi.fn()} as unknown as PencilEngineAPI
 const deps={engineRef:{current:engine},boardId:'old-board',onHistoryRepairFailure:noop,appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop} as RemoteOperationsDeps
 const network=await import('./net/snapshotRestore')
 let deliver!:()=>void
 vi.mocked(network.restoreLatestSnapshot).mockImplementationOnce(async(_room,sink)=>{
  await new Promise<void>(resolve=>{deliver=resolve})
  sink.beginLayers({items:{},rootOrder:[],activeId:'background',selectedIds:[]})
  return{status:'none'}
 })
 const first=useRemoteOperations(deps),work=first.restoreFromSnapshot(engine,'old-board')
 // Record a handler immediately; cancellation is an expected rejected completion.
 const settled=work.then(()=>null,error=>error as Error)
 if(change==='board'){hooks.cursor=0;useRemoteOperations({...deps,boardId:'new-board'})}
 else deps.engineRef.current={} as PencilEngineAPI
 deliver()
 expect((await settled)?.name).toBe('AbortError')
 expect(engine.setBaseLayers).not.toHaveBeenCalled();expect(engine.restoreLayerFromSnapshot).not.toHaveBeenCalled();expect(engine.takeSnapshotRestoreAudit).toHaveBeenCalledTimes(1);expect(engine.setActiveLayer).not.toHaveBeenCalled()
})

it('retires partial old audit synchronously before new pixels can append their audit',async()=>{
 hooks.slots=[];hooks.cursor=0
 const audit:string[]=[];const reports:string[][]=[];const noop=vi.fn()
 const engine={setBaseLayers:noop,restoreLayerFromSnapshot:(_layer:string,_tiles:unknown,seq:number)=>audit.push(String(seq)),takeSnapshotRestoreAudit:()=>{const out=audit.splice(0);reports.push(out);return[]},gpuInfo:()=>null} as unknown as PencilEngineAPI
 const deps={engineRef:{current:engine},boardId:'room',onHistoryRepairFailure:noop,appliedOpIdsRef:{current:new Set<string>()},deferredOpsQueueRef:{current:[]},restoredLayerStateRef:{current:null},markActive:noop,resolveTransformCommit:noop,confirmOwnOperation:noop,noteOperationSeq:noop,syncFromLog:noop,checkSnapshotBoundary:noop} as RemoteOperationsDeps
 const network=await import('./net/snapshotRestore'),generation=await import('../../engine/restoreGeneration')
 let release!:()=>void
 vi.mocked(network.restoreLatestSnapshot).mockImplementationOnce(async(_room,sink)=>{
  sink.applyLayer('L',[],10)
  await new Promise<void>(resolve=>{release=resolve})
  return{status:'none'}
 }).mockImplementationOnce(async(_room,sink)=>{sink.applyLayer('L',[],20);return{status:'none'}})
 const hook=useRemoteOperations(deps),oldOwner=generation.beginRestoreGeneration(engine)
 const old=hook.restoreFromSnapshot(engine,'room',oldOwner.signal).catch(error=>error as Error)
 const newOwner=generation.beginRestoreGeneration(engine)
 expect(reports).toEqual([['10']])
 await hook.restoreFromSnapshot(engine,'room',newOwner.signal)
 expect(reports).toEqual([['10'],['20']])
 release();expect((await old as Error).name).toBe('AbortError')
 expect(reports).toEqual([['10'],['20']])
 generation.finishRestoreGeneration(engine,newOwner)
})

it('retires repair on a board change before engine replacement and rejects its stale owner callback (#850)', async () => {
  hooks.slots = []; hooks.cursor = 0; vi.mocked(walkHistoryBackward).mockReset()
  let deliver!: () => void
  const gate = new Promise<void>(resolve => { deliver = resolve })
  const absorb = vi.fn(), failure = vi.fn(), sync = vi.fn(), noop = vi.fn()
  const engine = { pendingSnapshotHistoryRepairs: () => [{ layerId: 'L', beforeSeq: 10 }], absorbHistoricalOperations: absorb } as unknown as PencilEngineAPI
  vi.mocked(walkHistoryBackward).mockImplementationOnce(async (_room, _from, _depth, consume) => { await gate; consume([]) })
  const deps = { engineRef: { current: engine }, boardId: 'old', onHistoryRepairFailure: failure,
    appliedOpIdsRef: { current: new Set<string>() }, deferredOpsQueueRef: { current: [] }, restoredLayerStateRef: { current: null },
    markActive: noop, resolveTransformCommit: noop, confirmOwnOperation: noop, noteOperationSeq: noop, syncFromLog: sync, checkSnapshotBoundary: noop,
  } as RemoteOperationsDeps
  const old = useRemoteOperations(deps)
  old.repairSnapshotHistory()
  await vi.waitFor(() => expect(walkHistoryBackward).toHaveBeenCalledOnce())
  hooks.cursor = 0
  const next = useRemoteOperations({ ...deps, boardId: 'new' })
  deliver()
  for (let i = 0; i < 12; i++) await Promise.resolve()
  expect(absorb).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled()
  // The retiring engine's callback carries its original board explicitly.
  next.repairSnapshotHistory(engine, 'old')
  for (let i = 0; i < 4; i++) await Promise.resolve()
  expect(walkHistoryBackward).toHaveBeenCalledOnce()
})

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
 const network=await import('./net/snapshotRestore'),generation=await import('../../lib/restoreGeneration')
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

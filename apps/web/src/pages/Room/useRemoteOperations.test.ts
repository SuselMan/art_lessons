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

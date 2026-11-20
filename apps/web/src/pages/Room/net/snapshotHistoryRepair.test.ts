import type { Operation } from '@grafetto/shared'
import { describe, expect, it, vi } from 'vitest'
import { continueSnapshotHistoryRepair } from './snapshotHistoryRepair'

describe('covered snapshot repair continuation', () => {
  it('waits for the existing ordinary walk and does not fetch it twice', async () => {
    let resolve!: () => void
    const ordinary = new Promise<void>(r => { resolve = r })
    let needed = [{ layerId: 'L', beforeSeq: 50 }]
    const walk = vi.fn()
    const engine = { pendingSnapshotHistoryRepairs: () => needed, absorbHistoricalOperations: vi.fn() }
    const run = continueSnapshotHistoryRepair('room', engine, { ordinary, current: () => true, onPage: vi.fn(), walk })
    await Promise.resolve(); expect(walk).not.toHaveBeenCalled()
    needed = []; resolve()
    expect(await run).toBe(true); expect(walk).not.toHaveBeenCalled()
  })

  it('continues past the ordinary window only while a repair needs the older prefix', async () => {
    let needed = [{ layerId: 'L', beforeSeq: 20 }]
    const page: Operation[] = []
    const engine = { pendingSnapshotHistoryRepairs: () => needed, absorbHistoricalOperations: vi.fn(() => { needed = [] }) }
    const onPage = vi.fn()
    const walk = vi.fn(async (_room: string, from: number, depth: number, consume: (page: Operation[]) => void) => { expect(from).toBe(20); expect(depth).toBe(20); consume(page) })
    expect(await continueSnapshotHistoryRepair('room', engine, { current: () => true, onPage, walk })).toBe(true)
    expect(engine.absorbHistoricalOperations).toHaveBeenCalledOnce(); expect(onPage).toHaveBeenCalledWith(page)
  })

  it('fails explicitly when the server cannot supply the missing base', async () => {
    const engine = { pendingSnapshotHistoryRepairs: () => [{ layerId: 'L', beforeSeq: 20 }], absorbHistoricalOperations: vi.fn() }
    await expect(continueSnapshotHistoryRepair('room', engine, { current: () => true, onPage: vi.fn(), walk: vi.fn(async () => {}) })).rejects.toThrow('Incomplete')
  })

  it('does not inject a late page or signal ready after navigation', async () => {
    const engine = { pendingSnapshotHistoryRepairs: () => [{ layerId: 'L', beforeSeq: 20 }], absorbHistoricalOperations: vi.fn() }
    let current = true
    const walk = vi.fn(async (_room: string, _from: number, _depth: number, consume: (page: Operation[]) => void) => { current = false; consume([]) })
    expect(await continueSnapshotHistoryRepair('room', engine, { current: () => current, onPage: vi.fn(), walk })).toBe(false)
    expect(engine.absorbHistoricalOperations).not.toHaveBeenCalled()
  })
})

it('drains a newly higher/new-layer prefix inside the SAME work, without retrying the old range',async()=>{
 let needed=[{layerId:'A',beforeSeq:20}],cursor=0
 const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{needed=cursor===20?[{layerId:'B',beforeSeq:50}]:[]})}
 const walk=vi.fn(async(_room:string,from:number,_depth:number,consume:(page:Operation[])=>void)=>{cursor=from;consume([])})
 expect(await continueSnapshotHistoryRepair('room',engine,{current:()=>true,onPage:vi.fn(),walk})).toBe(true)
 expect(walk.mock.calls.map(x=>x[1])).toEqual([20,50])
})
it.each([20,10])('fails instead of retrying same/older unresolved prefix %s',async remaining=>{
 let needed=[{layerId:'A',beforeSeq:20}]
 const engine={pendingSnapshotHistoryRepairs:()=>needed,absorbHistoricalOperations:vi.fn(()=>{needed=[{layerId:'B',beforeSeq:remaining}]})}
 const walk=vi.fn(async(_room:string,_from:number,_depth:number,consume:(page:Operation[])=>void)=>consume([]))
 await expect(continueSnapshotHistoryRepair('room',engine,{current:()=>true,onPage:vi.fn(),walk})).rejects.toThrow('Incomplete')
 expect(walk).toHaveBeenCalledTimes(1)
})

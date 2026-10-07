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

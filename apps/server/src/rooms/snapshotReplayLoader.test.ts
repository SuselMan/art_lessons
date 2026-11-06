import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Operation } from '@grafetto/shared'

const mocks = vi.hoisted(() => ({
  rooms: new Map(), flush: vi.fn().mockResolvedValue(undefined),
  state: vi.fn(), snapshots: vi.fn(), operations: vi.fn(),
}))
vi.mock('./roomRegistry.js', () => ({ rooms: mocks.rooms, flushRoomWrites: mocks.flush }))
vi.mock('../db/prisma.js', () => ({ prisma: {
  roomLayerState: { findUnique: mocks.state }, roomLayerSnapshot: { findMany: mocks.snapshots },
  operation: { findMany: mocks.operations },
} }))
import { prepareSnapshotReplay } from './snapshotReplayLoader.js'

const stroke = (id: string, seq: number): Operation => ({ id, seq, timestamp: seq, userId: 'A', type: 'stroke', layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [] })
const undo: Operation = { id: 'undo5', seq: 5, timestamp: 5, userId: 'A', type: 'operation_undo', targetOpId: 'colour3' }
const redo: Operation = { id: 'redo6', seq: 6, timestamp: 6, userId: 'A', type: 'operation_redo', targetOpId: 'colour3' }
const original = [stroke('water1', 1), stroke('pigment2', 2), stroke('colour3', 3), { id: 'dry4', seq: 4, timestamp: 4, userId: 'A', type: 'paper_dry' } as Operation, undo, redo]

beforeEach(() => {
  vi.clearAllMocks(); mocks.rooms.clear()
  mocks.rooms.set('room', { nextSeq: 7, operations: [original[3], redo], aliveIds: new Set(['L', 'safe']) })
  mocks.state.mockResolvedValue({ seq: 5, state: { items: { L: { id: 'L' }, safe: { id: 'safe' } } } })
  mocks.snapshots.mockResolvedValue([{ layerId: 'L', seq: 5, hash: 'undone-picture' }, { layerId: 'safe', seq: 5, hash: 'safe-picture' }])
  mocks.operations.mockImplementation(async ({ where }) => {
    const ops = where.id ? original.filter(op => where.id.in.includes(op.id)) : original
    return ops.map(data => ({ data }))
  })
})

describe('computed snapshot dependency loader', () => {
  it('repairs cold missing target for exact undo5/redo6 and includes boundary undo5', async () => {
    const p = await prepareSnapshotReplay('room')
    expect(p.index?.layers).toEqual([{ layerId: 'safe', seq: 5, hash: 'safe-picture' }])
    expect(p.coverage.has('L')).toBe(false)
    expect(p.historicalIds.has('undo5')).toBe(true)
    expect(p.operations.map(op => op.id)).toEqual(original.map(op => op.id))
    expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 'room', id: { in: ['colour3'] } } }))
  })
  it('retains an earlier safe snapshot and loads only dependency history', async () => {
    mocks.snapshots.mockResolvedValue([{ layerId: 'L', seq: 5, hash: 'bad' }, { layerId: 'L', seq: 2, hash: 'before-colour' }])
    const p = await prepareSnapshotReplay('room')
    expect(p.coverage.get('L')).toBe(2)
    expect(p.historicalIds.has('colour3')).toBe(true)
    expect(p.historicalIds.has('undo5')).toBe(true)
  })
  it('keeps normal acceleration without reading heavy covered operation history', async () => {
    mocks.rooms.get('room').operations = []
    const p = await prepareSnapshotReplay('room')
    expect(p.index?.layers).toHaveLength(2)
    expect(p.historicalIds.size).toBe(0)
    expect(mocks.operations).not.toHaveBeenCalled()
  })
  it('does not mutate stored coverage while choosing a per-request fallback', async () => {
    const storedCoverage = new Map([['L', 5]])
    mocks.rooms.get('room').coveredSeqByLayer = storedCoverage
    await prepareSnapshotReplay('room')
    expect(storedCoverage).toEqual(new Map([['L', 5]]))
  })
  it('refuses unresolved cold dependencies instead of publishing a knowingly wrong index', async () => {
    mocks.operations.mockResolvedValue([])
    await expect(prepareSnapshotReplay('room')).rejects.toThrow('Unresolved snapshot history dependency')
  })
})


it('retries a no-snapshot metadata read when the resident watermark changes', async () => {
  mocks.state.mockResolvedValue(null); mocks.snapshots.mockResolvedValue([])
  mocks.state.mockImplementationOnce(async () => {
    mocks.rooms.get('room').nextSeq = 8
    return null
  })
  const plan = await prepareSnapshotReplay('room')
  expect(plan.watermark).toBe(7)
  expect(mocks.state).toHaveBeenCalledTimes(2)
})


it('serves the lightweight original structural prefix and only deleted-source pixel history', async () => {
  const add: Operation = { id: 'add1', seq: 1, timestamp: 1, userId: 'A', type: 'layer_add', layerId: 'S', name: 'S' }
  const del: Operation = { id: 'delete3', seq: 3, timestamp: 3, userId: 'A', type: 'layer_delete', layerIds: ['S'] }
  const u: Operation = { id: 'undo6', seq: 6, timestamp: 6, userId: 'A', type: 'operation_undo', targetOpId: del.id }
  mocks.rooms.set('room', { nextSeq: 7, operations: [u], aliveIds: new Set(['S','background','layer-1']) })
  mocks.state.mockResolvedValue({ seq: 5, state: { items: { background: {}, 'layer-1': {} } } })
  mocks.snapshots.mockResolvedValue([{ layerId: 'background', seq: 5, hash: 'safe' }])
  mocks.operations.mockImplementation(async ({ where }) => (where.id ? [del] : [add,del,u]).map(data => ({data})))
  const p = await prepareSnapshotReplay('room')
  expect(p.index?.replayStructure).toBe(true)
  expect(p.index?.layers).toEqual([{ layerId: 'background', seq: 5, hash: 'safe' }])
  expect(p.index?.historyLayers).toContain('S')
  expect(p.historicalIds).toContain('add1')
  expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({OR: expect.arrayContaining([{layerId: {in: ['S']}}])})}))
})

it('refuses an unknown snapshot-only structural base instead of manufacturing layer_add', async () => {
  const del: Operation = { id: 'delete3', seq: 3, timestamp: 3, userId: 'A', type: 'layer_delete', layerIds: ['S'] }
  const u: Operation = { id: 'undo6', seq: 6, timestamp: 6, userId: 'A', type: 'operation_undo', targetOpId: del.id }
  mocks.rooms.set('room', { nextSeq: 7, operations: [del,u], aliveIds: new Set(['legacy']) })
  mocks.state.mockResolvedValue({ seq: 5, state: { items: { legacy: {} } } })
  mocks.snapshots.mockResolvedValue([{layerId:'legacy',seq:5,hash:'legacy'}])
  mocks.operations.mockResolvedValue([{data:del},{data:u}])
  await expect(prepareSnapshotReplay('room')).rejects.toThrow('structural base cannot be reconstructed')
})

it('loads old gesture siblings when Undo targets a tail chunk after the snapshot',async()=>{
 const first={...stroke('first',1),strokeId:'gesture-G'} as Operation
 const last={...stroke('last',3),strokeId:'gesture-G'} as Operation
 const dry:Operation={id:'dry',type:'paper_dry',userId:'A',timestamp:2,seq:2}
 const control:Operation={id:'undo',type:'operation_undo',targetOpId:'last',userId:'A',timestamp:4,seq:4}
 const original=[first,dry,last,control]
 mocks.rooms.set('room',{nextSeq:5,operations:[last,control],aliveIds:new Set(['L','safe'])})
 mocks.state.mockResolvedValue({seq:2,state:{items:{L:{},safe:{}}}})
 mocks.snapshots.mockResolvedValue([{layerId:'L',seq:2,hash:'bad-first-chunk'},{layerId:'safe',seq:2,hash:'safe'}])
 mocks.operations.mockImplementation(async({where})=>{
  if(where.type==='stroke')return [first,last].map(data=>({data}))
  if(where.id)return original.filter(op=>where.id.in.includes(op.id)).map(data=>({data}))
  return original.map(data=>({data}))
 })
 const plan=await prepareSnapshotReplay('room')
 expect(plan.coverage.has('L')).toBe(false)
 expect(plan.coverage.get('safe')).toBe(2)
 expect(plan.historicalIds.has('first')).toBe(true)
 expect(plan.operations.map(op=>op.id)).toEqual(original.map(op=>op.id))
 expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({type:'stroke',OR:[{userId:'A',data:{path:['strokeId'],equals:'gesture-G'}}]})}))
})

it('does not load gesture siblings for a single-operation revoke', async () => {
  const first = { ...stroke('first', 1), strokeId: 'G' } as Operation
  const last = { ...stroke('last', 3), strokeId: 'G' } as Operation
  const revoke: Operation = { id: 'revoke', type: 'operation_revoke', targetOpId: 'last', userId: 'A', timestamp: 4, seq: 4 }
  mocks.rooms.set('room', { nextSeq: 5, operations: [last, revoke], aliveIds: new Set(['L']) })
  mocks.state.mockResolvedValue({ seq: 2, state: { items: { L: {} } } })
  mocks.snapshots.mockResolvedValue([{ layerId: 'L', seq: 2, hash: 'first' }])
  const plan = await prepareSnapshotReplay('room')
  expect(plan.coverage.get('L')).toBe(2)
  expect(plan.operations).not.toContainEqual(first)
  expect(mocks.operations).not.toHaveBeenCalled()
})

it('loads gesture siblings after resolving a cold chain of control targets', async () => {
  const first = { ...stroke('first', 1), strokeId: 'G' } as Operation
  const last = { ...stroke('last', 3), strokeId: 'G' } as Operation
  const undo: Operation = { id: 'undo', type: 'operation_undo', targetOpId: 'last', userId: 'A', timestamp: 4, seq: 4 }
  const redo: Operation = { id: 'redo', type: 'operation_redo', targetOpId: 'undo', userId: 'A', timestamp: 5, seq: 5 }
  const original = [first, last, undo, redo]
  mocks.rooms.set('room', { nextSeq: 6, operations: [redo], aliveIds: new Set(['L']) })
  mocks.state.mockResolvedValue({ seq: 2, state: { items: { L: {} } } })
  mocks.snapshots.mockResolvedValue([{ layerId: 'L', seq: 2, hash: 'first' }])
  mocks.operations.mockImplementation(async ({ where }) => {
    if (where.id) return original.filter(op => where.id.in.includes(op.id)).map(data => ({ data }))
    if (where.type === 'stroke') return [first, last].map(data => ({ data }))
    return original.map(data => ({ data }))
  })
  const plan = await prepareSnapshotReplay('room')
  expect(plan.coverage.has('L')).toBe(false)
  expect(plan.historicalIds.has('first')).toBe(true)
  expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: 'stroke', seq: { lte: 5 } }) }))
})

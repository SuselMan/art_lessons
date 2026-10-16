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

it('resolves newly discovered foreign-layer undo targets after loading dry history', async () => {
  const dry: Operation = {id: 'dry3', type: 'paper_dry', layerId: 'L', seq: 3, timestamp: 3, userId: 'A'}
  const undoDry: Operation = {id: 'undoDry6', type: 'operation_undo', targetOpId: dry.id, seq: 6, timestamp: 6, userId: 'A'}
  const foreign = {...stroke('foreign4', 4), layerId: 'safe'}
  const undoForeign: Operation = {id: 'undoForeign7', type: 'operation_undo', targetOpId: foreign.id, seq: 7, timestamp: 7, userId: 'A'}
  const all = [stroke('first', 1), dry, foreign, undoDry, undoForeign]
  mocks.rooms.set('room', {nextSeq: 8, operations: [dry, undoDry], aliveIds: new Set(['L','safe'])})
  mocks.operations.mockImplementation(async ({where}) => {
    if(where.id) return all.filter(op => where.id.in.includes(op.id)).map(data => ({data}))
    const wanted = where.OR?.[0]?.layerId?.in ?? []
    return all.filter(op => ('layerId' in op && wanted.includes(op.layerId))
      || op.type === 'paper_dry' || op.type === 'operation_undo').map(data => ({data}))
  })
  const p = await prepareSnapshotReplay('room')
  expect(p.unresolvedTargets.size).toBe(0)
  expect(p.historyLayers).toEqual(new Set(['L','safe']))
  expect(p.operations.map(op=>op.id)).toContain(foreign.id)
  expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({where:{roomId:'room', id:{in:[foreign.id]}}}))
})

it('resolves an old meta target chain referenced by a new redo', async () => {
  const oldUndo: Operation = {id:'oldUndo4', type:'operation_undo', targetOpId:'colour3', seq:4, timestamp:4, userId:'A'}
  const newRedo: Operation = {id:'newRedo6', type:'operation_redo', targetOpId:oldUndo.id, seq:6, timestamp:6, userId:'A'}
  const all = [stroke('colour3',3),oldUndo,newRedo]
  mocks.rooms.set('room', {nextSeq:7,operations:[newRedo],aliveIds:new Set(['L','safe'])})
  mocks.operations.mockImplementation(async ({where}) => (where.id?all.filter(op=>where.id.in.includes(op.id)):all).map(data=>({data})))
  const p=await prepareSnapshotReplay('room')
  expect(p.unresolvedTargets.size).toBe(0)
  expect(p.operations.map(op=>op.id)).toContain('colour3')
})

describe('structural dependencies discovered after pixel-history expansion', () => {
  const dry: Operation = {id:'dry3',type:'paper_dry',layerId:'layer-1',seq:3,timestamp:3,userId:'A'}
  const undoDry: Operation = {id:'undoDry6',type:'operation_undo',targetOpId:'dry3',seq:6,timestamp:6,userId:'A'}
  const del: Operation = {id:'delete4',type:'layer_delete',layerIds:['S'],seq:4,timestamp:4,userId:'A'}
  const undoDel: Operation = {id:'undoDel7',type:'operation_undo',targetOpId:'delete4',seq:7,timestamp:7,userId:'A'}
  const add: Operation = {id:'add1',type:'layer_add',layerId:'S',name:'S',seq:1,timestamp:1,userId:'A'}
  function configure(hasOriginalBase: boolean) {
    const all=[...(hasOriginalBase?[add]:[]),dry,del,undoDry,undoDel]
    mocks.rooms.set('room',{nextSeq:8,operations:[dry,undoDry],aliveIds:new Set(['layer-1','background','S'])})
    mocks.state.mockResolvedValue({seq:5,state:{items:{'layer-1':{},background:{}}}})
    mocks.snapshots.mockResolvedValue([{layerId:'layer-1',seq:5,hash:'layer'}, {layerId:'background',seq:5,hash:'background'}])
    mocks.operations.mockImplementation(async({where})=>(where.id?all.filter(op=>where.id.in.includes(op.id)):all).map(data=>({data})))
  }
  it('loads and validates the structural prefix even when the initial plan was pixel-only',async()=>{
    configure(true)
    const p=await prepareSnapshotReplay('room')
    expect(p.replayStructure).toBe(true)
    expect(p.historyLayers).toContain('S')
    expect(p.historicalIds).toContain(add.id)
    expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({seq:{lte:7},type:{in:expect.arrayContaining(['layer_add','layer_delete'])}})}))
  })
  it('refuses a missing structural base discovered only by that expanded history',async()=>{
    configure(false)
    await expect(prepareSnapshotReplay('room')).rejects.toThrow('structural base cannot be reconstructed')
  })
})

it('accepts a merge/copy source created after the snapshot during structural recovery',async()=>{
  const add: Operation={id:'addS1',type:'layer_add',layerId:'S',name:'S',seq:1,timestamp:1,userId:'A'}
  const del: Operation={id:'deleteS3',type:'layer_delete',layerIds:['S'],seq:3,timestamp:3,userId:'A'}
  const undoDel: Operation={id:'undoDelete6',type:'operation_undo',targetOpId:del.id,seq:6,timestamp:6,userId:'A'}
  const later: Operation={id:'newN7',type:'layer_add',layerId:'N',name:'N',seq:7,timestamp:7,userId:'A'}
  const copy: Operation={id:'copyN8',type:'layer_duplicate',layerId:'D',sourceId:'N',name:'D',sourceOpacity:1,sourceVisible:true,parentId:null,index:0,seq:8,timestamp:8,userId:'A'}
  const all=[add,del,undoDel,later,copy]
  mocks.rooms.set('room',{nextSeq:9,operations:[undoDel,later,copy],aliveIds:new Set(['layer-1','background','S','N','D'])})
  mocks.state.mockResolvedValue({seq:5,state:{items:{'layer-1':{},background:{}}}})
  mocks.snapshots.mockResolvedValue([{layerId:'background',seq:5,hash:'background'}])
  mocks.operations.mockImplementation(async({where})=>(where.id?all.filter(op=>where.id.in.includes(op.id)):where.type?all.filter(op=>(op.seq??0)<=where.seq.lte):all).map(data=>({data})))
  const p=await prepareSnapshotReplay('room')
  expect(p.replayStructure).toBe(true)
  expect(p.historyLayers).toContain('N')
  expect(p.operations.map(op=>op.id)).toContain(later.id)
})

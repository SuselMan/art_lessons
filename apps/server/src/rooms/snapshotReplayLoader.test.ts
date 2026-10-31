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

it('retains verified actual indexed evidence for recovered canonical dependencies before immutable copying',async()=>{
 const {CANONICAL_STROKE_RASTER_PROFILE}=await import('@grafetto/shared')
 const op:Operation={type:'canonical_stroke',id:'cold-canonical',seq:3,userId:'original-author',timestamp:0,layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:fixture@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'1|bounded-test-payload'}}
 const row={id:op.id,roomId:'room',userId:op.userId,seq:3,type:op.type,layerId:'L',tool:null,data:op}
 const u:Operation={...undo,targetOpId:op.id},r:Operation={...redo,targetOpId:op.id}
 mocks.rooms.get('room').operations=[r]
 mocks.operations.mockImplementation(async({where})=>where.id?[row]:[row,{data:u},{data:r}])
 const prepared=await prepareSnapshotReplay('room'),copy=prepared.operations.find(o=>o.id===op.id)!
 expect(prepared.canonicalRows).toHaveLength(1);expect(prepared.canonicalRows[0].data).toBe(copy)
 expect(copy).not.toBe(op);expect(Object.isFrozen(copy)).toBe(true)
 if(copy.type!=='canonical_stroke')throw Error('Expected canonical')
 Object.assign(op.frame,{pigmentRgb8:[9,9,9]});expect(copy.frame.pigmentRgb8).toEqual([1,2,3])
 expect(mocks.operations).toHaveBeenCalledWith(expect.objectContaining({select:expect.objectContaining({id:true,roomId:true,userId:true,seq:true,type:true,layerId:true,tool:true,data:true})}))
 mocks.operations.mockResolvedValue([{...row,userId:'different-author'}])
 await expect(prepareSnapshotReplay('room')).rejects.toThrow('immutable row conflict')
})

function canonicalReadFixture(){
 const first:Extract<Operation,{type:'canonical_stroke'}>={id:'first',seq:1,userId:'absent-author',timestamp:0,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:source@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'2|trusted provider test fixture'}}
 const last={...first,id:'last',seq:4,frame:{...first.frame,frameOrdinal:1}}
 const row=(data:typeof first)=>({id:data.id,roomId:'room',seq:data.seq!,userId:data.userId,type:data.type,layerId:data.layerId,tool:null,data})
 return {first,last,row}
}
async function metadataPrefix(ops:ReturnType<typeof canonicalReadFixture>['first'][],ended=true){
 const {verifyCanonicalRecordedPrefix}=await import('@grafetto/shared')
 return verifyCanonicalRecordedPrefix(ops.map((op,n):import('@grafetto/shared').CanonicalRecordedPrefixFrame=>({operationId:op.id,sequence:op.seq!,frameOrdinal:op.frame.frameOrdinal,decoded:{entry:n?{phase:'primary',group:0}:{phase:'between'},fences:[...n===0?[{kind:'segmentBegin' as const,at:0,group:0}]:[],...ended&&n===ops.length-1?[{kind:'primaryEnd' as const,at:0,group:0},{kind:'segmentEnd' as const,at:0,group:0},{kind:'gestureEnd' as const,at:0}]:[]]}})))
}
it('recovers the full known canonical undo group before planning an earlier-chunk snapshot cut',async()=>{
 const {first,last,row}=canonicalReadFixture(),u={...undo,userId:first.userId,targetOpId:'last'},r={...redo,userId:first.userId,targetOpId:'last'}
 mocks.rooms.get('room').operations=[r]
 mocks.snapshots.mockResolvedValue([{layerId:'L',seq:2,hash:'contains-first'},{layerId:'safe',seq:5,hash:'safe'}])
 mocks.operations.mockImplementation(async({where})=>where.id?[row(last)]:[row(first),row(last),{data:u},{data:r}])
 const summary=await metadataPrefix([first,last]),prepare=vi.fn<import('./snapshotReplayLoader.js').CanonicalPrefixPreparer>(async()=>({operations:[first,last],canonicalRows:[row(first),row(last)],summary}))
 const prepared=await prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})
 expect(prepare).toHaveBeenCalledOnce();expect(prepare.mock.calls[0][0]).toMatchObject({anchor:{id:'last'},row:{id:'last'},throughSeq:6,purpose:'undo-redo'})
 expect(prepared.index?.layers).toEqual([{layerId:'safe',seq:5,hash:'safe'}])
 expect(prepared.operations.map(op=>op.id)).toEqual(['first','last',u.id,r.id])
 expect(prepared.canonicalRows.map(entry=>entry.id)).toEqual(['last','first'])
 expect(prepared.historicalIds.has('first')).toBe(true)
})
it('allows open scoped reads without a snapshot but refuses grouped undo until recorded end',async()=>{
 const {first,row}=canonicalReadFixture(),summary=await metadataPrefix([first],false)
 const prepare=vi.fn<import('./snapshotReplayLoader.js').CanonicalPrefixPreparer>(async()=>({operations:[first],canonicalRows:[row(first)],summary}))
 mocks.state.mockResolvedValue(null);mocks.rooms.get('room').operations=[first]
 const read=await prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})
 expect(read.operations.map(op=>op.id)).toEqual(['first']);expect(read.index).toBeNull()
 expect(prepare.mock.calls[0][0].purpose).toBe('read')
 mocks.rooms.get('room').operations=[first,{...undo,userId:first.userId,targetOpId:'first'}]
 await expect(prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})).rejects.toThrow('prefix is open')
})
it('does not fall back to an unproved V2 prefix when the preparer is absent or fails',async()=>{
 const {first}=canonicalReadFixture();mocks.state.mockResolvedValue(null);mocks.rooms.get('room').operations=[first]
 await expect(prepareSnapshotReplay('room')).rejects.toThrow('preparer unavailable')
 const prepare=vi.fn(async()=>{throw Error('known prefix hole')})
 await expect(prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})).rejects.toThrow('known prefix hole')
 expect(mocks.rooms.get('room').operations).toEqual([first])
})
it('bounds whole preparation bindings and gesture count before querying prefixes',async()=>{
 const {first}=canonicalReadFixture(),prepare=vi.fn()
 mocks.state.mockResolvedValue(null)
 for(const kind of ['bindings','gestures']){
  mocks.rooms.get('room').operations=Array.from({length:kind==='bindings'?1025:65},(_,n)=>({...first,id:'frame'+n,seq:n+1,frame:{...first.frame,strokeId:kind==='bindings'?'S':'S'+n,frameOrdinal:kind==='bindings'?n:0}}))
  await expect(prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})).rejects.toThrow('capacity exceeded')
  expect(prepare).not.toHaveBeenCalled()
 }
})
it('enforces the total byte budget across multiple separately bounded gesture prefixes',async()=>{
 const {first,row}=canonicalReadFixture(),ops=[0,1,2].map(n=>({...first,id:'large'+n,seq:n+1,frame:{...first.frame,strokeId:'S'+n,materialPacked:'2|'+ 'x'.repeat(2*1024*1024)}}))
 mocks.state.mockResolvedValue(null);mocks.rooms.get('room').operations=ops
 const prepare=vi.fn(async(input:import('./snapshotReplayLoader.js').CanonicalPrefixRequest)=>({operations:[input.anchor],canonicalRows:[row(input.anchor)],summary:await metadataPrefix([input.anchor])}))
 await expect(prepareSnapshotReplay('room',{prepareCanonicalPrefix:prepare})).rejects.toThrow('aggregate capacity exceeded')
 expect(prepare).toHaveBeenCalledTimes(2);expect(mocks.rooms.get('room').operations).toBe(ops)
})

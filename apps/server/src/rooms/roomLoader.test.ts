import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CANONICAL_STROKE_RASTER_PROFILE, DEFAULT_PALETTE_COLORS, type Operation } from '@grafetto/shared'

/** (#612) The cold load on its own: what a room that was not in memory comes
 *  back as. Everything synchronous downstream assumes these mirrors are right,
 *  and until the loader left rooms.ts nothing checked most of them — a room
 *  that loaded wrong still loaded. Prisma is mocked the way boards.test.ts
 *  mocks it: the load is the only door a row comes through. */

const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), findMany: vi.fn() },
  roomPalette: { findUnique: vi.fn(), upsert: vi.fn() },
  roomLayerState: { findUnique: vi.fn() },
  assignment: { findMany: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn() },
  operation: { create: vi.fn(), findFirst:vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
}))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))

const { _flushPendingWrites, getRoomSnapshot, joinRoom } = await import('./rooms.js')
const { knownCanonicalWrite, ensureCanonicalWrite, getOperationRejectReason, recordOperation, updateAliveIds } = await import('./operationLog.js')
const { ensureRoomLoaded } = await import('./roomLoader.js')
const { isLayerLocked, isLayerOwnerLocked } = await import('./ownerControls.js')
const { rooms } = await import('./roomRegistry.js')

const OWNER = 'teacher'
let nextId = 0
const touched: string[] = []

function row(id: string) {
  touched.push(id)
  return {
    id, name: id, paper: 'coarse', paperColor: null, infinite: false, canvasWidth: 1240, canvasHeight: 1754,
    passwordHash: null, accessMode: 'anyone_with_link', enabledTools: [], closedAt: null, parentRoomId: null,
    ownerId: OWNER, createdAt: new Date('2026-09-26T10:00:00Z'), thumbnail: null,
    lessonId: null, boardOrder: 0, activeBoardId: null,
  }
}

const base = (seq: number, userId = OWNER) => ({ id: `op-${nextId++}`, userId, timestamp: 0, seq })
const stroke = (seq: number, layerId = 'layer-1'): Operation => ({
  ...base(seq), type: 'stroke', layerId, tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
})

/** A lesson row whose resident operation window is `window`. */
function seed(window: Operation[], maxSeq = window.at(-1)?.seq ?? null): string {
  const id = `lesson-${nextId++}`
  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === id ? row(id) : null)
  mockPrisma.operation.findMany.mockResolvedValue(window.map(data => ({ data })))
  mockPrisma.operation.aggregate.mockResolvedValue({ _max: { seq: maxSeq } })
  return id
}

beforeEach(() => {
  for (const model of Object.values(mockPrisma)) for (const fn of Object.values(model)) fn.mockReset()
  mockPrisma.room.findMany.mockResolvedValue([])
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.assignment.findMany.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.groupBy.mockResolvedValue([])
  mockPrisma.operation.groupBy.mockResolvedValue([])
  mockPrisma.operation.findFirst.mockResolvedValue(null)
  mockPrisma.roomPalette.findUnique.mockResolvedValue({ colors: ['#111111'] })
})

afterEach(async () => {
  await Promise.all(touched.map(_flushPendingWrites))
  for (const id of touched.splice(0)) rooms.delete(id)
})

// (#292) The window is not the room: its highest seq need not be the room's.
it('numbers the next operation after the room’s newest, not the window’s', async () => {
  const id = seed([stroke(5)], 100)
  await ensureRoomLoaded(id)
  expect(recordOperation(id, stroke(0)).seq).toBe(101)
})

// (#258, #518) Both locks are persisted operations, so both are rebuilt.
it('rebuilds both lock mirrors from the log', async () => {
  const lock = (seq: number, type: 'layer_lock' | 'layer_owner_lock', layerId: string, locked: boolean): Operation =>
    ({ ...base(seq), type, layerId, locked })
  const id = seed([
    lock(1, 'layer_lock', 'a', true), lock(2, 'layer_owner_lock', 'b', true),
    lock(3, 'layer_lock', 'c', true), lock(4, 'layer_lock', 'c', false),
  ])
  await ensureRoomLoaded(id)
  expect(isLayerLocked(id, 'a')).toBe(true)
  expect(isLayerOwnerLocked(id, 'b')).toBe(true)
  expect(isLayerLocked(id, 'c')).toBe(false)
})

// (#368) An undone delete whose author has acted since — below the window,
// where the loader cannot see it — is out of reach. A late redo must not
// revive the delete here, when every client has written it off.
it('asks Postgres whether an undone structural entry is still redoable', async () => {
  const del: Operation = { ...base(2), type: 'layer_delete', layerIds: ['layer-1'] }
  const undo: Operation = { ...base(3), type: 'operation_undo', targetOpId: del.id }
  const id = seed([del, undo], 50)
  // The author's newest ordinary operation is at seq 40, well past the undo.
  mockPrisma.operation.groupBy.mockResolvedValue([{ userId: OWNER, _max: { seq: 40 } }])
  await ensureRoomLoaded(id)

  updateAliveIds(id, { ...base(0), type: 'operation_redo', targetOpId: del.id })
  expect(getOperationRejectReason(id, OWNER, stroke(0))).toBeNull()
})

// (#190) A room from before palettes existed gets the defaults, and keeps them.
it('seeds the default palette for a lesson that has none, and stores it', async () => {
  const id = seed([])
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  await ensureRoomLoaded(id)
  expect(getRoomSnapshot(id)?.palette).toEqual([...DEFAULT_PALETTE_COLORS])
  await _flushPendingWrites(id)
  expect(mockPrisma.roomPalette.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { roomId: id }, create: { roomId: id, colors: [...DEFAULT_PALETTE_COLORS] },
  }))
})

// Two joins racing one cold load: the second load must not replace the record
// the first has already seated someone in.
it('a load that loses the race keeps the record the winner built', async () => {
  const id = seed([])
  let releaseSecond!: () => void
  const gate = new Promise<void>(resolve => { releaseSecond = resolve })
  let calls = 0
  mockPrisma.roomLayerState.findUnique.mockImplementation(async () => {
    if (++calls === 2) await gate
    return null
  })

  const first = ensureRoomLoaded(id)
  const second = ensureRoomLoaded(id)
  await first
  expect(joinRoom(id, 'alice', 'Alice', 'sock-alice').ok).toBe(true)
  releaseSecond()
  await second
  expect(getRoomSnapshot(id)?.participants.map(p => p.userId)).toContain('alice')
})

describe('what it does not load', () => {
  it('answers false for a room Postgres does not have', async () => {
    seed([])
    expect(await ensureRoomLoaded('never-created')).toBe(false)
  })
})

it('rejects unknown and not-yet-supported raster versions before operation or snapshot loading', async () => {
  for (const rasterVersion of ['straight-rgba8-v1', 'future']) {
    const id = `format-${nextId++}`
    mockPrisma.room.findUnique.mockResolvedValueOnce({ ...row(id), rasterVersion })
    expect(await ensureRoomLoaded(id)).toBe(false)
    expect(rooms.has(id)).toBe(false)
  }
  expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
  expect(mockPrisma.roomLayerSnapshot.groupBy).not.toHaveBeenCalled()
})


function canonicalLoaded(id:string):Operation {
  return {id,userId:OWNER,timestamp:0,seq:1,type:'canonical_stroke',layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:x@1',strokeId:'g',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'fixture'}} as Operation
}
const indexed=(roomId:string,data:Operation)=>({id:data.id,roomId,userId:data.userId,seq:data.seq,type:data.type,layerId:'layer-1',tool:null,data})
it('adopts verified canonical DB rows only for the actual cold-load winner',async()=>{
  const a=canonicalLoaded('loaded-a'),b=canonicalLoaded('loaded-b'),id=seed([])
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r});let calls=0
  mockPrisma.operation.findMany.mockImplementation(async()=>{
    if(++calls===2){await gate;return[indexed(id,b)]}return[indexed(id,a)]
  })
  const first=ensureRoomLoaded(id),second=ensureRoomLoaded(id);await first
  const winner=rooms.get(id)!
  const actual=winner.operationsById.get(a.id)!
  expect(actual).not.toBe(a);expect(actual).toEqual(a);expect(knownCanonicalWrite(actual)?.status).toBe('succeeded')
  expect(knownCanonicalWrite(a)).toBeUndefined()
  expect(await ensureCanonicalWrite(winner,actual)).toEqual({ok:true,value:undefined})
  release();await second
  expect(rooms.get(id)).toBe(winner);expect(knownCanonicalWrite(b)).toBeUndefined()
  expect(mockPrisma.operation.create).not.toHaveBeenCalled()
})
it('rejects canonical DB indexed/header conflicts without adopting a room',async()=>{
  const op=canonicalLoaded('bad'),id=seed([])
  mockPrisma.operation.findMany.mockResolvedValue([{...indexed(id,op),userId:'different'}])
  await expect(ensureRoomLoaded(id)).rejects.toThrow('immutable row conflict')
  expect(rooms.has(id)).toBe(false);expect(knownCanonicalWrite(op)).toBeUndefined()
})

it('copies and freezes the same small canonical header as live append, leaving legacy mutable',async()=>{
  const original=canonicalLoaded('immutable-db'),legacy=stroke(2),id=seed([legacy])
  mockPrisma.operation.findMany.mockResolvedValue([indexed(id,original),{data:legacy}])
  await ensureRoomLoaded(id)
  const actual=rooms.get(id)!.operationsById.get(original.id)!
  if(actual.type!=='canonical_stroke'||original.type!=='canonical_stroke')throw new Error('fixture')
  const before=structuredClone(actual)
  expect(Object.isFrozen(actual)).toBe(true);expect(Object.isFrozen(actual.frame)).toBe(true)
  expect(Object.isFrozen(actual.frame.pigmentRgb8)).toBe(true);expect(Object.isFrozen(actual.frame.composition)).toBe(true)
  original.timestamp=77
  expect(Reflect.set(original.frame,'materialPacked','changed')).toBe(true)
  expect(Reflect.set(original.frame.pigmentRgb8,0,255)).toBe(true)
  expect(Reflect.set(original.frame.composition,'outerResourceOpacity',.2)).toBe(true)
  expect(actual).toEqual(before);expect(knownCanonicalWrite(actual)?.status).toBe('succeeded')
  expect(knownCanonicalWrite(original)).toBeUndefined()
  expect(rooms.get(id)!.operationsById.get(legacy.id)).toBe(legacy)
  expect(Object.isFrozen(legacy)).toBe(false)
})

it('loads actual straight metadata only for trusted mixed full-history preparation while the default stays closed',async()=>{
 const id=seed([],null)
 mockPrisma.room.findUnique.mockResolvedValue({...row(id),rasterVersion:'straight-rgba8-v1'})
 expect(await ensureRoomLoaded(id)).toBe(false);expect(rooms.has(id)).toBe(false)
 expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
 expect(await ensureRoomLoaded(id,'mixed-v2')).toBe(true)
 expect(rooms.get(id)?.room.rasterVersion).toBe('straight-rgba8-v1')
 expect(await ensureRoomLoaded(id)).toBe(false)
 expect(await ensureRoomLoaded(id,'mixed-v2')).toBe(true)
})


it('loads indexed closed history metadata without pulling or adopting historical operation bodies',async()=>{
 const id=seed([],10000)
 mockPrisma.room.findUnique.mockResolvedValue({...row(id),rasterVersion:'straight-rgba8-v1'})
 mockPrisma.operation.findMany.mockRejectedValue(Error('whole history must remain indexed'))
 expect(await ensureRoomLoaded(id,'mixed-indexed-v1')).toBe(true)
 const record=rooms.get(id)!
 expect(record.nextSeq).toBe(10001)
 expect(record.operations).toEqual([]);expect(record.operationsById.size).toBe(0)
 expect(record.canonicalHistoryResidency).toBe('indexed-v1')
 expect(record.aliveIds).toEqual(new Set(['background','layer-1']))
 expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
 expect(mockPrisma.operation.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({roomId:id}),select:{id:true}}))
 expect(()=>getRoomSnapshot(id,0,OWNER)).toThrow('Indexed room requires an offer')
})
it('does not present an indexed implicit layer structure for persisted structural operations or snapshots',async()=>{
 const id=seed([],9000)
 mockPrisma.room.findUnique.mockResolvedValue({...row(id),rasterVersion:'straight-rgba8-v1'})
 mockPrisma.operation.findFirst.mockResolvedValue({id:'persisted-layer-delete'})
 expect(await ensureRoomLoaded(id,'mixed-indexed-v1')).toBe(false)
 expect(rooms.has(id)).toBe(false)
 expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
 mockPrisma.operation.findFirst.mockResolvedValue(null)
 mockPrisma.roomLayerState.findUnique.mockResolvedValue({seq:8000,state:{}})
 expect(await ensureRoomLoaded(id,'mixed-indexed-v1')).toBe(false)
 expect(rooms.has(id)).toBe(false)
})

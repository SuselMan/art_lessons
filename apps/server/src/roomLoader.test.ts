import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PALETTE_COLORS, type Operation } from '@grafetto/shared'

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
  operation: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

const { _flushPendingWrites, getRoomSnapshot, joinRoom } = await import('./rooms.js')
const { getOperationRejectReason, recordOperation, updateAliveIds } = await import('./operationLog.js')
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

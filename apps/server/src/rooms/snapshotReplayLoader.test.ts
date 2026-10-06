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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Operation, Room } from '@grafetto/shared'

const mockPrisma = vi.hoisted(() => ({
  room: { create: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
  roomPalette: { upsert: vi.fn() },
  operation: { create: vi.fn() },
}))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))

const { flushRoomWrites } = await import('./roomRegistry.js')
const { persistOperation, persistParticipant, persistRoomCreate } = await import('./roomPersistence.js')

/** (#612) The rows a live room writes, by shape. Nothing else pins them: the
 *  room tests mock Prisma and look at memory. The columns matter beyond the
 *  row itself — `type`/`layerId`/`seq` are what residentOperationWhere asks
 *  Postgres about, so an operation stored without its `layerId` is one no
 *  snapshot can ever exclude from a cold load. */

beforeEach(() => {
  for (const group of Object.values(mockPrisma)) for (const fn of Object.values(group)) fn.mockReset()
})

describe('persistOperation', () => {
  it('stores the indexed columns beside the payload', async () => {
    const op: Operation = {
      id: 'op-1', seq: 7, userId: 'u', timestamp: 0, type: 'stroke', layerId: 'layer-1',
      tool: 'charcoal', preset: 'HB', color: [0, 0, 0], dabs: [],
    }
    persistOperation('r', op)
    await flushRoomWrites('r')
    expect(mockPrisma.operation.create).toHaveBeenCalledWith({
      data: { id: 'op-1', seq: 7, type: 'stroke', roomId: 'r', userId: 'u', layerId: 'layer-1', tool: 'charcoal', data: op },
    })
  })

  it('leaves layerId and tool empty for an operation that has neither', async () => {
    const op: Operation = { id: 'op-2', seq: 8, userId: 'u', timestamp: 0, type: 'layer_delete', layerIds: ['a'] }
    persistOperation('r', op)
    await flushRoomWrites('r')
    expect(mockPrisma.operation.create.mock.calls[0][0].data).toMatchObject({ layerId: null, tool: null })
  })
})

describe('persistParticipant', () => {
  // (#226) What this person calls themselves now, not three lessons ago.
  it('refreshes the name on every join, not only on the first', async () => {
    persistParticipant('r', 'u', 'Alice')
    await flushRoomWrites('r')
    expect(mockPrisma.roomParticipant.upsert.mock.calls[0][0].update).toMatchObject({ name: 'Alice' })
  })
})

describe('persistRoomCreate', () => {
  // (#548) `[]` is the column's "no restriction".
  it('stores the toolset, an unrestricted room as the empty list', async () => {
    const room = { id: 'r', name: 'N', paper: 'coarse', infinite: false, accessMode: 'anyone_with_link', ownerId: 'o' } as Room
    persistRoomCreate({ ...room, enabledTools: ['pencil'] }, undefined)
    persistRoomCreate({ ...room, id: 'r2' }, undefined)
    await flushRoomWrites('r')
    await flushRoomWrites('r2')
    expect(mockPrisma.room.create.mock.calls[0][0].data.enabledTools).toEqual(['pencil'])
    expect(mockPrisma.room.create.mock.calls[1][0].data.enabledTools).toEqual([])
  })
})

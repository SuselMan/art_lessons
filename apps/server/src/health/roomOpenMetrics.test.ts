import { expect, it, vi } from 'vitest'
import { pruneRoomOpenMeasurements } from './roomOpenMetrics.js'
import { prisma } from '../db/prisma.js'

vi.mock('../db/prisma.js', () => ({ prisma: { roomOpenMeasurement: { deleteMany: vi.fn() } } }))

it('expires measurements after 90 days independently of the last retry', async () => {
  vi.mocked(prisma.roomOpenMeasurement.deleteMany).mockResolvedValue({ count: 2 })
  expect(await pruneRoomOpenMeasurements(new Date('2026-10-01T12:00:00Z'))).toEqual({ count: 2 })
  expect(prisma.roomOpenMeasurement.deleteMany).toHaveBeenCalledWith({
    where: { createdAt: { lt: new Date('2026-07-03T12:00:00Z') } },
  })
})

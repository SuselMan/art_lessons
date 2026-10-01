import type { FastifyInstance } from 'fastify'

import { parseRoomOpenMeasurement, type ApiOk } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { apiRoute } from '../http/apiRoute.js'
import { describeClient } from './clientDescription.js'

export const ROOM_OPEN_RETENTION_DAYS = 90

export function pruneRoomOpenMeasurements(now = new Date()) {
  return prisma.roomOpenMeasurement.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - ROOM_OPEN_RETENTION_DAYS * 86400_000) } },
  })
}

export function registerRoomOpenMetrics(app: FastifyInstance): void {
  apiRoute(app, 'POST /api/me/room-open', {
    bodyLimit: 4096,
    config: { rateLimit: { max: 120, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const m = parseRoomOpenMeasurement(request.body)
    if (!m || !request.deviceId) return reply.code(400).send({ error: 'invalid_measurement' })
    const { report: r } = m
    const client = describeClient(request.headers['user-agent'])
    const key = { userId: request.userId, attemptId: m.attemptId }
    const data = {
      roomId: m.roomId, deviceId: request.deviceId, appVersion: m.appVersion, deviceType: m.deviceType,
      platform: client.platform, browser: client.browser, wasHidden: m.wasHidden,
      outcome: r.outcome, totalMs: r.totalMs, reached: r.reached, facts: { ...r.facts },
      joinMs: r.stages.join ?? null, paperMs: r.stages.paper ?? null,
      snapshotMs: r.stages.snapshot ?? null, replayMs: r.stages.replay ?? null,
    }
    // Insert first, then only advance stalled -> ready. Independent atomic
    // statements survive races and retries; a late alarm cannot erase a finish.
    await prisma.roomOpenMeasurement.createMany({ data: { ...key, ...data }, skipDuplicates: true })
    if (r.outcome === 'ready') {
      await prisma.roomOpenMeasurement.updateMany({ where: { ...key, outcome: 'stalled' }, data })
    }
    return { ok: true } satisfies ApiOk
  })
}

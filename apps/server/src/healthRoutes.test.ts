import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'

import { registerHealthRoutes } from './healthRoutes.js'
import { identityHook } from './identity.js'

// Route-level test, Prisma mocked — same shape as roomFolderRoutes.test.ts.
// identity.js reads JWT_SECRET at import time, so it has to exist before the
// hoisted imports run.
const mockPrisma = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret'
  return {
    $queryRaw: vi.fn(),
    user: { create: vi.fn() },
  }
})
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

function buildApp(): FastifyInstance {
  const app = Fastify()
  registerHealthRoutes(app)
  return app
}

beforeEach(() => {
  mockPrisma.$queryRaw.mockReset()
  mockPrisma.user.create.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, db: 'up' })
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce()
  })

  it('answers 503 when the database is unreachable', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'))
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/api/health' })

    // The whole point of the endpoint: a live Node process in front of a dead
    // Postgres must not read as healthy, or the monitor stays green through
    // the one outage it exists to catch.
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ ok: false, db: 'down' })
  })

  it('answers 503 rather than hanging when the database never replies', async () => {
    mockPrisma.$queryRaw.mockReturnValue(new Promise(() => {}))
    vi.useFakeTimers()
    const app = buildApp()

    const pending = app.inject({ method: 'GET', url: '/api/health' })
    await vi.advanceTimersByTimeAsync(3_000)
    const response = await pending

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ ok: false, db: 'down' })
  })

  it('serves the same handler on /health for in-container checks', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, db: 'up' })
  })

  it('reports process memory and resident rooms (#415)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
    const app = buildApp()

    const body = (await app.inject({ method: 'GET', url: '/api/health' })).json()

    // Это контракт с уптайм-пробой (#178): она читает ровно эти поля, чтобы
    // упасть письмом до того, как память кончится. Переименование любого из
    // них ломает алерт молча — проба увидит `undefined` и посчитает,
    // что всё в порядке.
    expect(body.memory).toMatchObject({
      rssMb: expect.any(Number),
      heapUsedMb: expect.any(Number),
      heapLimitMb: expect.any(Number),
      heapUsedPct: expect.any(Number),
      pressure: expect.stringMatching(/^(ok|warn|critical)$/),
    })
    expect(body.rooms).toMatchObject({
      resident: expect.any(Number),
      idle: expect.any(Number),
      operations: expect.any(Number),
    })
  })

  it('still reports memory when the database is down', async () => {
    // 503 по Postgres — ровно тот момент, когда полезно видеть, не идёт ли
    // рядом второе, независимое бедствие. Отчёт о памяти не должен исчезать
    // вместе с базой.
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'))
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json().memory.heapLimitMb).toBeGreaterThan(0)
  })

  it('mints no guest User, unlike every other route', async () => {
    // The probe runs every ten minutes forever and never carries a cookie, so
    // without the `skipIdentity` opt-out identityHook would write a throwaway
    // `User` row on each one. Wired exactly as index.ts wires it, because the
    // tempting alternative — "just register the route before the hook" — does
    // not work (Fastify applies a later-added hook to earlier routes) and
    // fails silently, in production, as a slowly growing table.
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
    mockPrisma.user.create.mockResolvedValue({ id: 'guest-1' })
    const app = Fastify()
    await app.register(cookie)
    app.addHook('preHandler', identityHook)
    registerHealthRoutes(app)
    app.get('/api/rooms', async () => ({ rooms: [] }))

    const health = await app.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode).toBe(200)
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
    expect(health.headers['set-cookie']).toBeUndefined()

    // Same app, ordinary route: the hook still does its normal job.
    await app.inject({ method: 'GET', url: '/api/rooms' })
    expect(mockPrisma.user.create).toHaveBeenCalledOnce()
  })
})

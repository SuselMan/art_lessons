import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'

import { registerAuthRoutes } from './authRoutes.js'
import { identityHook } from './identity.js'
import { registerRateLimit } from './rateLimit.js'

// Route-level tests, Prisma mocked — same shape as healthRoutes.test.ts.
// identity.js reads JWT_SECRET at import time, so it has to exist before the
// hoisted imports run.
const mockPrisma = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret'
  return {
    user: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  }
})
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

// The real bcrypt is deliberately slow, and these tests deliberately make
// dozens of login attempts — that combination is a minute of CPU for nothing.
const mockBcrypt = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: mockBcrypt }))

// Wired exactly like index.ts, identityHook included: the "a throttled request
// never reaches the guest-User branch" property below is a property of that
// ordering, not of the routes.
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(cookie)
  await registerRateLimit(app)
  app.addHook('preHandler', identityHook)
  registerAuthRoutes(app)
  return app
}

function login(app: FastifyInstance, email: string, ip: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'whatever-1234' },
    remoteAddress: ip,
  })
}

beforeEach(() => {
  mockPrisma.user.create.mockReset()
  mockPrisma.user.update.mockReset()
  mockPrisma.user.findUnique.mockReset()
  mockBcrypt.hash.mockReset()
  mockBcrypt.compare.mockReset()
  mockPrisma.user.create.mockResolvedValue({ id: 'guest-1' })
})

describe('rate limits on /api/auth/* (#237)', () => {
  it('cuts off login attempts from one address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const app = await buildApp()

    // 20 is the budget (LOGIN_IP_LIMIT), so the 21st is the first refusal.
    for (let i = 0; i < 20; i++) {
      expect((await login(app, `victim${i}@example.com`, '10.0.0.1')).statusCode).toBe(401)
    }

    const blocked = await login(app, 'victim@example.com', '10.0.0.1')
    expect(blocked.statusCode).toBe(429)
    // Codes, not prose (#208) — `error` is what ApiError carries client-side,
    // and Auth/index.tsx turns it into a sentence.
    expect(blocked.json()).toMatchObject({ error: 'rate_limited' })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('holds that budget per address, not globally', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const app = await buildApp()

    for (let i = 0; i < 21; i++) await login(app, `a${i}@example.com`, '10.0.0.1')

    // The failure this guards against: one person exhausting the limit for
    // every other person on the internet.
    expect((await login(app, 'someone@example.com', '10.0.0.2')).statusCode).toBe(401)
  })

  it('locks one account after enough wrong passwords, however many addresses they come from', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'target@example.com', passwordHash: 'hash', name: null })
    mockBcrypt.compare.mockResolvedValue(false)
    const app = await buildApp()

    // A different IP every time, so the per-IP ceiling can't be what stops
    // this — rotating addresses is cheap, and that's the whole point of
    // counting failures per email as well.
    for (let i = 0; i < 10; i++) {
      expect((await login(app, 'target@example.com', `10.1.0.${i}`)).statusCode).toBe(401)
    }

    const blocked = await login(app, 'target@example.com', '10.1.0.99')
    expect(blocked.statusCode).toBe(429)

    // And the lock is on that email alone.
    expect((await login(app, 'bystander@example.com', '10.1.0.99')).statusCode).toBe(401)
  })

  it('spends the account budget on failures only', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'teacher@example.com', passwordHash: 'hash', name: 'T' })
    mockBcrypt.compare.mockResolvedValue(true)
    const app = await buildApp()

    // A teacher signing in from a dozen devices, all correctly. If successes
    // counted, the reward for using the product would be a lockout.
    for (let i = 0; i < 12; i++) {
      expect((await login(app, 'teacher@example.com', `10.2.0.${i}`)).statusCode).toBe(200)
    }
  })

  it('caps registrations from one address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockBcrypt.hash.mockResolvedValue('hashed')
    mockPrisma.user.update.mockImplementation(({ data }: { data: { email: string } }) =>
      Promise.resolve({ id: 'guest-1', email: data.email, name: null }))
    const app = await buildApp()

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `new${i}@example.com`, password: 'longenough1' },
        remoteAddress: '10.3.0.1',
      })
      expect(res.statusCode).toBe(200)
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'one-too-many@example.com', password: 'longenough1' },
      remoteAddress: '10.3.0.1',
    })
    expect(blocked.statusCode).toBe(429)
  })

  it('caps logouts, which each write a row', async () => {
    const app = await buildApp()

    for (let i = 0; i < 30; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/logout', remoteAddress: '10.4.0.1' })
      expect(res.statusCode).toBe(200)
    }

    const blocked = await app.inject({ method: 'POST', url: '/api/auth/logout', remoteAddress: '10.4.0.1' })
    expect(blocked.statusCode).toBe(429)
  })

  it('mints no guest User for a request it refuses', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const app = await buildApp()

    for (let i = 0; i < 20; i++) await login(app, `a${i}@example.com`, '10.5.0.1')
    mockPrisma.user.create.mockClear()

    const blocked = await login(app, 'a@example.com', '10.5.0.1')

    // The limiter runs on `onRequest` and identityHook on `preHandler`, so a
    // refusal stops before the "first visit → write a User row" branch. Were
    // it the other way round, the endpoint would still be a way to grow the
    // table without credentials — throttled in name only.
    expect(blocked.statusCode).toBe(429)
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  it('leaves /api/me alone — every page load makes one', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: null, name: null })
    const app = await buildApp()

    for (let i = 0; i < 60; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/me', remoteAddress: '10.6.0.1' })
      expect(res.statusCode).toBe(200)
    }
  })
})

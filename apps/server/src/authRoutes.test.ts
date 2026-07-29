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

// The code machinery is tested against its own rules in loginCodes.test.ts.
// Here it's a seam: these tests are about what the *route* does with an answer
// — which status it maps it to, whose row it signs in, what it puts in a
// cookie — and driving that through real bcrypt hashing would be slow and
// would test the same thing twice.
const mockCodes = vi.hoisted(() => ({
  issueCode: vi.fn(),
  redeemCode: vi.fn(),
}))
vi.mock('./loginCodes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./loginCodes.js')>()),
  issueCode: mockCodes.issueCode,
  redeemCode: mockCodes.redeemCode,
}))

const mockSendEmail = vi.hoisted(() => vi.fn())
vi.mock('./email.js', () => ({ sendEmail: mockSendEmail }))

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

function requestCode(app: FastifyInstance, email: string, ip: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/code/request',
    payload: { email },
    remoteAddress: ip,
  })
}

function verifyCode(app: FastifyInstance, email: string, ip: string, cookies?: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/code/verify',
    payload: { email, code: '123456' },
    remoteAddress: ip,
    cookies,
  })
}

const ISSUED = {
  code: '123456',
  nonce: 'nonce-abc',
  confirmation: 'K7Q2',
  expiresAt: new Date('2026-07-29T18:10:00Z'),
}

beforeEach(() => {
  mockPrisma.user.create.mockReset()
  mockPrisma.user.update.mockReset()
  mockPrisma.user.findUnique.mockReset()
  mockCodes.issueCode.mockReset()
  mockCodes.redeemCode.mockReset()
  mockSendEmail.mockReset()

  mockPrisma.user.create.mockResolvedValue({ id: 'guest-1' })
  mockCodes.issueCode.mockResolvedValue(ISSUED)
  mockCodes.redeemCode.mockResolvedValue({ ok: true })
  mockSendEmail.mockResolvedValue(undefined)
})

describe('requesting a code (#316)', () => {
  it('mails one and hands back the confirmation phrase, without saying whether the address is known', async () => {
    const app = await buildApp()

    const res = await requestCode(app, 'teacher@example.com', '10.0.0.1')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ confirmation: 'K7Q2' })
    // Nothing about the account: a code goes out either way, so there is no
    // "this address is registered" for the response to leak.
    expect(res.json()).not.toHaveProperty('userId')
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ to: 'teacher@example.com' })
  })

  it('ties the code to this browser with a short-lived nonce cookie', async () => {
    const app = await buildApp()

    const res = await requestCode(app, 'teacher@example.com', '10.0.0.1')

    const nonce = res.cookies.find(c => c.name === 'al_login_nonce')
    expect(nonce?.value).toBe('nonce-abc')
    expect(nonce?.httpOnly).toBe(true)
    // The code's own lifetime, not the identity cookie's ~400 days.
    expect(nonce?.maxAge).toBe(600)
  })

  it('refuses an address that is not one', async () => {
    const app = await buildApp()

    const res = await requestCode(app, 'not-an-email', '10.0.0.1')

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'invalid_email' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('says so when the mail could not be sent', async () => {
    mockSendEmail.mockRejectedValue(new Error('resend is down'))
    const app = await buildApp()

    const res = await requestCode(app, 'teacher@example.com', '10.0.0.1')

    // The alternative — 200 and a silent failure — leaves someone waiting on
    // an empty inbox, deciding they typed their own address wrong.
    expect(res.statusCode).toBe(502)
    expect(res.json()).toMatchObject({ error: 'email_failed' })
  })

  it('passes the cooldown through as a number of seconds', async () => {
    mockCodes.issueCode.mockResolvedValue({ retryAfterMs: 42_000 })
    const app = await buildApp()

    const res = await requestCode(app, 'teacher@example.com', '10.0.0.1')

    expect(res.statusCode).toBe(429)
    expect(res.json()).toMatchObject({ error: 'code_cooldown', retryAfterSeconds: 42 })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('signing in with a code (#316)', () => {
  it('hands the browser nonce to the redeemer', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'teacher@example.com', name: 'T' })
    const app = await buildApp()

    await verifyCode(app, 'teacher@example.com', '10.0.0.1', { al_login_nonce: 'nonce-abc' })

    expect(mockCodes.redeemCode).toHaveBeenCalledWith('teacher@example.com', '123456', 'nonce-abc')
  })

  it('maps each refusal to its own code, and only exhaustion to 429', async () => {
    const app = await buildApp()

    for (const [reason, status] of [
      ['invalid_code', 401],
      ['code_expired', 401],
      ['wrong_browser', 401],
      ['attempts_exhausted', 429],
    ] as const) {
      mockCodes.redeemCode.mockResolvedValue({ ok: false, reason })
      const res = await verifyCode(app, `${reason}@example.com`, '10.9.0.1')
      expect(res.statusCode).toBe(status)
      expect(res.json()).toMatchObject({ error: reason })
    }
  })

  it('signs into the account the address already has', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner', email: 'teacher@example.com', name: 'T' })
    const app = await buildApp()

    const res = await verifyCode(app, 'teacher@example.com', '10.0.0.1', { al_login_nonce: 'nonce-abc' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ userId: 'owner', email: 'teacher@example.com' })
    // No account was created or renamed — the row already existed. (The one
    // `user.create` in the trace is identityHook minting the guest row for a
    // request that arrived without a cookie, which is every first request.)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(mockPrisma.user.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: expect.anything() }) }),
    )
  })

  it('fills the address in on the guest row this browser was already using', async () => {
    // Nobody owns the address; the cookie's row is an anonymous guest.
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'guest-1', email: null, name: null })
    mockPrisma.user.update.mockResolvedValue({ id: 'guest-1', email: 'new@example.com', name: null })
    const app = await buildApp()

    const res = await verifyCode(app, 'new@example.com', '10.0.0.1', { al_login_nonce: 'nonce-abc' })

    // The whole point of upgrading in place (#41): rooms drawn before signing
    // up stay with the person who drew them.
    expect(res.json()).toMatchObject({ userId: 'guest-1', email: 'new@example.com' })
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'guest-1' }, data: { email: 'new@example.com' } }),
    )
  })

  it('does not rename an account when someone signs in as a second address in the same browser', async () => {
    // No account for the new address, but this browser is already signed in.
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'guest-1', email: 'someone@example.com', name: 'S' })
    mockPrisma.user.create.mockResolvedValue({ id: 'fresh', email: 'second@example.com', name: null })
    const app = await buildApp()

    const res = await verifyCode(app, 'second@example.com', '10.0.0.1', { al_login_nonce: 'nonce-abc' })

    // Upgrading in place here would hand the first account's rooms to whoever
    // proved the second address.
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(res.json()).toMatchObject({ userId: 'fresh', email: 'second@example.com' })
  })

  it('spends the nonce along with the code', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'teacher@example.com', name: null })
    const app = await buildApp()

    const res = await verifyCode(app, 'teacher@example.com', '10.0.0.1', { al_login_nonce: 'nonce-abc' })

    const nonce = res.cookies.find(c => c.name === 'al_login_nonce')
    expect(nonce?.value).toBe('')
    expect(res.cookies.some(c => c.name === 'al_id')).toBe(true)
  })
})

describe('rate limits on /api/auth/* (#237)', () => {
  it('cuts off code requests from one address', async () => {
    const app = await buildApp()

    // 15 is the budget (CODE_REQUEST_IP_LIMIT), so the 16th is the first
    // refusal. Distinct recipients, so it's the per-IP ceiling being measured
    // and not the per-mailbox one.
    for (let i = 0; i < 15; i++) {
      expect((await requestCode(app, `person${i}@example.com`, '10.0.0.1')).statusCode).toBe(200)
    }

    const blocked = await requestCode(app, 'one-too-many@example.com', '10.0.0.1')
    expect(blocked.statusCode).toBe(429)
    // Codes, not prose (#208) — `error` is what ApiError carries client-side,
    // and Auth/index.tsx turns it into a sentence.
    expect(blocked.json()).toMatchObject({ error: 'rate_limited' })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('caps how much mail one mailbox can be sent, however many addresses ask', async () => {
    const app = await buildApp()

    // A different IP every time: this ceiling exists because the endpoint
    // needs no credentials and puts mail in somebody else's inbox, and
    // rotating source addresses is free.
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(app, 'victim@example.com', `10.7.0.${i}`)).statusCode).toBe(200)
    }

    expect((await requestCode(app, 'victim@example.com', '10.7.0.99')).statusCode).toBe(429)
    // And only that mailbox is affected.
    expect((await requestCode(app, 'bystander@example.com', '10.7.0.99')).statusCode).toBe(200)
  })

  it('holds the per-IP budget per address, not globally', async () => {
    const app = await buildApp()

    for (let i = 0; i < 21; i++) await verifyCode(app, `a${i}@example.com`, '10.0.0.1')

    // The failure this guards against: one person exhausting the limit for
    // every other person on the internet.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'someone@example.com', name: null })
    expect((await verifyCode(app, 'someone@example.com', '10.0.0.2')).statusCode).toBe(200)
  })

  it('locks one account after enough wrong codes, however many addresses they come from', async () => {
    mockCodes.redeemCode.mockResolvedValue({ ok: false, reason: 'invalid_code' })
    const app = await buildApp()

    // A different IP every time, so the per-IP ceiling can't be what stops
    // this — rotating addresses is cheap, and that's the whole point of
    // counting failures per email as well.
    for (let i = 0; i < 10; i++) {
      expect((await verifyCode(app, 'target@example.com', `10.1.0.${i}`)).statusCode).toBe(401)
    }

    const blocked = await verifyCode(app, 'target@example.com', '10.1.0.99')
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toMatchObject({ error: 'rate_limited' })

    // And the lock is on that email alone.
    expect((await verifyCode(app, 'bystander@example.com', '10.1.0.99')).statusCode).toBe(401)
  })

  it('spends the account budget on failures only', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'teacher@example.com', name: 'T' })
    const app = await buildApp()

    // A teacher signing in from a dozen devices, all correctly. If successes
    // counted, the reward for using the product would be a lockout.
    for (let i = 0; i < 12; i++) {
      expect((await verifyCode(app, 'teacher@example.com', `10.2.0.${i}`)).statusCode).toBe(200)
    }
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
    const app = await buildApp()

    for (let i = 0; i < 20; i++) await verifyCode(app, `a${i}@example.com`, '10.5.0.1')
    mockPrisma.user.create.mockClear()

    const blocked = await verifyCode(app, 'a@example.com', '10.5.0.1')

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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { identityHook, IDENTITY_COOKIE, resolveSocketIdentity, signIdentityToken, verifyIdentityToken } from './identity.js'

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'identity-regression-secret'
  return { user: { findUnique: vi.fn(), create: vi.fn() } }
})
vi.mock('../db/prisma.js', () => ({ prisma: db }))
vi.mock('./sessions.js', async importOriginal => ({ ...await importOriginal<typeof import('./sessions.js')>(), recordSighting: vi.fn() }))
vi.mock('./bans.js', () => ({ isBanned: () => false, isIpBanned: () => false, isTokenRevoked: () => false }))

beforeEach(() => {
  vi.clearAllMocks()
  db.user.findUnique.mockResolvedValue(null)
  db.user.create.mockResolvedValue({ id: 'fresh-guest' })
})

describe('identity whose signed user no longer exists', () => {
  it('replaces the stale HTTP cookie with a real guest identity', async () => {
    const app = Fastify()
    await app.register(cookie)
    app.addHook('preHandler', identityHook)
    app.get('/who', async request => ({ id: request.userId }))
    try {
      const response = await app.inject({ method: 'GET', url: '/who', cookies: { [IDENTITY_COOKIE]: signIdentityToken('deleted-user') } })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ id: 'fresh-guest' })
      const replacement = response.cookies.find(c => c.name === IDENTITY_COOKIE)
      expect(replacement).toBeDefined()
      expect(verifyIdentityToken(replacement!.value)).toBe('fresh-guest')
    } finally { await app.close() }
  })

  it('never gives a Socket.io connection the missing user id', async () => {
    const identity = await resolveSocketIdentity(`${IDENTITY_COOKIE}=${signIdentityToken('deleted-user')}`)
    expect(identity.userId).toBe('fresh-guest')
    expect(db.user.create).toHaveBeenCalledOnce()
  })

  it('keeps an existing signed user instead of creating a guest', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'existing-user' })
    const identity = await resolveSocketIdentity(`${IDENTITY_COOKIE}=${signIdentityToken('existing-user')}`)
    expect(identity.userId).toBe('existing-user')
    expect(db.user.create).not.toHaveBeenCalled()
  })
})

import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { IDENTITY_COOKIE, identityCookieOptions, signIdentityToken } from './identity.js'

const BCRYPT_ROUNDS = 10

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Email+password (#41 MVP credential method — other providers, e.g. Google
 *  OAuth, land later per #5) register/login/logout, plus `/api/me` so the
 *  client can tell "am I logged in" apart from "am I just an anonymous guest
 *  with a cookie" (both have a valid identity cookie; only one has an email).
 *
 *  Register/login don't mint a *new* identity — they fill in (or verify)
 *  email+passwordHash on whichever `User` row `request.userId` already
 *  resolves to (see identityHook), so a room you created anonymously in this
 *  browser is still yours the moment you register in it. */
export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/me', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, email: true, name: true },
    })
    return { userId: request.userId, email: user?.email ?? null, name: user?.name ?? null }
  })

  app.post<{ Body: { email: string; password: string; name?: string } }>('/api/auth/register', async (request, reply) => {
    const { email, password, name } = request.body ?? {}
    if (!email || !isValidEmail(email)) return reply.code(400).send({ error: 'invalid_email' })
    if (!password || password.length < 8) return reply.code(400).send({ error: 'weak_password' })

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return reply.code(409).send({ error: 'email_taken' })

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    // Upgrades the *current* anonymous row in place — request.userId already
    // points at a guest User (identityHook runs before every route), so this
    // keeps every room it already owns/participated in.
    const user = await prisma.user.update({
      where: { id: request.userId },
      data: { email, passwordHash, name: name?.trim() || undefined },
      select: { id: true, email: true, name: true },
    })

    reply.setCookie(IDENTITY_COOKIE, signIdentityToken(user.id), identityCookieOptions())
    return { userId: user.id, email: user.email, name: user.name }
  })

  app.post<{ Body: { email: string; password: string } }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {}
    if (!email || !password) return reply.code(400).send({ error: 'invalid_credentials' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    // Logging in on a device that already had its own (different) anonymous
    // guest identity abandons that guest row where it sits — its rooms stay
    // owned by that now-orphaned id, unreachable from any account. Same
    // tradeoff as the identity cookie generally: it's device/browser-scoped,
    // not something a login retroactively merges (see the #41 discussion).
    reply.setCookie(IDENTITY_COOKIE, signIdentityToken(user.id), identityCookieOptions())
    return { userId: user.id, email: user.email, name: user.name }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    // Logging out drops back to a *fresh* anonymous guest identity rather
    // than clearing the cookie outright — every future request still needs
    // some User row to attribute new rooms/operations to (see identityHook).
    const guest = await prisma.user.create({ data: {} })
    reply.setCookie(IDENTITY_COOKIE, signIdentityToken(guest.id), identityCookieOptions())
    return { userId: guest.id, email: null, name: null }
  })
}

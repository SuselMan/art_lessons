import jwt from 'jsonwebtoken'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { prisma } from './prisma.js'

// Every browser gets a stable identity the moment it first talks to the
// server — an httpOnly JWT cookie pointing at a `User` row. Anonymous rooms
// need *some* durable owner to survive a reconnect/server-restart (#74); a
// fresh Socket.io connection id can't be that, since it churns on every
// reconnect (see the "identity churn" comment in Room/index.tsx). Registering
// later (#41) just fills in email/passwordHash on this same row/id — it
// never migrates room ownership, because there's nothing to migrate.
export const IDENTITY_COOKIE = 'al_id'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 400 // ~400 days — longer than any browser keeps a cookie by default anyway

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} env var is required`)
  return value
}
const JWT_SECRET = requireEnv('JWT_SECRET')

export function signIdentityToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS })
}

export function verifyIdentityToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function createGuestUser(): Promise<string> {
  const user = await prisma.user.create({ data: {} })
  return user.id
}

/** Cookie options shared by every place that sets `IDENTITY_COOKIE`. `sameSite:
 *  'lax'` still rides along on cross-origin-but-same-site requests (our dev
 *  setup: same LAN hostname, different ports for Vite vs the API — Same-Site
 *  is domain-based, not port-based), which is what both the fetch-based HTTP
 *  routes and the Socket.io handshake need. `secure` is real https-only, so it
 *  has to stay off for plain-http LAN dev or the cookie is silently dropped. */
export function identityCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  }
}

/** Fastify preHandler: resolves `request.userId` from the identity cookie,
 *  minting a fresh guest `User` + cookie on first-ever visit. Registered
 *  globally so every HTTP route (including future ones) gets `request.userId`
 *  for free without repeating this per-route. */
export async function identityHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const existing = request.cookies[IDENTITY_COOKIE]
  const userId = existing && verifyIdentityToken(existing)
  if (userId) {
    request.userId = userId
    return
  }
  const freshUserId = await createGuestUser()
  request.userId = freshUserId
  reply.setCookie(IDENTITY_COOKIE, signIdentityToken(freshUserId), identityCookieOptions())
}

/** Same resolution as `identityHook`, but for a Socket.io handshake, which has
 *  no `FastifyReply` to attach a fresh Set-Cookie to. In practice this never
 *  hits the "mint a new one" branch — the client always warms up its cookie
 *  via a plain HTTP call (`GET /api/me`) before ever opening a socket — but if
 *  it somehow does, this hands back a one-connection-only guest identity
 *  (logged, not persisted as a cookie) rather than failing the connection. */
export async function resolveSocketIdentity(cookieHeader: string | undefined): Promise<string> {
  const existing = extractCookie(cookieHeader, IDENTITY_COOKIE)
  const userId = existing && verifyIdentityToken(existing)
  if (userId) return userId
  return createGuestUser()
}

function extractCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

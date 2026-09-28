import jwt from 'jsonwebtoken'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { isBanned, isIpBanned, isTokenRevoked } from './bans.js'
import { prisma } from '../db/prisma.js'
import {
  DEVICE_COOKIE, deviceCookieOptions, newDeviceId, normalizeIp, readDeviceId, recordSighting,
} from './sessions.js'

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
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null
    // (#589) "Sign out everywhere" refuses every token issued before it. A
    // refused token reads exactly like no token: the browser becomes a fresh
    // guest, which is what signing out has always meant here.
    if (typeof payload.iat === 'number' && isTokenRevoked(payload.sub, payload.iat)) return null
    return payload.sub
  } catch {
    return null
  }
}

async function createGuestUser(): Promise<string> {
  const user = await prisma.user.create({ data: { lastSeenAt: new Date() } })
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
 *  for free without repeating this per-route.
 *
 *  A route can opt out with `config: { skipIdentity: true }` — needed by
 *  anything a machine calls while never holding a cookie, since for those
 *  "mint a guest User on first visit" means a fresh row on *every* request,
 *  forever (see healthRoutes.ts, #178). The opt-out lives per-route rather
 *  than as a path list here so it stays next to the route that needs it.
 *
 *  It has to be an explicit flag rather than registration order: adding this
 *  hook *after* a route still applies it to that route, so registering
 *  something "above the hook" exempts nothing (asserted in
 *  healthRoutes.test.ts, because the failure mode is silent). */
export async function identityHook(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (request.routeOptions.config?.skipIdentity) return
  const ip = normalizeIp(request.ip)
  // (#590) First, and before a guest row can be minted: an address ban is
  // aimed precisely at the person who comes back with no cookie at all.
  if (isIpBanned(ip)) return reply.code(403).send({ error: 'banned' })

  let deviceId = readDeviceId(request.cookies[DEVICE_COOKIE])
  if (!deviceId) {
    deviceId = newDeviceId()
    reply.setCookie(DEVICE_COOKIE, deviceId, deviceCookieOptions())
  }
  request.deviceId = deviceId

  const existing = request.cookies[IDENTITY_COOKIE]
  const userId = existing && verifyIdentityToken(existing)
  if (userId) {
    // (#587) Before the route runs, and for every route: a ban that only some
    // endpoints respect is a list of the ones that don't. `/api/me` included
    // — that refusal is how the client learns to show the banned screen.
    if (isBanned(userId)) return reply.code(403).send({ error: 'banned' })
    request.userId = userId
    recordSighting({ userId, deviceId, ip, userAgent: request.headers['user-agent'] })
    return
  }
  const freshUserId = await createGuestUser()
  request.userId = freshUserId
  reply.setCookie(IDENTITY_COOKIE, signIdentityToken(freshUserId), identityCookieOptions())
  recordSighting({ userId: freshUserId, deviceId, ip, userAgent: request.headers['user-agent'] })
}

export type SocketIdentity = { userId: string; deviceId: string }

/** Same resolution as `identityHook`, but for a Socket.io handshake, which has
 *  no `FastifyReply` to attach a fresh Set-Cookie to. In practice this never
 *  hits the "mint a new one" branch — the client always warms up its cookie
 *  via a plain HTTP call (`GET /api/me`) before ever opening a socket — but if
 *  it somehow does, this hands back a one-connection-only guest identity
 *  (logged, not persisted as a cookie) rather than failing the connection.
 *  The device falls back the same way, to a throwaway id. */
export async function resolveSocketIdentity(cookieHeader: string | undefined): Promise<SocketIdentity> {
  const deviceId = readDeviceId(extractCookie(cookieHeader, DEVICE_COOKIE)) ?? newDeviceId()
  const existing = extractCookie(cookieHeader, IDENTITY_COOKIE)
  const userId = existing && verifyIdentityToken(existing)
  if (userId) return { userId, deviceId }
  return { userId: await createGuestUser(), deviceId }
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
    /** (#589) The `al_dev` cookie — which browser this is. Set by identityHook
     *  alongside `userId`, on the same routes. */
    deviceId: string
  }
  interface FastifyContextConfig {
    /** Opt this route out of `identityHook` — no `request.userId`, no cookie,
     *  no guest `User` row. Only for routes never called by a browser. */
    skipIdentity?: boolean
  }
}

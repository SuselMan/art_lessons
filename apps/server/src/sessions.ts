import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

import { sanitizeClientEnvironment } from '@grafetto/shared'
import type { ApiOk } from '@grafetto/shared'

import { apiRoute } from './apiRoute.js'
import { describeClient } from './clientDescription.js'
import { prisma } from './prisma.js'

/** (#589) Which browser a request came from. Its own cookie rather than
 *  anything in the identity token: signing in on a second browser gives both
 *  the same user id, and "which of this person's devices" needs a key that the
 *  sign-in does not copy. Not secret and not a credential — it only groups
 *  sightings in the admin panel. */
export const DEVICE_COOKIE = 'al_dev'
const DEVICE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 400
const DEVICE_ID = /^[0-9a-f-]{36}$/

export function readDeviceId(raw: string | undefined): string | null {
  return raw && DEVICE_ID.test(raw) ? raw : null
}

export function newDeviceId(): string {
  return randomUUID()
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEVICE_COOKIE_TTL_SECONDS,
  }
}

/** `::ffff:1.2.3.4` is how Node spells an IPv4 client on a dual-stack socket.
 *  Stored as the plain address, so a ban typed as `1.2.3.4` matches it. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown'
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

/** The client address of a socket.io handshake, read the way Fastify's
 *  `trustProxy: 1` reads it for HTTP (index.ts): the rightmost
 *  X-Forwarded-For entry is the address nginx saw, anything to its left is
 *  whatever the client chose to send. */
export function handshakeIp(headers: Record<string, string | string[] | undefined>, address: string): string {
  const forwarded = headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded
  const last = value?.split(',').pop()?.trim()
  return normalizeIp(last || address)
}

/** How stale any of this may get. The questions it answers — last visit,
 *  which devices, which addresses — are about days, and one write per
 *  person/device/address per five minutes keeps a lesson in progress from
 *  writing on every request. */
const SIGHTING_WRITE_INTERVAL_MS = 5 * 60 * 1000
/** Past this many remembered keys the map is dropped: forgetting costs one
 *  extra write per key, never forgetting costs memory for every visitor. */
const SIGHTING_MEMORY_CAP = 50_000
const lastWrittenAt = new Map<string, number>()

export type Sighting = { userId: string; deviceId: string; ip: string; userAgent: string | undefined }

/** Records that this person, on this device, from this address, is here now:
 *  `User.lastSeenAt`, their `UserDevice` row, and the `IpSighting` row.
 *
 *  Fire-and-forget, like the write it replaced: a failed bookkeeping write must
 *  never fail the request it rode in on. Each write is caught on its own, so a
 *  guest row that has not landed yet (the device row's foreign key) costs only
 *  that one write. */
export function recordSighting({ userId, deviceId, ip, userAgent }: Sighting, now = Date.now()): void {
  const key = `${userId}|${deviceId}|${ip}`
  const last = lastWrittenAt.get(key)
  if (last !== undefined && now - last < SIGHTING_WRITE_INTERVAL_MS) return
  if (lastWrittenAt.size >= SIGHTING_MEMORY_CAP) lastWrittenAt.clear()
  lastWrittenAt.set(key, now)

  const at = new Date(now)
  const client = describeClient(userAgent)
  const ignore = () => {}
  try {
    void prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: at } }).catch(ignore)
    void prisma.userDevice.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, userAgent: client.ua, platform: client.platform, browser: client.browser, lastIp: ip, firstSeenAt: at, lastSeenAt: at },
      update: { userAgent: client.ua, platform: client.platform, browser: client.browser, lastIp: ip, lastSeenAt: at },
    }).catch(ignore)
    void prisma.ipSighting.upsert({
      where: { ip_userId_deviceId: { ip, userId, deviceId } },
      create: { ip, userId, deviceId, firstSeenAt: at, lastSeenAt: at },
      update: { lastSeenAt: at },
    }).catch(ignore)
  } catch {
    // A mocked or half-initialised client in tests; see the doc comment.
  }
}

/** Test seam: forget which sightings were written, so a test can see the
 *  next one go out. */
export function _resetSightingThrottle(): void {
  lastWrittenAt.clear()
}

/** How long a device or an address is kept after it was last seen. What the
 *  privacy policy promises (#323) — change them together. */
export const SIGHTING_RETENTION_DAYS = 90

export async function pruneSightings(now = new Date()): Promise<{ devices: number; ips: number }> {
  const cutoff = new Date(now.getTime() - SIGHTING_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const [devices, ips] = await Promise.all([
    prisma.userDevice.deleteMany({ where: { lastSeenAt: { lt: cutoff } } }),
    prisma.ipSighting.deleteMany({ where: { lastSeenAt: { lt: cutoff } } }),
  ])
  return { devices: devices.count, ips: ips.count }
}

/** `POST /api/me/environment` — the browser describing itself (#589). Kept on
 *  the device row, replaced wholesale on every report: it is a snapshot of the
 *  device as it is now, and a stale field left over from an older report
 *  would be a claim nobody made. */
export function registerSessionRoutes(app: FastifyInstance): void {
  apiRoute(app, 'POST /api/me/environment', {
    // Once per page load per tab; a ceiling well above that only stops a loop.
    config: { rateLimit: { max: 30, timeWindow: '5 minutes' } },
    bodyLimit: 8 * 1024,
  }, async (request, reply) => {
    const deviceId = request.deviceId
    if (!deviceId) return reply.code(400).send({ error: 'no_device' })
    const env = sanitizeClientEnvironment(request.body)
    const client = describeClient(request.headers['user-agent'])
    const now = new Date()
    await prisma.userDevice.upsert({
      where: { userId_deviceId: { userId: request.userId, deviceId } },
      create: {
        userId: request.userId, deviceId, userAgent: client.ua, platform: client.platform, browser: client.browser,
        lastIp: normalizeIp(request.ip), env, envAt: now,
      },
      update: { env, envAt: now },
    })
    return { ok: true } satisfies ApiOk
  })
}

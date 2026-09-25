import { prisma } from './prisma.js'

/** (#587) Account bans, answered from memory.
 *
 *  The identity cookie is a signed token checked without touching Postgres
 *  (identity.ts), and a ban has to be checked on exactly the same path — every
 *  HTTP request and every socket handshake. A query per request to learn a fact
 *  that changes a few times a year would be the most expensive line in the
 *  server, so the set of banned ids lives here: filled once at boot, kept
 *  current by the admin routes that are the only writers of `User.bannedAt`.
 *
 *  One process, so one copy (CLAUDE.md: no Redis). If that ever stops being
 *  true, this is the module that has to learn about the others. */
const bannedUserIds = new Set<string>()

export async function loadBans(): Promise<number> {
  const rows = await prisma.user.findMany({ where: { bannedAt: { not: null } }, select: { id: true } })
  bannedUserIds.clear()
  for (const row of rows) bannedUserIds.add(row.id)
  return bannedUserIds.size
}

export function isBanned(userId: string): boolean {
  return bannedUserIds.has(userId)
}

export function bannedCount(): number {
  return bannedUserIds.size
}

/** Mirrors a write the caller has already made to `User.bannedAt`. Never the
 *  other way round: memory reflects the row, so a failed write leaves nobody
 *  banned in memory who isn't banned in Postgres. */
export function noteBanned(userId: string, banned: boolean): void {
  if (banned) bannedUserIds.add(userId)
  else bannedUserIds.delete(userId)
}

/** Sign-in is by address, and a banned person who cleared their cookies holds
 *  a fresh guest identity nobody banned — the address is what still names
 *  them. Postgres rather than memory: the set is keyed by id, and this runs
 *  once per code request, not per request. */
export async function isEmailBanned(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { bannedAt: true } })
  return user?.bannedAt != null
}

/** (#590) Active IP bans: address → when the ban ends (ms). Same reasoning as
 *  the account set above — checked on every request, written a few times a
 *  year — plus one thing of its own: every entry expires, so a read that
 *  finds an expired one drops it instead of trusting it. */
const ipBanEnds = new Map<string, number>()

export async function loadIpBans(now = new Date()): Promise<number> {
  const rows = await prisma.ipBan.findMany({
    where: { liftedAt: null, expiresAt: { gt: now } },
    select: { ip: true, expiresAt: true },
  })
  ipBanEnds.clear()
  for (const row of rows) noteIpBan(row.ip, row.expiresAt.getTime())
  return ipBanEnds.size
}

export function isIpBanned(ip: string, now = Date.now()): boolean {
  const ends = ipBanEnds.get(ip)
  if (ends === undefined) return false
  if (ends > now) return true
  ipBanEnds.delete(ip)
  return false
}

/** Mirrors a write already made to `IpBan`. `null` lifts; overlapping bans on
 *  one address keep whichever ends last. */
export function noteIpBan(ip: string, endsAt: number | null): void {
  if (endsAt === null) {
    ipBanEnds.delete(ip)
    return
  }
  ipBanEnds.set(ip, Math.max(endsAt, ipBanEnds.get(ip) ?? 0))
}

/** (#589) "Sign out everywhere": user → the second before which every identity
 *  token of theirs is refused. Seconds, because that is what a JWT's `iat`
 *  carries — comparing it against milliseconds would refuse a token signed in
 *  the same second as the revocation, i.e. the very sign-in that follows it. */
const revokedBeforeSec = new Map<string, number>()

export async function loadRevocations(): Promise<number> {
  const rows = await prisma.user.findMany({
    where: { sessionsRevokedAt: { not: null } },
    select: { id: true, sessionsRevokedAt: true },
  })
  revokedBeforeSec.clear()
  for (const row of rows) if (row.sessionsRevokedAt) noteRevoked(row.id, row.sessionsRevokedAt)
  return revokedBeforeSec.size
}

export function noteRevoked(userId: string, at: Date): void {
  revokedBeforeSec.set(userId, Math.floor(at.getTime() / 1000))
}

export function isTokenRevoked(userId: string, issuedAtSec: number): boolean {
  const before = revokedBeforeSec.get(userId)
  return before !== undefined && issuedAtSec < before
}

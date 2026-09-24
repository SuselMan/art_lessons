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

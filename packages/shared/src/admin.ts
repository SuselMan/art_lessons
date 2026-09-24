// (#585) The admin panel's wire contract. Dates travel as ISO strings, as
// everywhere else on this API.

export type AdminOverview = {
  /** (#589) Devices seen in the last seven days, by platform and by browser. */
  devices: {
    byPlatform: Array<{ key: string; count: number }>
    byBrowser: Array<{ key: string; count: number }>
  }
  users: {
    registered: number
    registeredLast24h: number
    registeredLast7d: number
    /** Guests who have been in at least one room. Every browser that ever
     *  loaded a page is a guest row, so the bare count is mostly noise. */
    activeGuests: number
    seenLast24h: number
    banned: number
  }
  lessons: {
    total: number
    createdLast24h: number
    createdLast7d: number
    /** Lessons anyone entered in the last 24 hours. */
    activeLast24h: number
  }
  live: {
    sockets: number
    people: number
    lessons: AdminLiveLesson[]
  }
  server: {
    uptimeSeconds: number
    rssMb: number
    heapUsedMb: number
    heapLimitMb: number
    residentRooms: number
    residentOperations: number
    diskUsedPct: number | null
    diskFreeGb: number | null
  }
}

export type AdminLiveLesson = {
  lessonId: string
  name: string
  ownerId: string
  ownerEmail: string | null
  boards: number
  participants: Array<{ userId: string; name: string; role: 'owner' | 'member' }>
}

export type AdminUserFilter = 'all' | 'registered' | 'guests' | 'banned'

export type AdminUserRow = {
  id: string
  email: string | null
  name: string | null
  createdAt: string
  lastSeenAt: string | null
  bannedAt: string | null
  ownedLessons: number
  joinedRooms: number
  online: boolean
}

export type AdminUserList = { users: AdminUserRow[]; total: number }

export type AdminUserLesson = {
  id: string
  name: string
  createdAt: string
  role: 'owner' | 'member'
  /** What this person called themselves in that room, if they joined it. */
  nameInRoom: string | null
  lastActiveAt: string | null
}

export type AdminUserDetail = AdminUserRow & {
  banReason: string | null
  bannedById: string | null
  sessionsRevokedAt: string | null
  lessons: AdminUserLesson[]
  devices: AdminDevice[]
  ips: AdminUserIp[]
  actions: AdminActionRow[]
}

/** (#589) One browser this person has used — see `UserDevice` in the schema. */
export type AdminDevice = {
  deviceId: string
  platform: string
  browser: string
  userAgent: string
  lastIp: string | null
  /** What the client last reported about itself; null until it has. */
  env: ClientEnvironment | null
  envAt: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export type AdminUserIp = {
  ip: string
  firstSeenAt: string
  lastSeenAt: string
  /** Whether an IP ban is in force on this address right now. */
  banned: boolean
}

/** (#590) Everyone seen from one address, and its ban history. */
export type AdminIpDetail = {
  ip: string
  activeBan: AdminIpBan | null
  sightings: Array<{
    userId: string
    email: string | null
    name: string | null
    deviceId: string
    firstSeenAt: string
    lastSeenAt: string
    userBanned: boolean
  }>
  bans: AdminIpBan[]
}

export type AdminIpBan = {
  id: string
  ip: string
  reason: string
  createdById: string
  createdByEmail: string | null
  createdAt: string
  expiresAt: string
  liftedAt: string | null
}

export type AdminIpBanList = { bans: AdminIpBan[] }

/** (#590) The only lengths an IP ban can have. A menu rather than a number:
 *  every entry is a deliberate "how long could this address plausibly still
 *  be that person", and "forever" is deliberately not one of them. */
export const IP_BAN_DURATIONS_HOURS = [1, 24, 24 * 7, 24 * 30] as const
export type IpBanDurationHours = typeof IP_BAN_DURATIONS_HOURS[number]

/** (#589) What a browser reports about itself once per page load
 *  (apps/web lib/environment.ts). Flat on purpose: the server keeps only the
 *  keys it knows, each checked against its type (`sanitizeClientEnvironment`),
 *  and a flat record is what makes that a loop instead of a parser.
 *
 *  Every field is optional — an old build, a browser without WebGL, a field
 *  added later — and the admin panel shows whatever arrived. */
export type ClientEnvironment = {
  appVersion?: string
  /** The effective device type (ADR 007), and whether the person picked it
   *  in Settings rather than leaving it to detection. */
  deviceType?: string
  deviceTypeChosen?: boolean
  screenW?: number
  screenH?: number
  dpr?: number
  viewportW?: number
  viewportH?: number
  maxTouchPoints?: number
  /** `(pointer: …)` of the primary input: coarse, fine or none. */
  pointer?: string
  hover?: boolean
  /** A pen with pressure has touched this browser at least once. Sticky. */
  penSeen?: boolean
  /** Launched as an installed PWA rather than in a tab. */
  standalone?: boolean
  language?: string
  timeZone?: string
  webgl?: boolean
  gpuVendor?: string
  gpuRenderer?: string
  maxTextureSize?: number
  deviceMemoryGb?: number
  cores?: number
}

const ENV_FIELDS: Record<keyof ClientEnvironment, 'string' | 'number' | 'boolean'> = {
  appVersion: 'string',
  deviceType: 'string',
  deviceTypeChosen: 'boolean',
  screenW: 'number',
  screenH: 'number',
  dpr: 'number',
  viewportW: 'number',
  viewportH: 'number',
  maxTouchPoints: 'number',
  pointer: 'string',
  hover: 'boolean',
  penSeen: 'boolean',
  standalone: 'boolean',
  language: 'string',
  timeZone: 'string',
  webgl: 'boolean',
  gpuVendor: 'string',
  gpuRenderer: 'string',
  maxTextureSize: 'number',
  deviceMemoryGb: 'number',
  cores: 'number',
}

const MAX_ENV_STRING = 200

/** Keeps the known keys whose values have the right type, and nothing else.
 *  The payload comes from a browser we do not control and is stored as Json,
 *  so this is the whole of its validation: unknown keys cannot grow the row,
 *  strings cannot be essays, numbers cannot be NaN. */
export function sanitizeClientEnvironment(raw: unknown): ClientEnvironment {
  const out: Record<string, string | number | boolean> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [key, kind] of Object.entries(ENV_FIELDS)) {
    const value: unknown = (raw as Record<string, unknown>)[key]
    if (kind === 'string' && typeof value === 'string') out[key] = value.slice(0, MAX_ENV_STRING)
    else if (kind === 'number' && typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (kind === 'boolean' && typeof value === 'boolean') out[key] = value
  }
  return out
}

export type AdminLessonRow = {
  id: string
  name: string
  createdAt: string
  closedAt: string | null
  ownerId: string
  ownerEmail: string | null
  participants: number
  boards: number
  operations: number
  lastActiveAt: string | null
  live: boolean
  hasThumbnail: boolean
}

export type AdminLessonList = { lessons: AdminLessonRow[]; total: number }

export type AdminActionRow = {
  id: string
  adminId: string
  adminEmail: string | null
  action: string
  targetUserId: string | null
  targetEmail: string | null
  targetRoomId: string | null
  targetIp: string | null
  reason: string | null
  createdAt: string
}

export type AdminActionList = { actions: AdminActionRow[] }

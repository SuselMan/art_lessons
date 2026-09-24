// (#585) The admin panel's wire contract. Dates travel as ISO strings, as
// everywhere else on this API.

export type AdminOverview = {
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
  lessons: AdminUserLesson[]
  actions: AdminActionRow[]
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
  reason: string | null
  createdAt: string
}

export type AdminActionList = { actions: AdminActionRow[] }

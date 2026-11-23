import type { FastifyRequest } from 'fastify'

// Explicit safe list: new routes are rejected until reviewed for room access.
const NO_ROOM = new Set([
  'GET /health', 'GET /api/health', 'GET /api/me',
  'GET /api/rooms', 'GET /api/rooms/mine', 'GET /api/rooms/search',
  'POST /api/rooms/folders', 'PATCH /api/rooms/folders/:id', 'DELETE /api/rooms/folders/:id',
  'POST /api/auth/code/request', 'POST /api/auth/code/verify', 'POST /api/auth/logout',
  'POST /api/me/environment',
  'GET /api/admin/actions', 'GET /api/admin/ip-bans', 'GET /api/admin/ips/:ip',
  'GET /api/admin/lessons', 'GET /api/admin/overview', 'GET /api/admin/users', 'GET /api/admin/users/:id',
  'POST /api/admin/ips/:ip/ban', 'POST /api/admin/ips/:ip/unban',
  'POST /api/admin/users/:id/ban', 'POST /api/admin/users/:id/unban', 'POST /api/admin/users/:id/revoke-sessions',
  'POST /api/brush-library/imports', 'GET /api/brush-library/imports/:id',
])
const ROOMS = new Set([
  'DELETE /api/rooms/:id', 'DELETE /api/rooms/:id/blocks/:userId', 'DELETE /api/rooms/:id/boards/:boardId',
  'DELETE /api/rooms/:id/invites/:email', 'DELETE /api/rooms/:id/participation',
  'GET /api/rooms/:id/access', 'GET /api/rooms/:id/brush-library/export',
  'PATCH /api/rooms/:id', 'PATCH /api/rooms/:id/access', 'PATCH /api/rooms/:id/boards/:boardId',
  'PATCH /api/rooms/:id/closed', 'PATCH /api/rooms/:id/folder',
  'POST /api/rooms/:id/boards', 'POST /api/rooms/:id/fork', 'POST /api/rooms/:id/invites',
  'POST /api/rooms/:id/kick', 'POST /api/rooms/:id/brush-library', 'GET /api/admin/lessons/:id/thumbnail',
  'GET /api/rooms/:roomId/operations', 'GET /api/rooms/:roomId/review',
  'GET /api/rooms/:roomId/snapshots/:layerId/:seq', 'GET /api/rooms/:roomId/snapshots/index',
  'GET /api/rooms/:roomId/thumbnail', 'POST /api/rooms/:roomId/review',
  'POST /api/rooms/:roomId/snapshots', 'POST /api/rooms/:roomId/thumbnail',
])
const QUERY_ROOM = new Set(['GET /api/brush-library', 'GET /api/brush-library/assets/:hash'])

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
function optionalRoom(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Returns a room or board ID. The caller must resolve board -> lesson in DB.
 * Unknown/missing route templates fail closed, never silently skip touching. */
export function qaHttpRoomId(request: Pick<FastifyRequest, 'method' | 'routeOptions' | 'params' | 'query' | 'body'>): string | null {
  const method = request.method === 'HEAD' ? 'GET' : request.method
  if (method === 'OPTIONS') return null
  const route = `${method} ${request.routeOptions.url ?? ''}`
  if (NO_ROOM.has(route)) return null
  if (ROOMS.has(route)) {
    const params = asObject(request.params)
    const room = optionalRoom(params.roomId ?? params.id)
    if (!room) throw new Error(`QA room route lacks ID: ${route}`)
    return room
  }
  if (QUERY_ROOM.has(route)) return optionalRoom(asObject(request.query).roomId)
  if (route === 'POST /api/me/room-open') return optionalRoom(asObject(request.body).roomId)
  throw new Error(`Unclassified QA HTTP route: ${route}`)
}

export function qaHttpLessonResolver(lookupLesson: (roomId: string) => Promise<string | null>) {
  return async (request: FastifyRequest): Promise<string | null> => {
    const roomId = qaHttpRoomId(request)
    return roomId ? lookupLesson(roomId) : null
  }
}

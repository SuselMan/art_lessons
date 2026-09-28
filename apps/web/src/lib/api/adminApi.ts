import type {
  AdminActionList, AdminIpBanList, AdminIpDetail, AdminLessonList, AdminOverview, AdminUserDetail, AdminUserFilter,
  AdminUserList, IpBanDurationHours,
} from '@grafetto/shared'

import { api, apiPath } from './api'

// (#588) The admin panel's calls. A file of their own so lib/api/api.ts — which
// every page imports — doesn't grow admin surface that ships to everyone.
//
// (#623) Typed by the shared route table, like every other call. An empty
// search box sends no `q` at all rather than `q=`.

export function fetchAdminOverview(): Promise<AdminOverview> {
  return api('GET /api/admin/overview')
}

export function fetchAdminUsers(filter: AdminUserFilter, q: string, offset: number): Promise<AdminUserList> {
  return api('GET /api/admin/users', { query: { filter, q: q || undefined, offset } })
}

export function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  return api('GET /api/admin/users/:id', { params: { id } })
}

export function banUser(id: string, reason: string): Promise<{ ok: true }> {
  return api('POST /api/admin/users/:id/ban', { params: { id }, body: { reason } })
}

export function unbanUser(id: string, reason: string): Promise<{ ok: true }> {
  return api('POST /api/admin/users/:id/unban', { params: { id }, body: { reason } })
}

export function fetchAdminLessons(q: string, offset: number): Promise<AdminLessonList> {
  return api('GET /api/admin/lessons', { query: { q: q || undefined, offset } })
}

export function adminLessonThumbnailUrl(id: string): string {
  return apiPath('GET /api/admin/lessons/:id/thumbnail', { params: { id } })
}

export function fetchAdminActions(): Promise<AdminActionList> {
  return api('GET /api/admin/actions')
}

export function revokeSessions(id: string): Promise<{ ok: true }> {
  return api('POST /api/admin/users/:id/revoke-sessions', { params: { id } })
}

export function fetchAdminIp(ip: string): Promise<AdminIpDetail> {
  return api('GET /api/admin/ips/:ip', { params: { ip } })
}

export function banIp(ip: string, reason: string, hours: IpBanDurationHours): Promise<{ ok: true }> {
  return api('POST /api/admin/ips/:ip/ban', { params: { ip }, body: { reason, hours } })
}

export function unbanIp(ip: string, reason: string): Promise<{ ok: true }> {
  return api('POST /api/admin/ips/:ip/unban', { params: { ip }, body: { reason } })
}

export function fetchIpBans(): Promise<AdminIpBanList> {
  return api('GET /api/admin/ip-bans')
}

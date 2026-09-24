import type {
  AdminActionList, AdminLessonList, AdminOverview, AdminUserDetail, AdminUserFilter, AdminUserList,
} from '@grafetto/shared'

import { apiFetch } from './api'

// (#588) The admin panel's calls. A file of their own so lib/api.ts — which
// every page imports — doesn't grow admin surface that ships to everyone.

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch('/api/admin/overview')
}

export function fetchAdminUsers(filter: AdminUserFilter, q: string, offset: number): Promise<AdminUserList> {
  return apiFetch(`/api/admin/users${query({ filter, q, offset })}`)
}

export function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}`)
}

export function banUser(id: string, reason: string): Promise<{ ok: true }> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/ban`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
}

export function unbanUser(id: string, reason: string): Promise<{ ok: true }> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/unban`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
}

export function fetchAdminLessons(q: string, offset: number): Promise<AdminLessonList> {
  return apiFetch(`/api/admin/lessons${query({ q, offset })}`)
}

export function adminLessonThumbnailUrl(id: string): string {
  return `/api/admin/lessons/${encodeURIComponent(id)}/thumbnail`
}

export function fetchAdminActions(): Promise<AdminActionList> {
  return apiFetch('/api/admin/actions')
}

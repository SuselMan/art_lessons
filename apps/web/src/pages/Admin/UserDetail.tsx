import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AdminUserDetail } from '@grafetto/shared'

import { ApiError } from '../../lib/api'
import { banUser, fetchAdminUser, unbanUser } from '../../lib/adminApi'
import { ActionTable } from './Journal'
import { ago, date } from './format'
import styles from './Admin.module.css'

const BAN_ERRORS: Record<string, string> = {
  reason_required: 'A reason is required.',
  reason_too_long: 'Keep the reason under 500 characters.',
  cannot_ban_self: 'You cannot ban yourself.',
  cannot_ban_admin: 'This is an admin. Remove them from ADMIN_EMAILS instead.',
  already_banned: 'Already banned.',
  not_banned: 'Not banned.',
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.code && BAN_ERRORS[err.code]) return BAN_ERRORS[err.code]
  return String(err)
}

function BanControl({ user }: { user: AdminUserDetail }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const refresh = () => {
    setReason('')
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const ban = useMutation({ mutationFn: () => banUser(user.id, reason), onSuccess: refresh })
  const unban = useMutation({ mutationFn: () => unbanUser(user.id, reason), onSuccess: refresh })
  const pending = ban.isPending || unban.isPending
  const error = ban.error ?? unban.error

  return (
    <div className={user.bannedAt ? `${styles.banBox} ${styles.banBoxActive}` : styles.banBox}>
      {user.bannedAt
        ? (
          <p>
            <strong>Banned</strong> {date(user.bannedAt)} — {user.banReason}
          </p>
        )
        : <p>Banning takes effect at once: open connections close, every request is refused, and no sign-in code is mailed to this address.</p>}
      <textarea
        className={styles.reason}
        rows={2}
        maxLength={500}
        placeholder={user.bannedAt ? 'Why lift it (optional)' : 'Why (required, kept in the journal)'}
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <div>
        {user.bannedAt
          ? <button type="button" className={styles.button} disabled={pending} onClick={() => unban.mutate()}>Unban</button>
          : (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              disabled={pending || !reason.trim()}
              onClick={() => ban.mutate()}
            >
              Ban account
            </button>
          )}
      </div>
      {error && <div className={styles.error}>{errorText(error)}</div>}
    </div>
  )
}

export function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data: user, error } = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => fetchAdminUser(userId) })

  return (
    <section className={styles.section}>
      <button type="button" className={styles.link} onClick={onBack}>← All users</button>
      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {user && (
        <>
          <h2 className={styles.detailTitle}>
            {user.email ?? 'Guest'}
            {user.online && <span className={styles.badgeLive}>online</span>}
            {user.bannedAt && <span className={styles.badgeBanned}>banned</span>}
          </h2>
          <dl className={styles.facts}>
            <dt>Id</dt><dd className={styles.mono}>{user.id}</dd>
            <dt>Name</dt><dd>{user.name ?? '—'}</dd>
            <dt>First visit</dt><dd>{date(user.createdAt)}</dd>
            <dt>Last seen</dt><dd>{user.online ? 'now' : ago(user.lastSeenAt)}</dd>
            <dt>Own lessons</dt><dd>{user.ownedLessons}</dd>
            <dt>Rooms joined</dt><dd>{user.joinedRooms}</dd>
          </dl>

          <BanControl user={user} />

          <h3 className={styles.sectionTitle}>Lessons</h3>
          {user.lessons.length === 0
            ? <p className={styles.empty}>None.</p>
            : (
              <div className={styles.tableWrap}><table className={styles.table}>
                <thead><tr><th>Lesson</th><th>Role</th><th>Called themselves</th><th>Last entered</th><th>Created</th></tr></thead>
                <tbody>
                  {user.lessons.map(lesson => (
                    <tr key={lesson.id}>
                      <td><div>{lesson.name}</div><div className={styles.mono}>{lesson.id}</div></td>
                      <td>{lesson.role}</td>
                      <td>{lesson.nameInRoom ?? '—'}</td>
                      <td>{ago(lesson.lastActiveAt)}</td>
                      <td>{date(lesson.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

          <h3 className={styles.sectionTitle}>Admin actions</h3>
          <ActionTable actions={user.actions} />
        </>
      )}
    </section>
  )
}

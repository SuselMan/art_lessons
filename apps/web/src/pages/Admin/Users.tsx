import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { AdminUserFilter } from '@grafetto/shared'

import { fetchAdminUsers } from '../../lib/api/adminApi'
import { Pager } from './Pager'
import { ago, date, shortId } from './format'
import styles from './Admin.module.css'

const FILTERS: Array<{ id: AdminUserFilter; label: string }> = [
  { id: 'registered', label: 'Registered' },
  { id: 'guests', label: 'Guests' },
  { id: 'banned', label: 'Banned' },
  { id: 'all', label: 'All' },
]

export function Users({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [filter, setFilter] = useState<AdminUserFilter>('registered')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error } = useQuery({
    queryKey: ['admin', 'users', filter, q, offset],
    queryFn: () => fetchAdminUsers(filter, q, offset),
    placeholderData: keepPreviousData,
  })

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <div className={styles.segmented}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={f.id === filter ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
              onClick={() => { setFilter(f.id); setOffset(0) }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className={styles.search}
          type="search"
          placeholder="Email, name or id"
          value={q}
          onChange={e => { setQ(e.target.value); setOffset(0) }}
        />
      </div>
      <p className={styles.hint}>
        Guests who never entered a room are not listed anywhere — every browser that ever loaded a page is one.
      </p>

      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {data && (
        <>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead>
              <tr>
                <th>Who</th><th>Last seen</th><th>First visit</th>
                <th className={styles.num}>Own lessons</th><th className={styles.num}>Rooms</th><th />
              </tr>
            </thead>
            <tbody>
              {data.users.map(user => (
                <tr key={user.id} className={styles.rowLink} onClick={() => onOpenUser(user.id)}>
                  <td>
                    <div>{user.email ?? <span className={styles.dim}>guest</span>}</div>
                    <div className={styles.mono}>{user.name ? `${user.name} · ` : ''}{shortId(user.id)}</div>
                  </td>
                  <td>{user.online ? 'now' : ago(user.lastSeenAt)}</td>
                  <td>{date(user.createdAt)}</td>
                  <td className={styles.num}>{user.ownedLessons}</td>
                  <td className={styles.num}>{user.joinedRooms}</td>
                  <td>
                    {user.online && <span className={styles.badgeLive}>online</span>}
                    {user.bannedAt && <span className={styles.badgeBanned}>banned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {data.users.length === 0 && <p className={styles.empty}>Nobody here.</p>}
          <Pager offset={offset} shown={data.users.length} total={data.total} onChange={setOffset} />
        </>
      )}
    </section>
  )
}

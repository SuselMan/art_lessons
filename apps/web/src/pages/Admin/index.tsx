import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { ApiError } from '../../lib/api'
import { fetchAdminOverview } from '../../lib/adminApi'
import { NotFound } from '../NotFound'
import { Journal } from './Journal'
import { Lessons } from './Lessons'
import { TABS, type Tab, useAdminNav } from './nav'
import { Overview } from './Overview'
import { UserDetail } from './UserDetail'
import { Users } from './Users'
import styles from './Admin.module.css'

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  users: 'Users',
  lessons: 'Lessons',
  journal: 'Journal',
}

/** (#588) The admin panel. English on purpose, like every internal panel
 *  (ADR 006): one reader, and a dictionary entry per string would be
 *  translations nobody reads.
 *
 *  For everyone who is not an admin it is simply the 404 page — the server
 *  answers 404 on `/api/admin/*` (adminRoutes.ts), and the page mirrors that
 *  rather than announcing that there is something here. */
export function Admin() {
  const nav = useAdminNav()
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: fetchAdminOverview,
    // A live board, not a report: who is in a lesson right now goes stale in
    // seconds. Fifteen is cheap — nine counts and a socket list.
    refetchInterval: 15_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })

  if (overview.error instanceof ApiError && overview.error.status === 404) return <NotFound />
  if (overview.isLoading) return <div className={styles.page} />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/my-lessons" className={styles.brand}>Grafetto</Link>
        <span className={styles.brandTag}>admin</span>
        <nav className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              className={t === nav.tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => nav.openTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        {overview.error && <div className={styles.error}>Failed to load: {String(overview.error)}</div>}
        {nav.tab === 'overview' && overview.data && <Overview data={overview.data} onOpenUser={nav.openUser} />}
        {nav.tab === 'users' && (
          nav.userId
            ? <UserDetail userId={nav.userId} onBack={nav.closeUser} />
            : <Users onOpenUser={nav.openUser} />
        )}
        {nav.tab === 'lessons' && <Lessons onOpenUser={nav.openUser} />}
        {nav.tab === 'journal' && <Journal onOpenUser={nav.openUser} />}
      </main>
    </div>
  )
}

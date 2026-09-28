import { useQuery } from '@tanstack/react-query'

import type { AdminActionRow } from '@grafetto/shared'

import { fetchAdminActions } from '../../lib/api/adminApi'
import { date, shortId } from './format'
import styles from './Admin.module.css'

export function ActionTable({ actions, onOpenUser, onOpenIp }: {
  actions: AdminActionRow[]
  onOpenUser?: (id: string) => void
  onOpenIp?: (ip: string) => void
}) {
  if (actions.length === 0) return <p className={styles.empty}>Nothing yet.</p>
  return (
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
      <tbody>
        {actions.map(action => (
          <tr key={action.id}>
            <td>{date(action.createdAt)}</td>
            <td>{action.adminEmail ?? shortId(action.adminId)}</td>
            <td>
              <span className={action.action === 'ban' || action.action === 'ip_ban' ? styles.badgeBanned : styles.badge}>
                {action.action}
              </span>
            </td>
            <td>
              {action.targetIp && (onOpenIp
                ? <button type="button" className={styles.link} onClick={() => onOpenIp(action.targetIp!)}>{action.targetIp}</button>
                : action.targetIp)}
              {action.targetUserId && (onOpenUser
                ? (
                  <button type="button" className={styles.link} onClick={() => onOpenUser(action.targetUserId!)}>
                    {action.targetEmail ?? shortId(action.targetUserId)}
                  </button>
                )
                : action.targetEmail ?? shortId(action.targetUserId))}
            </td>
            <td>{action.reason ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

export function Journal({ onOpenUser, onOpenIp }: { onOpenUser: (id: string) => void; onOpenIp: (ip: string) => void }) {
  const { data, error } = useQuery({ queryKey: ['admin', 'actions'], queryFn: fetchAdminActions })
  return (
    <section className={styles.section}>
      <p className={styles.hint}>Every ban, unban, IP ban and sign-out-everywhere, newest first. Written in the same transaction as the change itself.</p>
      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {data && <ActionTable actions={data.actions} onOpenUser={onOpenUser} onOpenIp={onOpenIp} />}
    </section>
  )
}

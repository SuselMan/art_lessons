import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AdminIpBan, IpBanDurationHours } from '@grafetto/shared'
import { IP_BAN_DURATIONS_HOURS } from '@grafetto/shared'

import { ApiError } from '../../lib/api/api'
import { banIp, fetchAdminIp, fetchIpBans, unbanIp } from '../../lib/api/adminApi'
import { ago, date, shortId } from './format'
import styles from './Admin.module.css'

const DURATION_LABELS: Record<IpBanDurationHours, string> = {
  1: '1 hour',
  24: '24 hours',
  168: '7 days',
  720: '30 days',
}

const IP_ERRORS: Record<string, string> = {
  reason_required: 'A reason is required.',
  reason_too_long: 'Keep the reason under 500 characters.',
  invalid_duration: 'Pick a duration.',
  invalid_ip: 'Not an address.',
  cannot_ban_own_ip: 'This is the address you are using right now — the ban would lock you out.',
  admin_seen_on_ip: 'An admin has been seen on this address. Banning it would lock them out.',
  not_banned: 'Not banned.',
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.code && IP_ERRORS[err.code]) return IP_ERRORS[err.code]
  return String(err)
}

function BanTable({ bans, onOpenIp }: { bans: AdminIpBan[]; onOpenIp?: (ip: string) => void }) {
  if (bans.length === 0) return <p className={styles.empty}>None.</p>
  return (
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Address</th><th>Reason</th><th>By</th><th>From</th><th>Until</th><th /></tr></thead>
      <tbody>
        {bans.map(ban => (
          <tr key={ban.id}>
            <td>{onOpenIp ? <button type="button" className={styles.link} onClick={() => onOpenIp(ban.ip)}>{ban.ip}</button> : ban.ip}</td>
            <td>{ban.reason}</td>
            <td>{ban.createdByEmail ?? shortId(ban.createdById)}</td>
            <td>{date(ban.createdAt)}</td>
            <td>{date(ban.expiresAt)}</td>
            <td>{ban.liftedAt && <span className={styles.badge}>lifted {date(ban.liftedAt)}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

/** Active IP bans and a lookup box. */
export function Ips({ onOpenIp }: { onOpenIp: (ip: string) => void }) {
  const [lookup, setLookup] = useState('')
  const { data, error } = useQuery({ queryKey: ['admin', 'ip-bans'], queryFn: fetchIpBans })
  return (
    <section className={styles.section}>
      <form
        className={styles.toolbar}
        onSubmit={e => { e.preventDefault(); if (lookup.trim()) onOpenIp(lookup.trim()) }}
      >
        <input className={styles.search} placeholder="Look up an address" value={lookup} onChange={e => setLookup(e.target.value)} />
        <button type="submit" className={styles.button}>Open</button>
      </form>
      <p className={styles.hint}>
        IP bans always end — a single address is often a mobile carrier or a whole school. Addresses are kept for
        90 days after the last visit.
      </p>
      <h3 className={styles.sectionTitle}>Active IP bans</h3>
      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {data && <BanTable bans={data.bans} onOpenIp={onOpenIp} />}
    </section>
  )
}

export function IpDetail({ ip, onBack, onOpenUser }: { ip: string; onBack: () => void; onOpenUser: (id: string) => void }) {
  const queryClient = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['admin', 'ip', ip], queryFn: () => fetchAdminIp(ip) })
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState<IpBanDurationHours>(24)
  const refresh = () => {
    setReason('')
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const ban = useMutation({ mutationFn: () => banIp(ip, reason, hours), onSuccess: refresh })
  const unban = useMutation({ mutationFn: () => unbanIp(ip, reason), onSuccess: refresh })
  const pending = ban.isPending || unban.isPending
  const mutationError = ban.error ?? unban.error

  return (
    <section className={styles.section}>
      <button type="button" className={styles.link} onClick={onBack}>← IP bans</button>
      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {data && (
        <>
          <h2 className={styles.detailTitle}>
            <span className={styles.monoTitle}>{data.ip}</span>
            {data.activeBan && <span className={styles.badgeBanned}>banned</span>}
          </h2>

          <div className={data.activeBan ? `${styles.banBox} ${styles.banBoxActive}` : styles.banBox}>
            {data.activeBan
              ? <p><strong>Banned</strong> until {date(data.activeBan.expiresAt)} — {data.activeBan.reason}</p>
              : <p>Everyone on this address is refused — including people who have nothing to do with the reason. Check the list below first.</p>}
            <textarea
              className={styles.reason}
              rows={2}
              maxLength={500}
              placeholder={data.activeBan ? 'Why lift it (optional)' : 'Why (required, kept in the journal)'}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <div className={styles.toolbar}>
              {data.activeBan
                ? <button type="button" className={styles.button} disabled={pending} onClick={() => unban.mutate()}>Lift ban</button>
                : (
                  <>
                    <div className={styles.segmented}>
                      {IP_BAN_DURATIONS_HOURS.map(h => (
                        <button
                          key={h}
                          type="button"
                          className={h === hours ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
                          onClick={() => setHours(h)}
                        >
                          {DURATION_LABELS[h]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonDanger}`}
                      disabled={pending || !reason.trim()}
                      onClick={() => ban.mutate()}
                    >
                      Ban address
                    </button>
                  </>
                )}
            </div>
            {mutationError && <div className={styles.error}>{errorText(mutationError)}</div>}
          </div>

          <h3 className={styles.sectionTitle}>Seen from this address</h3>
          {data.sightings.length === 0
            ? <p className={styles.empty}>Nobody in the last 90 days.</p>
            : (
              <div className={styles.tableWrap}><table className={styles.table}>
                <thead><tr><th>Who</th><th>Device</th><th>First seen</th><th>Last seen</th><th /></tr></thead>
                <tbody>
                  {data.sightings.map(s => (
                    <tr key={`${s.userId}|${s.deviceId}`} className={styles.rowLink} onClick={() => onOpenUser(s.userId)}>
                      <td>
                        <div>{s.email ?? <span className={styles.dim}>guest</span>}</div>
                        <div className={styles.mono}>{s.name ? `${s.name} · ` : ''}{shortId(s.userId)}</div>
                      </td>
                      <td className={styles.mono}>{shortId(s.deviceId)}</td>
                      <td>{date(s.firstSeenAt)}</td>
                      <td>{ago(s.lastSeenAt)}</td>
                      <td>{s.userBanned && <span className={styles.badgeBanned}>banned</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

          <h3 className={styles.sectionTitle}>Ban history</h3>
          <BanTable bans={data.bans} />
        </>
      )}
    </section>
  )
}

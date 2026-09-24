import type { AdminOverview } from '@grafetto/shared'

import { uptime } from './format'
import styles from './Admin.module.css'

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  )
}

export function Overview({ data, onOpenUser }: { data: AdminOverview; onOpenUser: (id: string) => void }) {
  const { users, lessons, live, server, devices } = data
  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Right now</h2>
        <div className={styles.stats}>
          <Stat label="People online" value={live.people} sub={`${live.sockets} connections`} />
          <Stat label="Lessons live" value={live.lessons.length} />
          <Stat label="Seen last 24 h" value={users.seenLast24h} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>People</h2>
        <div className={styles.stats}>
          <Stat label="Registered" value={users.registered} sub={`+${users.registeredLast24h} today · +${users.registeredLast7d} this week`} />
          <Stat label="Active guests" value={users.activeGuests} sub="no account, joined a room" />
          <Stat label="Banned" value={users.banned} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Lessons</h2>
        <div className={styles.stats}>
          <Stat label="Total" value={lessons.total} sub={`+${lessons.createdLast24h} today · +${lessons.createdLast7d} this week`} />
          <Stat label="Entered last 24 h" value={lessons.activeLast24h} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Devices seen this week</h2>
        {devices.byPlatform.length === 0
          ? <p className={styles.empty}>None yet.</p>
          : (
            <div className={styles.stats}>
              <Stat label="By platform" value={devices.byPlatform.reduce((n, r) => n + r.count, 0)} sub={devices.byPlatform.map(r => `${r.key} ${r.count}`).join(' · ')} />
              <Stat label="By browser" value={devices.byBrowser.length} sub={devices.byBrowser.map(r => `${r.key} ${r.count}`).join(' · ')} />
            </div>
          )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Live lessons</h2>
        {live.lessons.length === 0
          ? <p className={styles.empty}>Nobody is in a lesson.</p>
          : (
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead>
                <tr><th>Lesson</th><th>Owner</th><th>Boards</th><th>In the room</th></tr>
              </thead>
              <tbody>
                {live.lessons.map(lesson => (
                  <tr key={lesson.lessonId}>
                    <td>
                      <div>{lesson.name}</div>
                      <div className={styles.mono}>{lesson.lessonId}</div>
                    </td>
                    <td>
                      <button type="button" className={styles.link} onClick={() => onOpenUser(lesson.ownerId)}>
                        {lesson.ownerEmail ?? 'guest'}
                      </button>
                    </td>
                    <td className={styles.num}>{lesson.boards}</td>
                    <td>
                      {lesson.participants.map(p => (
                        <button key={p.userId} type="button" className={styles.chip} onClick={() => onOpenUser(p.userId)}>
                          {p.name}{p.role === 'owner' ? ' ★' : ''}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Server</h2>
        <div className={styles.stats}>
          <Stat label="Uptime" value={uptime(server.uptimeSeconds)} />
          <Stat label="Heap" value={`${server.heapUsedMb} MB`} sub={`of ${server.heapLimitMb} MB · RSS ${server.rssMb} MB`} />
          <Stat label="Rooms in memory" value={server.residentRooms} sub={`${server.residentOperations} operations`} />
          <Stat
            label="Disk"
            value={server.diskUsedPct === null ? '—' : `${server.diskUsedPct}%`}
            sub={server.diskFreeGb === null ? undefined : `${server.diskFreeGb} GB free`}
          />
        </div>
      </section>
    </>
  )
}

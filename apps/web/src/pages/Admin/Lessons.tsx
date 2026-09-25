import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { adminLessonThumbnailUrl, fetchAdminLessons } from '../../lib/adminApi'
import { Pager } from './Pager'
import { ago, date } from './format'
import styles from './Admin.module.css'

/** A picture of each lesson and nothing more — there is deliberately no way
 *  into the room from here (see the thumbnail route in adminRoutes.ts). */
export function Lessons({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error } = useQuery({
    queryKey: ['admin', 'lessons', q, offset],
    queryFn: () => fetchAdminLessons(q, offset),
    placeholderData: keepPreviousData,
  })

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder="Lesson name, id or owner email"
          value={q}
          onChange={e => { setQ(e.target.value); setOffset(0) }}
        />
      </div>

      {error && <div className={styles.error}>Failed to load: {String(error)}</div>}
      {data && (
        <>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead>
              <tr>
                <th /><th>Lesson</th><th>Owner</th>
                <th className={styles.num}>People</th><th className={styles.num}>Boards</th><th className={styles.num}>Operations</th>
                <th>Last entered</th><th>Created</th><th />
              </tr>
            </thead>
            <tbody>
              {data.lessons.map(lesson => (
                <tr key={lesson.id}>
                  <td className={styles.thumbCell}>
                    {lesson.hasThumbnail && <img className={styles.thumb} src={adminLessonThumbnailUrl(lesson.id)} alt="" loading="lazy" />}
                  </td>
                  <td><div>{lesson.name}</div><div className={styles.mono}>{lesson.id}</div></td>
                  <td>
                    <button type="button" className={styles.link} onClick={() => onOpenUser(lesson.ownerId)}>
                      {lesson.ownerEmail ?? 'guest'}
                    </button>
                  </td>
                  <td className={styles.num}>{lesson.participants}</td>
                  <td className={styles.num}>{lesson.boards}</td>
                  <td className={styles.num}>{lesson.operations}</td>
                  <td>{ago(lesson.lastActiveAt)}</td>
                  <td>{date(lesson.createdAt)}</td>
                  <td>
                    {lesson.live && <span className={styles.badgeLive}>live</span>}
                    {lesson.closedAt && <span className={styles.badge}>closed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {data.lessons.length === 0 && <p className={styles.empty}>No lessons.</p>}
          <Pager offset={offset} shown={data.lessons.length} total={data.total} onChange={setOffset} />
        </>
      )}
    </section>
  )
}

import styles from './Admin.module.css'

/** The server pages by 50 (adminRoutes.ts PAGE_SIZE); the pager only needs
 *  to know where it is and how many exist. */
const PAGE_SIZE = 50

export function Pager({ offset, shown, total, onChange }: {
  offset: number
  shown: number
  total: number
  onChange: (offset: number) => void
}) {
  if (total <= PAGE_SIZE) return <p className={styles.hint}>{total} total</p>
  return (
    <div className={styles.pager}>
      <button type="button" className={styles.button} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>
        ← Prev
      </button>
      <span className={styles.hint}>{offset + 1}–{offset + shown} of {total}</span>
      <button type="button" className={styles.button} disabled={offset + shown >= total} onClick={() => onChange(offset + PAGE_SIZE)}>
        Next →
      </button>
    </div>
  )
}

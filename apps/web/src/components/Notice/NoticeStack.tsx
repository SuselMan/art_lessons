import { dismissNotice, useNoticeStore, type Notice as NoticeData } from '../../stores/noticeStore'
import { Notice } from './Notice'
import styles from './NoticeStack.module.css'

function renderNotice(notice: NoticeData): React.JSX.Element {
  return (
    <Notice
      key={notice.id}
      variant={notice.variant}
      message={notice.message}
      icon={notice.icon}
      action={notice.action}
      onDismiss={notice.dismissible ? () => dismissNotice(notice.id) : undefined}
      // Pushed notices always report something that just happened and is not
      // visible anywhere else on screen, so they are announced. An error is
      // interrupting by nature; the rest can wait for a pause.
      role={notice.variant === 'error' ? 'alert' : 'status'}
    />
  )
}

/** (#343) The viewport-fixed layer for pushed notices — the half of the
 *  system whose lifetime is a timer rather than a condition.
 *
 *  Mounted once in `App`, above the router: a notice pushed from a mutation
 *  on one page has to survive navigating away from it, which is also why the
 *  store behind it is not `roomStore`.
 *
 *  Renders nothing at all when empty, rather than an empty fixed container —
 *  these sit above every dialog (`--z-notice`), and an invisible full-width
 *  element parked over the page is how a stray click target appears. */
export function NoticeStack(): React.JSX.Element | null {
  const notices = useNoticeStore(state => state.notices)
  if (notices.length === 0) return null

  const top = notices.filter(n => n.position === 'top')
  const bottom = notices.filter(n => n.position === 'bottom')

  return (
    <>
      {top.length > 0 && (
        <div className={`${styles.layer} ${styles.top}`}>{top.map(renderNotice)}</div>
      )}
      {bottom.length > 0 && (
        <div className={`${styles.layer} ${styles.bottom}`}>{bottom.map(renderNotice)}</div>
      )}
    </>
  )
}

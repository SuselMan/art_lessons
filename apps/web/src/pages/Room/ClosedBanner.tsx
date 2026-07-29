import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import styles from './ClosedBanner.module.css'

interface ClosedBannerProps {
  isOwner: boolean
  busy: boolean
  // Reopen the room (owner) — the way back out of a state that otherwise
  // requires leaving for the lesson list to undo.
  onReopen: () => void
  // Fork it into a copy of one's own (everyone else) — the student half of
  // the homework model (#317, release track #314 §4).
  onTakeCopy: () => void
}

/** Shown to everyone in a room closed for editing (#222). Two different
 *  people meet this banner and want opposite things from it: the teacher who
 *  closed the lesson and now wants to correct something, and the student who
 *  opened the link and wants their own copy to work in. Both are one button
 *  away, which is why this isn't just an indicator.
 *
 *  Unlike FrozenBanner this is shown to the owner too — closing binds them
 *  as well (see rooms.ts's getOperationRejectReason), so an owner who saw no
 *  explanation would meet a canvas that simply ignores the pencil. */
export function ClosedBanner({ isOwner, busy, onReopen, onTakeCopy }: ClosedBannerProps): React.JSX.Element {
  const t = useT()
  return (
    <div className={styles.banner}>
      <Icon name="lock" />
      <span>{t(isOwner ? 'room.closedOwner' : 'room.closedMember')}</span>
      <button
        type="button"
        className={styles.action}
        onClick={isOwner ? onReopen : onTakeCopy}
        disabled={busy}
      >
        {busy ? t('common.working') : t(isOwner ? 'room.reopen' : 'room.takeCopy')}
      </button>
    </div>
  )
}

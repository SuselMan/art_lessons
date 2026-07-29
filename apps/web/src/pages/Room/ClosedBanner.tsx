import { useT } from '../../i18n'
import { Notice } from '../../components/Notice'

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
 *  explanation would meet a canvas that simply ignores the pencil.
 *
 *  (#343) `neutral`, not a warning: a closed lesson is its normal state once
 *  handed out, and colouring it as a problem would misreport what happened.
 *  Its button is also the only route to reopening or forking without leaving
 *  the room, so this is the clearest case in the app of a strip that must not
 *  be allowed to time out. */
export function ClosedBanner({ isOwner, busy, onReopen, onTakeCopy }: ClosedBannerProps): React.JSX.Element {
  const t = useT()
  return (
    <Notice
      variant="neutral"
      icon="lock"
      message={t(isOwner ? 'room.closedOwner' : 'room.closedMember')}
      action={{
        label: busy ? t('common.working') : t(isOwner ? 'room.reopen' : 'room.takeCopy'),
        onClick: isOwner ? onReopen : onTakeCopy,
        disabled: busy,
      }}
    />
  )
}

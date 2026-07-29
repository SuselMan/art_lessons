import { useT } from '../../i18n'
import { Notice } from '../../components/Notice'

interface FrozenBannerProps {
  // Room-wide freeze (#256) vs. this participant's own point freeze (#257)
  // read slightly differently ("everyone" vs. "you specifically") — both
  // can be true at once (independent mechanisms, see rooms.ts), in which
  // case the room-wide message wins since it's the more complete
  // explanation.
  roomFrozen: boolean
}

/** Shown to a non-owner participant whenever their own input is blocked by
 *  an owner privilege (#254/#259) — room-wide freeze (#256) or a point
 *  freeze targeting them specifically (#257). A silently-inert canvas would
 *  read as broken ("why isn't my pencil working"); this explains *why* in
 *  place, without the full-viewport takeover RoomLoadingOverlay uses (input
 *  is blocked here, not the whole room's content).
 *
 *  (#343) Derived, not pushed: it is visible exactly while the freeze is on,
 *  so the freeze flag is its whole lifetime. Nothing to dismiss and no timer —
 *  a countdown here would hide the explanation while the pencil is still
 *  dead. Position comes from the room's own top column; the strip itself is
 *  the shared `Notice`. */
export function FrozenBanner({ roomFrozen }: FrozenBannerProps): React.JSX.Element {
  const t = useT()
  return (
    <Notice
      variant="warning"
      icon="ac_unit"
      message={t(roomFrozen ? 'room.frozenEveryone' : 'room.frozenYou')}
    />
  )
}

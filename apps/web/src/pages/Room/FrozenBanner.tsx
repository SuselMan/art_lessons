import { Icon } from '../../components/Icon'
import styles from './FrozenBanner.module.css'

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
 *  is blocked here, not the whole room's content). */
export function FrozenBanner({ roomFrozen }: FrozenBannerProps): React.JSX.Element {
  return (
    <div className={styles.banner}>
      <Icon name="ac_unit" />
      <span>
        {roomFrozen
          ? 'The room owner has paused drawing for everyone.'
          : 'The room owner has paused your drawing.'}
      </span>
    </div>
  )
}

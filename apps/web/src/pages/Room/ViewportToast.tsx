import { useT } from '../../i18n'
import { Notice } from '../../components/Notice'
import styles from './ViewportToast.module.css'

interface ViewportToastProps {
  /** Already resolved to what the header would display — for infinite rooms
   *  that is relative to the device-native scale, not to `vp.zoom` itself. The
   *  toast must never disagree with the readout it stands in for. */
  zoomPercent: number
  /** Normalized 0–359, same as the header's readout. Signed degrees would read
   *  closer to the gesture just made, but then the same rotation would be
   *  "-15°" here and "345°" one tap later in the header. */
  angleDeg: number
  onReset: () => void
}

/** #362: the zoom/rotation readout for minimal UI, where the header carrying
 *  both numbers is faded out and a two-finger gesture would otherwise change
 *  them with no feedback at all and no way back short of showing the chrome.
 *
 *  Both values in one strip, not two: a pinch almost always turns the canvas a
 *  little as well, so separate indicators would mean two strips per gesture
 *  reporting one gesture. The reset likewise covers both, and resets exactly
 *  the two numbers shown — the pan is left where it is, so nobody loses the
 *  spot they were drawing on (unlike "fit canvas", which also re-centres).
 *
 *  Rendered through `Notice` rather than as a fifth hand-rolled strip: that is
 *  the whole point of #343, and the geometry a floating strip over the canvas
 *  needs (pointer-events off except where there's a button, shadow, surface
 *  treatment) is already solved there and had already drifted four ways once. */
export function ViewportToast({ zoomPercent, angleDeg, onReset }: ViewportToastProps): React.JSX.Element {
  const t = useT()

  return (
    <Notice
      variant="neutral"
      icon="pinch"
      // No `role`: these two numbers are a live duplicate of the header's own
      // readouts, and announcing them politely on every gesture would narrate
      // a pinch digit by digit for no gain (Notice's own guidance on when to
      // leave the role off).
      message={
        <span className={styles.values}>
          <span className={styles.value}>{zoomPercent}%</span>
          <span className={styles.separator} aria-hidden="true">·</span>
          <span className={styles.value}>{angleDeg}°</span>
        </span>
      }
      action={{ label: t('room.viewportReset'), onClick: onReset }}
    />
  )
}

import { useEffect, useState } from 'react'

import styles from './RoomLoadingOverlay.module.css'

// Rotating flavor text for the room-load preloader (#185) — loading a room
// (paper texture + snapshot fetch + operation-log replay/backfill, see
// roomContentReady's own doc comment in Room/index.tsx) is consistently the
// app's single longest wait, so it gets a themed preloader instead of a bare
// "Loading...". We have no reliable sub-step progress to report (just one
// "not ready yet" boolean), so this cycles on a timer rather than tracking
// real progress — order doesn't matter.
const MESSAGES = [
  'Sharpening pencil...',
  'Gluing paper to canvas...',
  'Arranging layers...',
  'Mixing graphite...',
  'Setting up easel...',
  'Dusting off eraser...',
  'Unrolling paper...',
  'Sorting pencils by grade...',
]

const MESSAGE_INTERVAL_MS = 1800

/** Covers the whole viewport while `roomContentReady` is false (see
 *  Room/index.tsx) — a spinner for now, a themed animation is a later,
 *  separate visual-polish task (#185). Rendered as a direct child of
 *  `.viewport`, not `.canvasWrap`, so it never pans/zooms/rotates with the
 *  canvas underneath it. */
export function RoomLoadingOverlay(): React.JSX.Element {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIndex(i => (i + 1) % MESSAGES.length), MESSAGE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className={styles.overlay}>
      <div className={styles.spinner} />
      <div className={styles.message}>{MESSAGES[index]}</div>
    </div>
  )
}

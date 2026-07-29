import { useEffect, useState } from 'react'

import type { PaperLoadProgress } from '../../engine/src/paperLoader'
import { useT, type TranslationKey } from '../../i18n'
import styles from './RoomLoadingOverlay.module.css'

// Rotating flavor text for the room-load preloader (#185) — loading a room
// (paper texture + snapshot fetch + operation-log replay/backfill, see
// roomContentReady's own doc comment in Room/index.tsx) is consistently the
// app's single longest wait, so it gets a themed preloader instead of a bare
// "Loading...". We have no reliable sub-step progress to report (just one
// "not ready yet" boolean), so this cycles on a timer rather than tracking
// real progress — order doesn't matter.
const MESSAGE_KEYS: readonly TranslationKey[] = [
  'room.loading.1',
  'room.loading.2',
  'room.loading.3',
  'room.loading.4',
  'room.loading.5',
  'room.loading.6',
  'room.loading.7',
  'room.loading.8',
]

const MESSAGE_INTERVAL_MS = 1800

const MIB = 1024 * 1024

/** Covers the whole viewport while `roomContentReady` is false (see
 *  Room/index.tsx) — a spinner for now, a themed animation is a later,
 *  separate visual-polish task (#185). Rendered as a direct child of
 *  `.viewport`, not `.canvasWrap`, so it never pans/zooms/rotates with the
 *  canvas underneath it.
 *
 *  (#345) `paper` turns the one honestly-measurable part of the wait into a
 *  real bar. Room loading has two phases and only the first has a denominator:
 *  the paper texture is a single ~7.4 MB file whose exact size is known from
 *  the manifest before the request goes out, while the snapshot + operation-log
 *  replay that follows has no size known up front and no meaningful unit to
 *  count. Rather than invent a fake unified percentage, this shows the real
 *  number while it exists and falls back to the rotating flavour text after.
 *
 *  Null `paper` is the normal case once the prefetch is doing its job: the
 *  texture was already downloaded before the room opened, so no progress is
 *  ever emitted and the overlay looks exactly as it did before this change. */
export function RoomLoadingOverlay({ paper }: { paper?: PaperLoadProgress | null }): React.JSX.Element {
  const t = useT()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIndex(i => (i + 1) % MESSAGE_KEYS.length), MESSAGE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  // `done` deliberately drops back to the flavour text: the download is over
  // but the room is not ready, and leaving a full bar on screen would read as
  // "finished, why is it still here".
  const downloading = paper && !paper.done && paper.total > 0
  const percent = downloading ? Math.min(100, Math.round((paper.loaded / paper.total) * 100)) : 0

  return (
    <div className={styles.overlay}>
      <div className={styles.spinner} />
      {downloading ? (
        <>
          <div className={styles.message}>{t('room.loading.paper')}</div>
          {/* aria-valuenow rather than an aria-live region: a value that
              changes on every network chunk would make a screen reader talk
              over itself for the whole download. */}
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('room.loading.paper')}
          >
            <div className={styles.progressBar} style={{ width: `${percent}%` }} />
          </div>
          <div className={styles.progressLabel}>
            {(paper.loaded / MIB).toFixed(1)} / {(paper.total / MIB).toFixed(1)} MB
          </div>
        </>
      ) : (
        <div className={styles.message}>{t(MESSAGE_KEYS[index])}</div>
      )}
    </div>
  )
}

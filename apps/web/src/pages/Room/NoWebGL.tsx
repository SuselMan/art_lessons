import { Link } from 'react-router-dom'

import { useT } from '../../i18n'
import { Logo } from '../../components/Logo'
import styles from './Room.module.css'

// (#570) Shown in place of the editor when this browser cannot give us a
// WebGL context (see lib/webgl.ts). Same card as JoinGate: the reader is in
// the same position as a student on a room link — this page and nothing
// else — so it borrows that screen's language rather than inventing one.

interface NoWebGLProps {
  /** The browser's own diagnostics, if it gave any — small print under the
   *  advice, for whoever is asked "what does it say". */
  reason: string | null
}

export function NoWebGL({ reason }: NoWebGLProps) {
  const t = useT()

  return (
    <div className={styles.gatePage}>
      <Link className={styles.gateLogo} to="/" aria-label="Grafetto"><Logo /></Link>

      <div className={styles.gateCard} role="alert">
        <h1 className={styles.gateHeading}>{t('webgl.heading')}</h1>
        <p className={styles.gateNote}>{t('webgl.body')}</p>

        {/* The three things that actually fix it, in the order they are
            worth trying. A restart clears the by-far-most-common case — a
            browser that lost its GPU process (crash, or an update installed
            underneath it) and quietly switched acceleration off. */}
        <ul className={styles.gateList}>
          <li>{t('webgl.hint.restart')}</li>
          <li>{t('webgl.hint.acceleration')}</li>
          <li>{t('webgl.hint.otherBrowser')}</li>
        </ul>

        {/* A plain reload, not a re-probe in place: the fixes above all
            happen outside this tab, and a fresh load is what picks them up. */}
        <button type="button" className={styles.gateSubmit} onClick={() => window.location.reload()}>
          {t('webgl.retry')}
        </button>

        {reason && <p className={styles.gateDetails}>{reason}</p>}
      </div>
    </div>
  )
}

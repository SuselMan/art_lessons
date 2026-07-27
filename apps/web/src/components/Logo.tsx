import logoUrl from '../assets/logo.svg'

import styles from './Logo.module.css'

/** The Grafetto wordmark, used wherever the app names itself — auth, room
 *  list, create-room, settings, join gate.
 *
 *  Unlike `Icon`, this is an <img> rather than an inlined SVG: the mark has
 *  its own fixed brand colors (cream wordmark, purple glyph) and is not
 *  supposed to follow `currentColor` the way an icon does. It assumes the
 *  dark surface from `styles/tokens.css` — the wordmark is cream-on-dark by
 *  design, so a light theme (if one ever lands) needs a second asset, not a
 *  CSS override.
 *
 *  Size comes from the call site: the wrapper sets a height, the image fills
 *  it and keeps its own aspect ratio. */
export function Logo() {
  return <img src={logoUrl} className={styles.mark} alt="Grafetto" />
}

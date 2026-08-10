import logoSvg from '../assets/logo.svg?raw'

import styles from './Logo.module.css'

/** The Grafetto wordmark, used wherever the app names itself — auth, room
 *  list, create-room, settings, join gate.
 *
 *  (#426) Inlined rather than an <img src>, which is what it used to be. The
 *  comment here previously argued that the mark has fixed brand colors and
 *  that a light theme would therefore need a second asset — that was half
 *  right, and the wrong half is the expensive one. The glyph's purple is a
 *  brand color and stays a literal in the file; the wordmark's cream was never
 *  a brand color, it was "light, because the background is dark", and as an
 *  <img> it had no way to find out that the background had changed. It is
 *  `currentColor` in the SVG now, so the wordmark follows the surface it is
 *  drawn on and there is still exactly one asset to keep in step.
 *
 *  Inlining is also the house pattern rather than a new one — `Icon` reads its
 *  custom glyphs the same way, via `?raw` and the same requirement that they
 *  use currentColor.
 *
 *  Size comes from the call site: the wrapper sets a height, and the SVG fills
 *  it while keeping its own aspect ratio. `role="img"` plus the label replaces
 *  the `alt` the <img> carried. */
export function Logo() {
  return (
    <span
      className={styles.mark}
      role="img"
      aria-label="Grafetto"
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  )
}

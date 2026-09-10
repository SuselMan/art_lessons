import { forwardRef } from 'react'
import clsx from 'clsx'

import { rgbToHex } from '../../lib/color'
import styles from './ColorWell.module.css'

// (#542) The one glyph this app shows a tool's colour with, everywhere it
// shows one: the pinned well at the top of the tool rail, the centre of the
// floating panel, and the two swatches inside the colour flyout itself.
//
// Before this there were three shapes for the same fact — SettingField's
// 22px toolbar swatch, ShapeColorPair's two stacked circles, and the floating
// panel's own 32px dot — and adding a fourth colour-carrying tool would have
// added a fourth. One component, one look, any size.
//
// **A shape's two colours are one circle, not two.** The ring is the stroke,
// the core is the fill. The mapping is literal: the colour of an outline is
// drawn as an outline, the colour of an inside is drawn as the inside, so
// there is nothing to learn. A one-colour tool passes no `stroke` at all and
// the ring collapses to the plain 1px border every swatch in this app already
// had, which is why nothing about the single-colour case changes visually.
//
// **The ring is an indicator, not a target.** It is 7-8px wide at the sizes
// used here, which is not something a finger picks out, and the floating panel
// is a touch-first surface. So the whole glyph is one button: pressing it
// opens the surface where stroke and fill can be told apart at full size.
// Nothing here is ever hit by aiming at a band.

interface ColorWellProps {
  /** The core's colour, i.e. the only colour of an ordinary tool or a shape's
   *  fill. `null` draws "no colour" — a white core struck through in red. */
  fill: [number, number, number] | null
  /** The ring's colour, for a tool that carries two. Omit entirely for the
   *  tools that carry one: the ring then renders as a plain border rather than
   *  as a second colour that happens to match the chrome. `null` is a third
   *  thing again — a ring that is deliberately switched off. */
  stroke?: [number, number, number] | null
  /** Which part is the one the palette and the picker are pointed at, drawn as
   *  an accent ring around that part. Null on a glyph that is only reporting a
   *  colour rather than offering a choice between two. */
  highlight?: 'outer' | 'core' | null
  /** Outer diameter in px. The ring's width follows it, so one number sizes
   *  the whole glyph — 40 in the rail, 44 in the floating panel (matching its
   *  own slots), 44 again inside the flyout. */
  size?: number
  label: string
  title?: string
  className?: string
  onClick?: () => void
  /** Marks the glyph as controlling an open surface, for the trigger case. */
  expanded?: boolean
}

/** Fraction of the diameter the ring band takes when there are two colours.
 *  At 44px it gives an 8px band around a 28px core: the band is wide enough to
 *  read a hue off at arm's length, and the core stays the bigger of the two,
 *  which is right — the fill is the larger area on the drawing too. */
const RING_RATIO = 0.18

export const ColorWell = forwardRef<HTMLButtonElement, ColorWellProps>(function ColorWell({
  fill, stroke, highlight = null, size = 40, label, title, className, onClick, expanded,
}, ref) {
  // `undefined` (a one-colour tool) and `null` (a ring switched off) are
  // different states and only the first collapses the band.
  const twoColour = stroke !== undefined
  const ring = twoColour ? Math.round(size * RING_RATIO) : 0

  return (
    <button
      ref={ref}
      type="button"
      className={clsx(styles.well, highlight === 'outer' && styles.wellActive, className)}
      style={{
        width: size,
        height: size,
        // White under a switched-off ring for the same reason the core does it:
        // "nothing here" and "white paint" have to look different, and only the
        // red diagonal below tells them apart.
        background: twoColour ? (stroke ? rgbToHex(stroke) : '#fff') : undefined,
      }}
      title={title ?? label}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {/* Drawn before the core and covered by it, so what survives is two
          diagonal segments inside the band — a struck-through ring rather than
          a line across the whole glyph, which would read as the shape being
          off rather than its outline. */}
      {twoColour && stroke === null && <span className={styles.none} aria-hidden="true" />}
      <span
        className={clsx(styles.core, highlight === 'core' && styles.coreActive)}
        style={{ inset: ring, background: fill ? rgbToHex(fill) : '#fff' }}
        aria-hidden="true"
      >
        {fill === null && <span className={styles.none} />}
      </span>
    </button>
  )
})

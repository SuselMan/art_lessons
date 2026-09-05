import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import { rgbToHex } from '../../lib/color'
import styles from './ShapeColorPair.module.css'

// (#529) A shape carries two colours — stroke and fill — and either can be
// off. Every other tool in this app has exactly one colour, so this is the
// first control that has to answer "which colour am I editing?" before the
// palette, the picker and the eyedropper can do anything at all.
//
// Two circles and a swap, the way Ilya described it (05.09) and the way every
// drawing program has done it since Illustrator: the pair is one control, not
// two independent swatches, because the operations that matter are "use this
// one now" and "trade them", and both are one gesture here.
//
// "No colour" is drawn rather than labelled: a white circle struck through in
// red. A checkbox reading "stroke: off" would be the same state in twice the
// space, and would not be recognizable to anyone coming from another editor.

export type ShapeSwatchSide = 'stroke' | 'fill'

interface ShapeColorPairProps {
  strokeColor: [number, number, number]
  strokeOn: boolean
  /** Null for a tool with no fill at all — the line, which has no inside. The
   *  swap and the fill circle disappear with it rather than sitting there
   *  inert. */
  fillColor: [number, number, number] | null
  fillOn: boolean
  /** Which of the two the palette and the picker are pointed at. */
  active: ShapeSwatchSide
  onSelect: (side: ShapeSwatchSide) => void
  /** Turns the *active* swatch's colour off, or back on. */
  onToggleActive: () => void
  onSwap: () => void
  /** Opens the full colour surface for the active swatch — same intent
   *  SettingField's swatch reports. */
  onExpand: () => void
}

export function ShapeColorPair({
  strokeColor, strokeOn, fillColor, fillOn, active, onSelect, onToggleActive, onSwap, onExpand,
}: ShapeColorPairProps) {
  const t = useT()
  const activeOn = active === 'stroke' ? strokeOn : fillOn

  const circle = (side: ShapeSwatchSide, color: [number, number, number], on: boolean) => {
    const label = t(side === 'stroke' ? 'room.shape.stroke' : 'room.shape.fill')
    return (
      <button
        className={`${styles.swatch} ${active === side ? styles.swatchActive : ''}`}
        // An empty swatch is white with a red diagonal, so it reads as
        // "nothing here" rather than as "white paint" — which is exactly what
        // a white circle on its own would mean, and the two are opposite
        // instructions to the rasterizer.
        style={{ background: on ? rgbToHex(color) : '#fff' }}
        title={on ? label : `${label} — ${t('room.shape.none')}`}
        aria-label={on ? label : `${label} — ${t('room.shape.none')}`}
        aria-pressed={active === side}
        // A press on the swatch already in hand opens the full colour surface;
        // a press on the other one just points everything at it. Selecting and
        // editing are different intentions, and the first press is almost
        // always the first of those.
        onClick={() => (active === side ? onExpand() : onSelect(side))}
      >
        {!on && <span className={styles.none} aria-hidden="true" />}
      </button>
    )
  }

  return (
    <div className={styles.pair}>
      {circle('stroke', strokeColor, strokeOn)}
      {fillColor && circle('fill', fillColor, fillOn)}
      <div className={styles.actions}>
        {fillColor && (
          <button
            className={styles.action}
            title={t('room.shape.swap')}
            aria-label={t('room.shape.swap')}
            onClick={onSwap}
          ><Icon name="swap_horiz" /></button>
        )}
        <button
          className={styles.action}
          title={t('room.shape.none')}
          aria-label={t('room.shape.none')}
          aria-pressed={!activeOn}
          onClick={onToggleActive}
        ><Icon name="block" /></button>
      </div>
    </div>
  )
}

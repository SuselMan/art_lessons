import { createPortal } from 'react-dom'

import { useT } from '../../i18n'
import { usePopupAnchor } from '../../lib/usePopupAnchor'
import { Icon } from '../Icon'
import { ColorPicker } from '../ColorPicker'
import { ColorWell } from '../ColorWell'
import { PaletteBar } from '../PaletteBar'
import type { ColorPickerMode } from '../ColorPicker/pickerModes'
import styles from './ColorFlyout.module.css'

// (#542) The single surface for choosing a colour. Before this the same job was
// spread over three: the side panel's Color tab, the floating panel's radial
// fan, and the palette bar living inside that tab — so "give the liner the red
// the marker has" meant one route with the chrome up and a different one with
// it down.
//
// Now it is one component in two *presentations*, which is a different thing
// from two places. Both are always available, the way every desktop paint
// editor offers both, because they answer different questions:
//
//   - `ColorFlyout` — a popover hanging off whichever well was pressed. Right
//     for a decision: pick a colour, get back to the drawing. Reachable from
//     anywhere, including minimal UI, where there is no panel at all.
//   - `ColorFlyoutBody` in the side panel's Color tab, always there. Right for
//     a process: stroke, nudge the colour, stroke again. That loop is where a
//     popover falls apart, because every nudge costs open-and-close and the
//     canvas is hidden while it is up — and on the watercolour it hides the
//     Water and Pigment sliders too, which are the other half of the same act
//     of mixing.
//
// Neither is a mode and there is nothing to configure: the tab is simply there
// for anyone who wants to work in it, and the well behaves the same either way
// (Ilya, 10.09 — an earlier version made this a pinned preference, which was a
// setting standing in for "both", and both is the answer).
//
// The stroke/fill row only exists for a tool that carries two colours (the
// shapes, #529). It is at the top because it decides what everything below it
// acts on, and it is drawn with the same ColorWell glyph the trigger uses, at
// a size a finger can tell apart — which is the whole reason the trigger
// itself does not try to be two targets.

export type ColorSwatchSide = 'stroke' | 'fill'

/** The two-colour half of this surface. Absent for every tool that carries one
 *  colour, which is all of them but the shapes. */
export interface ColorPairControls {
  strokeColor: [number, number, number]
  strokeOn: boolean
  /** Null for a shape with no inside at all — the line. The fill well and the
   *  swap disappear with it rather than sitting there inert. */
  fillColor: [number, number, number] | null
  fillOn: boolean
  active: ColorSwatchSide
  onSelect: (side: ColorSwatchSide) => void
  /** Trades the two colours themselves, not which one is selected — what X
   *  does in every other editor. */
  onSwap: () => void
  /** Turns the *active* colour off, or back on. */
  onToggleActive: () => void
}

export interface ColorFlyoutContent {
  /** The colour being edited — the tool's own, or the shape's active one. */
  value: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
  mode: ColorPickerMode
  onModeChange: (mode: ColorPickerMode) => void
  palette: string[]
  onAddPaletteColor: (color: string) => void
  onRemovePaletteColor: (color: string) => void
  pair?: ColorPairControls
}

/** The surface itself, with no opinion on where it is drawn. Rendered directly
 *  by the side panel's Color tab, and by the popover below. */
export function ColorFlyoutBody({
  value, onChange, mode, onModeChange, palette, onAddPaletteColor, onRemovePaletteColor, pair,
}: ColorFlyoutContent) {
  const t = useT()
  const activeOn = pair ? (pair.active === 'stroke' ? pair.strokeOn : pair.fillOn) : true

  return (
    <>
      {pair && (
        <div className={styles.pair}>
          <ColorWell
            fill={pair.strokeOn ? pair.strokeColor : null}
            highlight={pair.active === 'stroke' ? 'outer' : null}
            size={44}
            label={t('room.shape.stroke')}
            onClick={() => pair.onSelect('stroke')}
          />
          {pair.fillColor && (
            <button
              type="button"
              className={styles.swap}
              title={t('room.shape.swap')}
              aria-label={t('room.shape.swap')}
              onClick={pair.onSwap}
            ><Icon name="swap_horiz" /></button>
          )}
          {pair.fillColor && (
            <ColorWell
              fill={pair.fillOn ? pair.fillColor : null}
              highlight={pair.active === 'fill' ? 'outer' : null}
              size={44}
              label={t('room.shape.fill')}
              onClick={() => pair.onSelect('fill')}
            />
          )}
          <button
            type="button"
            className={styles.none}
            title={t('room.shape.none')}
            aria-label={t('room.shape.none')}
            aria-pressed={!activeOn}
            onClick={pair.onToggleActive}
          ><Icon name="block" /></button>
        </div>
      )}
      <ColorPicker value={value} onChange={onChange} mode={mode} onModeChange={onModeChange} />
      <PaletteBar
        palette={palette}
        value={value}
        onSelect={onChange}
        onAdd={onAddPaletteColor}
        onRemove={onRemovePaletteColor}
      />
    </>
  )
}

interface ColorFlyoutProps extends ColorFlyoutContent {
  open: boolean
  onDismiss: () => void
  /** The well the popover hangs off. Held by the caller because there is more
   *  than one and which is in play changes at the moment of opening. */
  anchorRef: React.RefObject<HTMLElement | null>
}

export function ColorFlyout({ open, onDismiss, anchorRef, ...content }: ColorFlyoutProps) {
  const t = useT()
  const { popupRef, style } = usePopupAnchor<HTMLElement, HTMLDivElement>(open, onDismiss, {
    // Beside the well, never under it. Both wells this hangs off sit inside
    // something worth keeping in view while a colour is being chosen — the
    // tool rail, and the floating panel's own ring of slots — and a popup this
    // tall dropped below either of them covers it whole.
    placement: 'right',
    triggerRef: anchorRef,
    // The stroke/fill row appears and disappears with the tool, and the
    // palette grows as colours are saved from inside this very popover — both
    // change its height while it stays open.
    remeasureKey: `${content.pair ? 'pair' : 'one'}:${content.palette.length}`,
  })

  if (!open) return null

  return createPortal(
    <div ref={popupRef} className={styles.flyout} style={style} role="dialog" aria-label={t('room.panel.color')}>
      <ColorFlyoutBody {...content} />
    </div>,
    document.body,
  )
}

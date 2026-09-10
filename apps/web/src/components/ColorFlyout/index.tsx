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
// it down. Here the picker and the palette are one popover, and it hangs off
// whichever well was pressed: the one pinned in the tool rail, or the one in
// the middle of the floating panel. One component, two anchors.
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

interface ColorFlyoutProps {
  open: boolean
  onDismiss: () => void
  /** The well the popover hangs off. Held by the caller because there is more
   *  than one and which is in play changes at the moment of opening. */
  anchorRef: React.RefObject<HTMLElement | null>
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

export function ColorFlyout({
  open, onDismiss, anchorRef, value, onChange, mode, onModeChange,
  palette, onAddPaletteColor, onRemovePaletteColor, pair,
}: ColorFlyoutProps) {
  const t = useT()
  const { popupRef, style } = usePopupAnchor<HTMLElement, HTMLDivElement>(open, onDismiss, {
    align: 'left',
    triggerRef: anchorRef,
    // The stroke/fill row appears and disappears with the tool, and the
    // palette grows as colours are saved from inside this very popover — both
    // change its height while it stays open.
    remeasureKey: `${pair ? 'pair' : 'one'}:${palette.length}`,
  })

  if (!open) return null

  const activeOn = pair ? (pair.active === 'stroke' ? pair.strokeOn : pair.fillOn) : true

  return createPortal(
    <div ref={popupRef} className={styles.flyout} style={style} role="dialog" aria-label={t('room.panel.color')}>
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
    </div>,
    document.body,
  )
}

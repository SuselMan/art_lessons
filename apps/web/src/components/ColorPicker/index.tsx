import { memo, useCallback, useEffect, useRef, useState, type ComponentType } from 'react'

import { useT } from '../../i18n'
import { rgbToHsv, hsvToRgb, rgbToHex, hexToRgb, type Hsv } from '../../lib/color'
import { OptionGroup } from '../OptionGroup'
import { BarSquare } from './modes/BarSquare'
import { RingSquare } from './modes/RingSquare'
import { RingTriangle } from './modes/RingTriangle'
import type { ColorPickerModeProps } from './modes/types'
import {
  COLOR_PICKER_MODES,
  COLOR_PICKER_MODE_META,
  DEFAULT_COLOR_PICKER_MODE,
  type ColorPickerMode,
} from './pickerModes'
import styles from './ColorPicker.module.css'

/** Which surface draws each mode. Kept here rather than in `pickerModes.ts`
 *  so that module stays importable from the settings store, which node-run
 *  tests load without a DOM. */
const MODE_SURFACES: Record<ColorPickerMode, ComponentType<ColorPickerModeProps>> = {
  bar: BarSquare,
  ring: RingSquare,
  triangle: RingTriangle,
}

interface ColorPickerProps {
  value: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
  /** Which surface to draw. Defaults to the shape this picker has always had. */
  mode?: ColorPickerMode
  /** Omit to pin the picker to `mode` and hide the switch entirely — that's
   *  what CreateRoom's paper-color popover wants, where the job is picking a
   *  paper shade, not working with color. Pass it in the editor, where the
   *  choice is the person's (#337). */
  onModeChange?: (mode: ColorPickerMode) => void
}

// The shell around whichever mode is active: it owns the color, the hex field
// and the current swatch; the mode owns only its own geometry.
//
// HSV is kept as this component's own local state rather than re-derived from
// `value` on every render: RGB→HSV is lossy at s=0 or v=0 (hue is undefined
// there), which would otherwise snap hue back to 0 mid-drag whenever the color
// passes through gray or black. `lastEmitted` distinguishes "value changed
// because we just called onChange" (ignore, our hsv is already current) from
// "value changed for some other reason, e.g. eyedropper or hex input" (resync
// hsv from it).
// Wrapped in memo (#127): Room re-renders far more often than `value`/
// `onChange` actually change (e.g. every pointermove while panning, #126).
// Safe because Room passes its `color` state and setColor (a setState
// setter, stable by React's own guarantee) — see Room/index.tsx.
export const ColorPicker = memo(function ColorPicker({
  value,
  onChange,
  mode = DEFAULT_COLOR_PICKER_MODE,
  onModeChange,
}: ColorPickerProps) {
  const t = useT()
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(value))
  // Own local text buffer rather than a fully controlled `rgbToHex(value)`:
  // otherwise every keystroke on an incomplete hex (e.g. "#12") would get
  // immediately overwritten back to the last valid color, since an invalid
  // partial never reaches onChange/value.
  const [hexText, setHexText] = useState(() => rgbToHex(value))
  const lastEmitted = useRef<[number, number, number]>(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setHsv(rgbToHsv(value))
      setHexText(rgbToHex(value))
    }
  }, [value])

  const emit = useCallback((next: Hsv) => {
    setHsv(next)
    const rgb = hsvToRgb(next)
    lastEmitted.current = rgb
    setHexText(rgbToHex(rgb))
    onChange(rgb)
  }, [onChange])

  const Surface = MODE_SURFACES[mode]
  // One mode is not a choice: the switch appears when there is something to
  // switch to, so #340 lights it up by adding to COLOR_PICKER_MODES rather
  // than by also having to remember to un-hide it here.
  const showModes = onModeChange !== undefined && COLOR_PICKER_MODES.length > 1

  return (
    <div className={styles.picker}>
      {showModes && (
        <OptionGroup
          variant="segmented"
          options={COLOR_PICKER_MODES.map(id => ({
            id,
            label: t(COLOR_PICKER_MODE_META[id].label),
            icon: COLOR_PICKER_MODE_META[id].icon,
          }))}
          active={mode}
          onSelect={onModeChange}
          ariaLabel={t('palette.mode')}
        />
      )}

      <Surface hsv={hsv} onChange={emit} />

      <div className={styles.swatchRow}>
        <div className={styles.currentSwatch} style={{ background: rgbToHex(value) }} />
        <input
          className={styles.hexInput}
          value={hexText}
          onChange={e => {
            const text = e.target.value
            setHexText(text)
            if (/^#[0-9a-fA-F]{6}$/.test(text)) {
              const rgb = hexToRgb(text)
              lastEmitted.current = rgb
              setHsv(rgbToHsv(rgb))
              onChange(rgb)
            }
          }}
        />
      </div>
    </div>
  )
})

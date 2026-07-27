import { memo } from 'react'
import clsx from 'clsx'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import styles from './PaletteBar.module.css'

interface PaletteBarProps {
  palette: string[]
  value: [number, number, number]
  onSelect: (rgb: [number, number, number]) => void
  onAdd: (color: string) => void
  onRemove: (color: string) => void
}

// Room palette (#190 epic): swatches below the ColorPicker, plus a single
// add/remove toggle for whichever color is currently selected — add if it
// isn't in the palette yet, remove if it already is. Kept as its own
// component (not folded into ColorPicker) since it's room-scoped socket
// state, not part of ColorPicker's own value/onChange contract.
export const PaletteBar = memo(function PaletteBar({ palette, value, onSelect, onAdd, onRemove }: PaletteBarProps) {
  const t = useT()
  const currentHex = rgbToHex(value)
  const inPalette = palette.some(c => c.toLowerCase() === currentHex.toLowerCase())

  return (
    <div className={styles.bar}>
      <div className={styles.swatches}>
        {palette.map(color => (
          <button
            key={color}
            className={clsx(styles.swatch, color.toLowerCase() === currentHex.toLowerCase() && styles.swatchActive)}
            style={{ background: color }}
            title={color}
            aria-label={t('palette.selectColor', { color })}
            onClick={() => onSelect(hexToRgb(color))}
          />
        ))}
      </div>
      <button
        className={styles.toggleBtn}
        title={t(inPalette ? 'palette.remove' : 'palette.add')}
        aria-label={t(inPalette ? 'palette.remove' : 'palette.add')}
        onClick={() => (inPalette ? onRemove(currentHex) : onAdd(currentHex))}
      >
        <Icon name={inPalette ? 'delete' : 'add'} />
      </button>
    </div>
  )
})

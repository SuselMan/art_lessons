import clsx from 'clsx'

import { Icon } from '../Icon'
import type { PickerOption } from './types'
import styles from './OptionPicker.module.css'

interface OptionPreviewProps {
  option: PickerOption
  /** 'strip': the sample stroke at its natural landscape proportions, for a
   *  list row. 'dot': the middle of that same stroke cropped to a circle, for
   *  the quick-panel button — a 500-px-wide strip squeezed into a 40 px
   *  toolbar slot would be a grey smudge, while its middle is exactly the
   *  part that carries the tone. */
  shape: 'strip' | 'dot'
}

/** The visual half of one option: a cropped sample stroke, or an icon for the
 *  options that have one. The circle is a CSS crop of the same asset rather
 *  than a second set of round files — same pixels, same download, and one
 *  place to replace when a stroke is re-shot. */
export function OptionPreview({ option, shape }: OptionPreviewProps) {
  if (option.icon) {
    return (
      <span className={clsx(styles.preview, shape === 'dot' ? styles.previewIconDot : styles.previewIcon)}>
        <Icon name={option.icon} />
      </span>
    )
  }
  if (!option.image) return null
  return (
    <span
      className={clsx(styles.preview, shape === 'dot' ? styles.previewDot : styles.previewStrip)}
      style={{ backgroundImage: `url(${option.image})` }}
      role="presentation"
    />
  )
}

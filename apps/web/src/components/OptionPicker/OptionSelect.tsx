import { useState } from 'react'

import { usePopupAnchor } from '../../lib/usePopupAnchor'
import { Icon } from '../Icon'
import { OptionPopup } from './OptionPopup'
import { OptionPreview } from './OptionPreview'
import type { PickerOption } from './types'
import styles from './OptionPicker.module.css'

interface OptionSelectProps {
  options: readonly PickerOption[]
  value: string
  onChange: (value: string) => void
  /** The field's own name ("Grade", "Type", "Nib") — this control is rendered
   *  under that label in the settings panel, and reuses it as its accessible
   *  name rather than inventing a second one. */
  label: string
}

/** The full settings panel's tool-type control (#335): a `<select>`-shaped
 *  row showing the current option's sample stroke and name, dropping down the
 *  same list the quick panel's button does.
 *
 *  It replaces a PrecisionSlider over the same enum. A slider was fine while
 *  every option was a bare notation ("HB", "2B") in a fixed order, but it
 *  never showed *what the choice does* — and for pencil grade, charcoal type
 *  and marker nib that's the whole decision. */
export function OptionSelect({ options, value, onChange, label }: OptionSelectProps) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popupRef, style } = usePopupAnchor<HTMLButtonElement, HTMLDivElement>(
    open, () => setOpen(false), { align: 'left', matchTriggerWidth: true, remeasureKey: options.length },
  )
  const selected = options.find(o => o.value === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.select}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
      >
        {selected && <OptionPreview option={selected} shape="strip" />}
        <span className={styles.selectLabel}>{selected?.label ?? value}</span>
        <Icon name="expand_more" />
      </button>
      {open && (
        <OptionPopup
          options={options}
          value={value}
          onSelect={onChange}
          onDismiss={() => setOpen(false)}
          label={label}
          popupRef={popupRef}
          style={style}
        />
      )}
    </>
  )
}

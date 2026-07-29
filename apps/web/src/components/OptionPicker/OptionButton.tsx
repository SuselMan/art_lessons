import { useState } from 'react'

import { usePopupAnchor } from '../../lib/usePopupAnchor'
import { OptionPopup } from './OptionPopup'
import { OptionPreview } from './OptionPreview'
import type { PickerOption } from './types'
import styles from './OptionPicker.module.css'

interface OptionButtonProps {
  options: readonly PickerOption[]
  value: string
  onChange: (value: string) => void
  label: string
}

/** The quick-settings column's tool-type control (#335): one toolbar-sized
 *  button showing the current option, dropping down the same list `OptionSelect`
 *  does.
 *
 *  Deliberately a separate component from OptionSelect rather than one with a
 *  `layout` prop (the way SettingField itself is built): the two share their
 *  list and nothing else — this one is a 40 px square whose entire content is
 *  the current value's own preview, and it opens sideways out of a narrow
 *  column pinned to the screen edge, where a full-width select row could not
 *  fit at all. */
export function OptionButton({ options, value, onChange, label }: OptionButtonProps) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popupRef, style } = usePopupAnchor<HTMLButtonElement, HTMLDivElement>(
    open, () => setOpen(false), { align: 'left', remeasureKey: options.length },
  )
  const selected = options.find(o => o.value === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.quickButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        // Both the field's name and its current value: the button itself has
        // room for the preview only, and on a tablet this tooltip is the one
        // place "Grade: 2B" is spelled out without opening the list.
        title={`${label}: ${selected?.label ?? value}`}
        onClick={() => setOpen(o => !o)}
      >
        {selected && <OptionPreview option={selected} shape="dot" />}
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

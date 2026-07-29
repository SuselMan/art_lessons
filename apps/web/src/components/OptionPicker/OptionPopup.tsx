import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

import { Icon } from '../Icon'
import { OptionPreview } from './OptionPreview'
import type { PickerOption } from './types'
import styles from './OptionPicker.module.css'

interface OptionPopupProps {
  options: readonly PickerOption[]
  value: string
  onSelect: (value: string) => void
  onDismiss: () => void
  label: string
  /** From `usePopupAnchor`, owned by whichever trigger opened this list. */
  popupRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
}

/** The list both tool-type pickers drop down — the one piece they genuinely
 *  share (the triggers themselves have nothing in common: a full-width select
 *  row and a 40 px toolbar button). Rendered as a real `listbox`, not a menu
 *  of actions: these options have a current value, and a screen reader has to
 *  be told which one it is. */
export function OptionPopup({
  options, value, onSelect, onDismiss, label, popupRef, style,
}: OptionPopupProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Focus the current option on open, so the list is immediately steerable by
  // keyboard from where the value actually is (rather than from the top) and
  // so Tab can't wander off behind the open popup.
  useEffect(() => {
    const index = Math.max(0, options.findIndex(o => o.value === value))
    itemRefs.current[index]?.focus()
  }, [options, value])

  const moveFocus = (from: number, direction: 1 | -1) => {
    const next = Math.min(options.length - 1, Math.max(0, from + direction))
    itemRefs.current[next]?.focus()
  }

  return createPortal(
    <div
      ref={popupRef}
      className={styles.popup}
      role="listbox"
      aria-label={label}
      style={style}
      onKeyDown={e => {
        const index = options.findIndex(o => o.value === document.activeElement?.getAttribute('data-value'))
        if (e.key === 'ArrowDown') { moveFocus(index, 1); e.preventDefault() }
        else if (e.key === 'ArrowUp') { moveFocus(index, -1); e.preventDefault() }
        else if (e.key === 'Home') { itemRefs.current[0]?.focus(); e.preventDefault() }
        else if (e.key === 'End') { itemRefs.current[options.length - 1]?.focus(); e.preventDefault() }
        else if (e.key === 'Escape') { onDismiss(); e.preventDefault() }
      }}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={el => { itemRefs.current[i] = el }}
          type="button"
          role="option"
          data-value={option.value}
          aria-selected={option.value === value}
          className={clsx(styles.item, option.value === value && styles.itemSelected)}
          onClick={() => { onSelect(option.value); onDismiss() }}
        >
          <OptionPreview option={option} shape="strip" />
          <span className={styles.itemLabel}>{option.label}</span>
          {option.value === value && <Icon name="check" />}
        </button>
      ))}
    </div>,
    document.body,
  )
}

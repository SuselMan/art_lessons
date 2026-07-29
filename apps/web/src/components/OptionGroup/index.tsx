import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'

import { Icon } from '../Icon'
import type { IconName } from '../../icons/iconNames'
import { nextOptionIndex } from './optionGroupKeys'
import styles from './OptionGroup.module.css'

export interface OptionDef<Id extends string = string> {
  id: Id
  label: string
  /** Material Symbols name, or a custom glyph from `assets/icons` (see Icon).
   *  The `segmented` variant shows this instead of the label. */
  icon?: IconName
  /** Rendered below the strip while this option is active. Only the `tab`
   *  selection mode has a panel — a group that merely picks a value has
   *  nothing to put in one. */
  content?: ReactNode
}

/** How the group looks. Semantics are chosen separately (`selection`), because
 *  the same shape serves both jobs: the color picker's mode switch is a
 *  segmented control that behaves like tabs, and a segmented control picking a
 *  preference is a radio group. */
export type OptionGroupVariant = 'tabs' | 'list' | 'segmented'

/** How the group behaves for a screen reader. `tab` = a strip that swaps the
 *  content below it; `radio` = a set of mutually exclusive values. These are
 *  genuinely different roles and cannot be collapsed into one. */
export type OptionGroupSelection = 'tab' | 'radio'

interface OptionGroupProps<Id extends string> {
  options: OptionDef<Id>[]
  active: Id
  onSelect: (id: Id) => void
  /** Default `tabs`. */
  variant?: OptionGroupVariant
  /** Defaults to `tab` for the `tabs` variant and `radio` for the others —
   *  the common pairing. Pass it explicitly to break that pairing. */
  selection?: OptionGroupSelection
  /** Names the group for a screen reader. A visible heading above the group
   *  doesn't reach it on its own. */
  ariaLabel?: string
}

/** One controlled group of mutually exclusive options, in the three shapes the
 *  app uses: modal tabs (`tabs`), a column of full-width preference rows
 *  (`list`), and a compact icon strip (`segmented`).
 *
 *  It exists because these were separate hand-written copies of the same
 *  keyboard-and-ARIA logic — two of them inline in `pages/Settings` — and the
 *  color picker (#337) needed one more.
 *
 *  Both patterns share their keyboard contract, so one implementation covers
 *  them: arrows move *and* select (tabs use automatic activation, and that is
 *  simply how a radio group works), Home/End jump to the ends, and only the
 *  selected button is tabbable, so the whole group is one tab stop rather
 *  than N.
 *
 *  Falls back to the first option if `active` names one that isn't in
 *  `options`. */
export function OptionGroup<Id extends string>({
  options,
  active,
  onSelect,
  variant = 'tabs',
  selection = variant === 'tabs' ? 'tab' : 'radio',
  ariaLabel,
}: OptionGroupProps<Id>) {
  const uid = useId()
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])

  const activeIndex = Math.max(
    0,
    options.findIndex(o => o.id === active),
  )
  const activeOption = options[activeIndex]
  const isTabs = selection === 'tab'
  const showPanel = isTabs && options.some(o => o.content !== undefined)

  const onKeyDown = (e: KeyboardEvent) => {
    const next = nextOptionIndex(e.key, activeIndex, options.length)
    if (next === null) return
    e.preventDefault()
    onSelect(options[next].id)
    buttonsRef.current[next]?.focus()
  }

  return (
    <div className={clsx(styles.group, styles[variant])}>
      <div
        className={styles.strip}
        role={isTabs ? 'tablist' : 'radiogroup'}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        {options.map((option, i) => {
          const selected = option.id === activeOption?.id
          const iconOnly = variant === 'segmented' && option.icon !== undefined
          return (
            <button
              key={option.id}
              type="button"
              ref={el => {
                buttonsRef.current[i] = el
              }}
              id={isTabs ? `${uid}-${option.id}` : undefined}
              role={isTabs ? 'tab' : 'radio'}
              aria-selected={isTabs ? selected : undefined}
              aria-checked={isTabs ? undefined : selected}
              aria-controls={showPanel ? `${uid}-panel` : undefined}
              aria-label={iconOnly ? option.label : undefined}
              title={iconOnly ? option.label : undefined}
              tabIndex={selected ? 0 : -1}
              className={clsx(styles.option, selected && styles.optionSelected)}
              onClick={() => onSelect(option.id)}
            >
              {option.icon !== undefined && <Icon name={option.icon} />}
              {!iconOnly && <span className={styles.label}>{option.label}</span>}
              {variant === 'list' && selected && <Icon name="check" />}
            </button>
          )
        })}
      </div>

      {showPanel && (
        <div
          className={styles.panel}
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={activeOption ? `${uid}-${activeOption.id}` : undefined}
        >
          {activeOption?.content}
        </div>
      )}
    </div>
  )
}

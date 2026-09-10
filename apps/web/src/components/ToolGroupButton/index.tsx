import { useState } from 'react'
import clsx from 'clsx'

import { useLongPress } from '../../lib/useLongPress'
import { usePopupAnchor } from '../../lib/usePopupAnchor'
import type { IconName } from '../../icons/iconNames'
import { Icon } from '../Icon'
import { OptionPopup } from '../OptionPicker/OptionPopup'
import type { PickerOption } from '../OptionPicker/types'
import styles from './ToolGroupButton.module.css'

interface ToolGroupButtonProps {
  /** Everything behind this button, in the order the chooser lists them. One
   *  entry means there is nothing to choose: the corner mark and the chooser
   *  both disappear, and the button is an ordinary tool button. */
  options: readonly PickerOption[]
  /** Which option is in hand — the one the button wears and the chooser ticks. */
  value: string
  /** Pick a different one. The caller both selects it and puts it in hand;
   *  this component never assumes choosing implies selecting. */
  onSelect: (value: string) => void
  /** A plain tap while this button is not the selected tool: take the current
   *  option, don't open anything. */
  onActivate: () => void
  active: boolean
  icon: IconName
  /** Tooltip — the full sentence, hotkey and all. */
  title: string
  /** Screen-reader name for the button, and for the chooser it opens. */
  label: string
  /** The toolbar's own button class, passed in rather than duplicated here:
   *  this button has to be indistinguishable from the ones beside it, and the
   *  rail is where that look is defined. */
  className?: string
  activeClassName?: string
}

/** (#544) One toolbar button standing for a group of tools, with the group's
 *  chooser behind it.
 *
 *  The rail used to carry one button per drawing material — seven of them, and
 *  growing with every material we add, which is what #544 is about. None of
 *  the seven editors surveyed there keeps materials in its rail: a rail is
 *  verbs (draw, erase, smudge, select), and *what you draw with* lives in a
 *  chooser. This is that chooser's trigger.
 *
 *  Three ways in, deliberately, because the two audiences want different ones:
 *
 *  - a tap takes the current material, so the common case costs one tap and
 *    the button behaves exactly like its neighbours;
 *  - a second tap on the already-selected button opens the chooser — the
 *    gesture Procreate and Concepts both use, and the one the floating panel
 *    (#157) already trained here;
 *  - a press-and-hold opens it from anywhere, which is what a stylus user
 *    reaches for and what the corner mark promises.
 *
 *  The corner mark is the promise. It is the vocabulary this app already had
 *  (the floating panel wears a badge on a slot holding a role rather than a
 *  fixed tool) and the one every editor in the survey uses for the same claim:
 *  there is more than one thing behind this button.
 */
export function ToolGroupButton({
  options, value, onSelect, onActivate, active, icon, title, label,
  className, activeClassName,
}: ToolGroupButtonProps) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popupRef, style } = usePopupAnchor<HTMLButtonElement, HTMLDivElement>(
    open, () => setOpen(false), { align: 'left', remeasureKey: options.length },
  )
  // A group of one is not a group. The room's toolset can shrink this list to
  // a single material (#548), and a chooser offering one option is a dead end
  // that still costs a tap to escape — so it isn't offered at all, and the
  // corner mark that would have promised it isn't drawn.
  const grouped = options.length > 1

  const { onPointerDown } = useLongPress({ onLongPress: () => { if (grouped) setOpen(true) } })

  return (
    <>
      <button
        ref={triggerRef}
        className={clsx(className, active && activeClassName, styles.group)}
        title={title}
        aria-label={label}
        aria-pressed={active}
        aria-haspopup={grouped ? 'listbox' : undefined}
        aria-expanded={grouped ? open : undefined}
        onPointerDown={onPointerDown}
        // The tap that opens the chooser is the *second* one, so the first tap
        // on an unselected button must not open anything — otherwise picking
        // up the pencil from the ruler would put a list on screen nobody asked
        // for. Selecting and choosing are the same button in that order.
        onClick={() => {
          if (active && grouped) setOpen(o => !o)
          else onActivate()
        }}
      >
        <Icon name={icon} />
        {grouped && <span className={styles.groupMark} aria-hidden="true" />}
      </button>
      {open && (
        <OptionPopup
          options={options}
          value={value}
          onSelect={onSelect}
          onDismiss={() => setOpen(false)}
          label={label}
          popupRef={popupRef}
          style={style}
        />
      )}
    </>
  )
}

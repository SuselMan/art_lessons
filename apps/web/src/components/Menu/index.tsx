import { useRef, useState, type ReactNode } from 'react'

import { useDismissOnOutside } from '../../lib/useDismissOnOutside'

import styles from './Menu.module.css'

export interface MenuAction {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  title?: string // tooltip — e.g. explaining why a stub action is disabled
}

interface MenuProps {
  /** Trigger content. The button chrome around it is the call site's — a "⋮"
   *  on a room card and a username in the app header want nothing in common
   *  visually, only the same open/close/dismiss behaviour. */
  trigger: ReactNode
  triggerClassName?: string
  /** Accessible name for the trigger. Needed whenever its content doesn't
   *  produce a clean one on its own — an icon-only trigger has no text at all,
   *  and an icon *beside* text is worse: Material Symbols draw from a ligature,
   *  so the raw glyph name ("account_circle") ends up in the computed name (see
   *  components/Icon). Pass the visible label verbatim in that case. */
  triggerLabel?: string
  actions: MenuAction[]
  /** Which edge the panel hangs from. Defaults to `right`, since a menu in the
   *  top-right corner opening rightwards would run off screen. */
  align?: 'left' | 'right'
}

/** The app's dropdown menu: a button that opens a list of actions below it.
 *  Closes on an outside pointerdown or Escape, and each action closes the menu
 *  *before* running — so a caller that opens its own dialog isn't fighting
 *  this component's open state.
 *
 *  Generalised out of `CardMenu` (#211, #216) when the app header needed the
 *  same menu under a username instead of a "⋮"; CardMenu is now a wrapper that
 *  supplies its own trigger. */
export function Menu({ trigger, triggerClassName, triggerLabel, actions, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissOnOutside(open, rootRef, () => setOpen(false))

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={align === 'left' ? styles.menuLeft : styles.menu}
          role="menu"
          onClick={e => e.stopPropagation()}
        >
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? styles.dangerItem : styles.item}
              disabled={action.disabled}
              title={action.title}
              onClick={() => { setOpen(false); action.onClick() }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

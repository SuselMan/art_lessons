import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

import { usePopupAnchor } from '../../lib/usePopupAnchor'
import { Icon } from '../Icon'

import styles from './Menu.module.css'

export interface MenuAction {
  label: string
  onClick: () => void
  /** (#329) Material Symbols name, drawn before the label. Optional per action,
   *  but a menu should either icon every item or none of them — a lone icon in
   *  a list of bare labels reads as an accident. */
  icon?: string
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
  /** Which of the trigger's edges the panel lines up with. Defaults to `right`,
   *  since a menu in the top-right corner opening rightwards would run off
   *  screen. Only the preferred alignment — the clamp below overrides it when
   *  the panel wouldn't fit either way. */
  align?: 'left' | 'right'
}

/** The app's dropdown menu: a button that opens a list of actions below it.
 *  Closes on an outside pointerdown or Escape, and each action closes the menu
 *  *before* running — so a caller that opens its own dialog isn't fighting
 *  this component's open state.
 *
 *  Generalised out of `CardMenu` (#211, #216) when the app header needed the
 *  same menu under a username instead of a "⋮"; CardMenu is now a wrapper that
 *  supplies its own trigger.
 *
 *  (#328) Positioned in viewport coordinates through a portal rather than as an
 *  absolutely-positioned child of the trigger. The absolute version was fine in
 *  page layouts but not in the docked right-hand panel: it's flush against the
 *  window edge, so a menu wider than the panel simply left the screen, and a
 *  row near the bottom of a long list pushed it below the fold. `LayerPanel`
 *  had already grown its own measured-and-clamped copy for exactly that reason
 *  — this is that logic, moved to where every "⋮" in the app gets it. (#335)
 *  That geometry now lives in `usePopupAnchor`, shared with the tool-type
 *  pickers; what stays here is the action-list itself. */
export function Menu({ trigger, triggerClassName, triggerLabel, actions, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popupRef, style } = usePopupAnchor<HTMLDivElement, HTMLDivElement>(
    open, () => setOpen(false), { align, remeasureKey: actions.length },
  )

  return (
    <div className={styles.root} ref={triggerRef}>
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
      {open && createPortal(
        <div
          ref={popupRef}
          className={styles.menu}
          role="menu"
          onClick={e => e.stopPropagation()}
          style={style}
        >
          {actions.map(action => (
            // A disabled item is a <span>, not a disabled <button>: a disabled
            // button swallows its own mouse events, so the browser never shows
            // its `title` — and on a stubbed-out action that tooltip is the
            // whole reason the item is listed at all (#328's "Block").
            action.disabled ? (
              <span
                key={action.label}
                role="menuitem"
                aria-disabled="true"
                className={clsx(styles.item, styles.itemDisabled)}
                title={action.title}
              >
                {action.icon && <Icon name={action.icon} />}
                {action.label}
              </span>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={action.danger ? styles.dangerItem : styles.item}
                title={action.title}
                onClick={() => { setOpen(false); action.onClick() }}
              >
                {action.icon && <Icon name={action.icon} />}
                {action.label}
              </button>
            )
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

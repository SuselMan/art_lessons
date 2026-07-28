import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

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
  /** Which of the trigger's edges the panel lines up with. Defaults to `right`,
   *  since a menu in the top-right corner opening rightwards would run off
   *  screen. Only the preferred alignment — the clamp below overrides it when
   *  the panel wouldn't fit either way. */
  align?: 'left' | 'right'
}

/** Distance kept between the menu and the viewport edges when clamping. */
const VIEWPORT_MARGIN = 8

/** Gap between the trigger and the menu hanging off it. */
const ANCHOR_GAP = 4

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
 *  — this is that logic, moved to where every "⋮" in the app gets it. */
export function Menu({ trigger, triggerClassName, triggerLabel, actions, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useDismissOnOutside(open, [rootRef, menuRef], () => setOpen(false))

  // Measure once per open. Everything the menu is positioned against — the
  // trigger's box and the viewport — is read here rather than tracked, so an
  // open menu is pinned where it was placed; a scroll or resize underneath it
  // closes it instead (below), which is what a dropdown does everywhere else.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const menuEl = menuRef.current
    const triggerEl = rootRef.current
    if (!menuEl || !triggerEl) return

    const rect = triggerEl.getBoundingClientRect()
    const { width, height } = menuEl.getBoundingClientRect()
    const m = VIEWPORT_MARGIN

    // Flip above the trigger rather than merely sliding up when there's no room
    // below, so the menu never covers the row it belongs to.
    let top = rect.bottom + ANCHOR_GAP
    if (top + height > window.innerHeight - m) top = rect.top - height - ANCHOR_GAP
    top = Math.max(m, Math.min(top, window.innerHeight - height - m))

    const preferredLeft = align === 'left' ? rect.left : rect.right - width
    const left = Math.max(m, Math.min(preferredLeft, window.innerWidth - width - m))

    setPos({ top, left })
  }, [open, align, actions.length])

  useLayoutEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    // Capture phase: the scroll that matters is usually an inner container's
    // (the layer list, the room list), and those don't bubble to window.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

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
      {open && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          onClick={e => e.stopPropagation()}
          // Rendered at the origin for one frame so it can be measured; hidden
          // meanwhile so that frame isn't visible as a jump.
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
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

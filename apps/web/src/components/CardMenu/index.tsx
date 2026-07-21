import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import styles from './CardMenu.module.css'

export interface CardMenuAction {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  title?: string // tooltip — e.g. explaining why a stub action is disabled
}

interface CardMenuProps {
  actions: CardMenuAction[]
}

/** Small "⋮" popover menu shared by room and folder cards (#211 epic, #216)
 *  — replaces the room card's old standing delete button. Closes on an
 *  outside click or Escape; each action closes the menu itself before
 *  running (so a caller that opens its own dialog, e.g. "Move to...", isn't
 *  fighting this component's own open state). */
export function CardMenu({ actions }: CardMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div className={styles.menu} role="menu" onClick={e => e.stopPropagation()}>
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

import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { claimModalSlot, releaseModalSlot, type ModalSlotEntry } from './modalSlot'
import styles from './Modal.module.css'

export type ModalSize = 'sm' | 'md' | 'lg'

interface ModalProps {
  /** Asked to close: backdrop click, the header's ✕, Escape, or another modal
   *  opening (see modalSlot). The caller owns the open/closed state — Modal
   *  never keeps its own. */
  onClose: () => void
  children: ReactNode
  /** Visible header title. Omit for a dialog that draws its own head — then
   *  `ariaLabel` supplies the accessible name instead. */
  title?: ReactNode
  ariaLabel?: string
  size?: ModalSize
  /** Extra class on the dialog box, for layout the shell can't know about. */
  className?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** (#310) The one modal shell in the app: a portal into `<body>`, a backdrop
 *  that closes on click, Escape-to-close, a Tab focus trap, focus restored to
 *  whatever was focused when it opened, and `role="dialog"`/`aria-modal`.
 *  Only one can be open at a time — mounting a second closes the first (see
 *  `modalSlot`).
 *
 *  Content is free-form: the shell provides the box (and an optional header),
 *  each caller lays out its own body and owns its own scroll region. */
export function Modal({ onClose, children, title, ariaLabel, size = 'md', className }: ModalProps) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Read through a ref so the slot entry below stays stable for the lifetime
  // of this instance while still calling the *current* onClose.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Entry identity is what releaseModalSlot matches on, so it must survive
  // re-renders — created once, lazily.
  const slotRef = useRef<ModalSlotEntry | null>(null)
  if (!slotRef.current) slotRef.current = { close: () => onCloseRef.current() }

  useEffect(() => {
    const entry = slotRef.current!
    claimModalSlot(entry)
    return () => releaseModalSlot(entry)
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Don't steal focus from content that already claimed it: an `autoFocus`
    // child (e.g. ConfirmDialog's default button) focuses during mount, i.e.
    // before this effect runs.
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
    return () => {
      // `isConnected` guards the case where the trigger itself went away with
      // whatever the dialog just did (a deleted row's own ⋮ button).
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  // Escape and the Tab trap are handled here, on the backdrop, in the bubble
  // phase — *not* on window. A window listener would beat capture-phase
  // listeners registered later by the modal's own content (SettingsPanel's
  // hotkey recorder is one, and its Escape means "cancel this rebind", not
  // "close the panel"); on the backdrop, that recorder still gets first
  // refusal and can stopPropagation. Requires focus to be inside the
  // backdrop, which the focus handling above and the trap below maintain.
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.getClientRects().length > 0)
    if (focusables.length === 0) {
      e.preventDefault() // nothing to move to — keep focus on the dialog itself
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const activeEl = document.activeElement
    if (!e.shiftKey && activeEl === last) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && (activeEl === first || activeEl === dialog)) {
      e.preventDefault()
      last.focus()
    }
    // Every other Tab is left to the browser: the dialog element sits before
    // its own content in the DOM, so a forward Tab off it lands on `first`.
  }, [])

  return createPortal(
    <div
      className={styles.backdrop}
      // Only a click that both started and ended on the backdrop itself
      // closes — replaces the `stopPropagation` each old copy had to put on
      // its own box to keep inner clicks from closing the dialog.
      onClick={e => { if (e.target === e.currentTarget) onCloseRef.current() }}
      onKeyDown={handleKeyDown}
      // Keeps keys landing here after a click on the backdrop that didn't
      // close the dialog (a drag that ended outside), which would otherwise
      // move focus to <body> and strip Escape.
      tabIndex={-1}
    >
      <div
        ref={dialogRef}
        className={clsx(styles.dialog, styles[size], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title === undefined ? undefined : titleId}
        aria-label={title === undefined ? ariaLabel : undefined}
        tabIndex={-1}
      >
        {title !== undefined && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            <button type="button" className={styles.closeBtn} aria-label={t('common.close')} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

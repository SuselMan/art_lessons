import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Modal } from '../Modal'
import {
  ConfirmDialogContext,
  type AlertRequest, type ConfirmDialogApi, type ConfirmRequest,
} from './useConfirmDialog'
import styles from './ConfirmDialog.module.css'

type Pending =
  | { kind: 'confirm'; request: ConfirmRequest; settle: (confirmed: boolean) => void }
  | { kind: 'alert'; request: AlertRequest; settle: (confirmed: boolean) => void }

/** (#310) Replaces `window.confirm` / `window.alert`, which were the app's
 *  only confirmation UI. Mounted once in App.tsx; everything below it calls
 *  `useConfirmDialog()`.
 *
 *  Promise-based on purpose: the call sites it replaced read
 *  `if (!window.confirm(...)) return`, and `if (!await confirm(...)) return`
 *  keeps that same linear shape instead of splitting each one into a state
 *  flag plus a continuation callback. Note the one real difference from the
 *  native dialog: `window.confirm` froze all JS, so nothing could arrive
 *  while it was up — an awaited dialog does not, so anything read *before*
 *  the await (e.g. an engine peek) may be stale by the time it resolves. */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  // Mirrors `pending` for the imperative paths (open / settle / unmount),
  // which can't wait for a render to have happened.
  const pendingRef = useRef<Pending | null>(null)

  const settle = useCallback((confirmed: boolean) => {
    const entry = pendingRef.current
    if (!entry) return
    pendingRef.current = null
    setPending(null)
    entry.settle(confirmed)
  }, [])

  // A caller is always awaiting: if this provider goes away (route change with
  // a dialog still up) the pending request must be declined, not abandoned.
  useEffect(() => () => { pendingRef.current?.settle(false) }, [])

  const api = useMemo<ConfirmDialogApi>(() => {
    function open(next: Pending) {
      // Same one-at-a-time rule as Modal's slot. An older request is declined
      // rather than silently dropped — someone is still awaiting it.
      pendingRef.current?.settle(false)
      pendingRef.current = next
      setPending(next)
    }
    return {
      confirm: request => new Promise<boolean>(resolve => {
        open({ kind: 'confirm', request, settle: resolve })
      }),
      alert: request => new Promise<void>(resolve => {
        open({ kind: 'alert', request, settle: () => resolve() })
      }),
    }
  }, [])

  return (
    <ConfirmDialogContext.Provider value={api}>
      {children}
      {pending && <ConfirmDialogView pending={pending} onSettle={settle} />}
    </ConfirmDialogContext.Provider>
  )
}

function ConfirmDialogView({ pending, onSettle }: {
  pending: Pending
  onSettle: (confirmed: boolean) => void
}) {
  const danger = pending.kind === 'confirm' && pending.request.danger === true
  const acceptLabel = pending.kind === 'confirm'
    ? pending.request.confirmLabel ?? 'Continue'
    : pending.request.dismissLabel ?? 'OK'

  return (
    <Modal
      size="sm"
      title={pending.request.title}
      ariaLabel={pending.request.title ?? (pending.kind === 'confirm' ? 'Confirm' : 'Notice')}
      onClose={() => onSettle(false)}
    >
      <div className={styles.message}>{pending.request.message}</div>
      <div className={styles.actions}>
        {pending.kind === 'confirm' && (
          <button
            type="button"
            className={clsx(styles.button, styles.cancel)}
            autoFocus={danger}
            onClick={() => onSettle(false)}
          >
            {pending.request.cancelLabel ?? 'Cancel'}
          </button>
        )}
        <button
          type="button"
          className={clsx(styles.button, danger ? styles.danger : styles.confirm)}
          autoFocus={!danger}
          onClick={() => onSettle(true)}
        >
          {acceptLabel}
        </button>
      </div>
    </Modal>
  )
}

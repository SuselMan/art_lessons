import { create } from 'zustand'

import type { NoticeAction, NoticePosition, NoticeVariant } from '../components/Notice/Notice'
import type { IconName } from '../icons/iconNames'

// (#343) Notices that report an *event* — a request that failed, an action
// that succeeded. Nothing in application state implies they should be
// visible, so they need somewhere to live, an id, and a lifetime of their
// own.
//
// The other half of the system is not here on purpose. A strip whose
// visibility already follows from a flag (`roomClosed`, `isBlockedByFreeze`,
// `connected && pending === 0`) is rendered conditionally straight from that
// flag: no id, no timer, nothing to dismiss, and no way for the strip and the
// state to disagree. Pushing those through this store would mean re-deriving
// the flag into a `pushNotice`/`dismissNotice` pair plus an `updateNotice` on
// every change of an interpolated counter — the same render, hand-written,
// with a desync bug added. The dividing line is exactly "does a flag in the
// store already imply this should be visible".
//
// Deliberately a separate store from `roomStore`, for the reason
// `settingsStore` is: `resetRoomStore()` replaces the whole room state on
// every Room mount, and a notice has to survive both that and navigation
// between pages — "could not delete the lesson" is reported on My Lessons,
// where no room exists at all.

/** How long a notice stays up before removing itself, per variant.
 *
 *  Success auto-hides: the thing worked, the report changes nothing, and a
 *  strip that needs dismissing after every success is a tax on the happy
 *  path. Everything else waits to be dismissed — a failure that disappears on
 *  a timer can be missed entirely, and then the user is left with a lesson
 *  that silently did not get deleted. Overridable per push; `null` means
 *  sticky. */
const DEFAULT_DURATION_MS: Record<NoticeVariant, number | null> = {
  success: 4000,
  error: null,
  warning: null,
  neutral: null,
}

export interface Notice {
  id: string
  variant: NoticeVariant
  message: string
  icon?: IconName
  position: NoticePosition
  action?: NoticeAction
  dismissible: boolean
}

export interface PushNoticeInput {
  variant: NoticeVariant
  /** Already translated. The store holds finished text, not a
   *  `TranslationKey`: a notice can be pushed from a mutation callback that
   *  has `t` in scope, and interpolated values (a layer name, a count) are
   *  resolved at that moment anyway. */
  message: string
  icon?: IconName
  position?: NoticePosition
  /** `null` = stays until dismissed. Omitted = the variant's default. */
  durationMs?: number | null
  action?: NoticeAction
  /** Defaults to "yes, if it doesn't leave on its own" — anything that never
   *  times out must have a way out, or it is stuck on screen for good. */
  dismissible?: boolean
  /** Collapses repeats: pushing with a key that is already up replaces that
   *  notice in place and restarts its timer, instead of stacking a second
   *  copy. Without it, a retried request that fails twice reports itself
   *  twice, and React's StrictMode double-invoking an effect in dev pushes
   *  everything twice. */
  key?: string
}

interface NoticeStore {
  notices: Notice[]
  /** Keys of currently-shown notices, for collapse lookups. Kept alongside
   *  rather than derived so `notices` stays a plain list in render order. */
  keys: Record<string, string>
}

export const useNoticeStore = create<NoticeStore>()(() => ({
  notices: [],
  keys: {},
}))

// Timers live outside the store: they are not state anything renders from,
// and keeping them in a module-level map means a re-render can never
// accidentally reschedule one.
const timers = new Map<string, number>()

let nextId = 1

function clearTimer(id: string): void {
  const handle = timers.get(id)
  if (handle !== undefined) {
    clearTimeout(handle)
    timers.delete(id)
  }
}

function scheduleDismiss(id: string, durationMs: number | null): void {
  clearTimer(id)
  if (durationMs === null) return
  timers.set(id, setTimeout(() => dismissNotice(id), durationMs) as unknown as number)
}

/** Shows a notice and returns its id, so a caller that needs to change or
 *  retract it later can. */
export function pushNotice(input: PushNoticeInput): string {
  const durationMs = input.durationMs === undefined
    ? DEFAULT_DURATION_MS[input.variant]
    : input.durationMs

  const notice: Omit<Notice, 'id'> = {
    variant: input.variant,
    message: input.message,
    icon: input.icon,
    position: input.position ?? 'bottom',
    action: input.action,
    dismissible: input.dismissible ?? durationMs === null,
  }

  const existingId = input.key === undefined ? undefined : useNoticeStore.getState().keys[input.key]
  if (existingId !== undefined) {
    // Replaced in place, keeping its slot in the list: a repeat of the same
    // failure is the same news, and moving it to the end would make it look
    // like something new happened.
    useNoticeStore.setState(state => ({
      notices: state.notices.map(n => (n.id === existingId ? { ...notice, id: existingId } : n)),
    }))
    scheduleDismiss(existingId, durationMs)
    return existingId
  }

  const id = `notice-${nextId++}`
  useNoticeStore.setState(state => ({
    notices: [...state.notices, { ...notice, id }],
    keys: input.key === undefined ? state.keys : { ...state.keys, [input.key]: id },
  }))
  scheduleDismiss(id, durationMs)
  return id
}

/** Changes a notice that is already up — the counter in its text, the
 *  disabled state of its button — without it disappearing and coming back. */
export function updateNotice(id: string, patch: Partial<Omit<Notice, 'id'>>): void {
  useNoticeStore.setState(state => ({
    notices: state.notices.map(n => (n.id === id ? { ...n, ...patch } : n)),
  }))
}

export function dismissNotice(id: string): void {
  clearTimer(id)
  useNoticeStore.setState(state => {
    const keys = { ...state.keys }
    for (const [key, value] of Object.entries(keys)) {
      if (value === id) delete keys[key]
    }
    return { notices: state.notices.filter(n => n.id !== id), keys }
  })
}

/** Drops everything. For tests, and for the rare caller that has to clear the
 *  screen wholesale. Navigation deliberately does *not* call this — a notice
 *  outliving the page that pushed it is the reason this store exists. */
export function clearNotices(): void {
  for (const id of timers.keys()) clearTimeout(timers.get(id))
  timers.clear()
  useNoticeStore.setState({ notices: [], keys: {} })
}

/** Convenience wrappers for the three cases that make up nearly every call
 *  site, so reporting a failed request is one line at the point it failed. */
export function notifyError(message: string, options?: Omit<PushNoticeInput, 'variant' | 'message'>): string {
  return pushNotice({ ...options, variant: 'error', message })
}

export function notifySuccess(message: string, options?: Omit<PushNoticeInput, 'variant' | 'message'>): string {
  return pushNotice({ ...options, variant: 'success', message })
}

export function notifyWarning(message: string, options?: Omit<PushNoticeInput, 'variant' | 'message'>): string {
  return pushNotice({ ...options, variant: 'warning', message })
}

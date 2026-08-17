import type { RoomAccessMode } from '@grafetto/shared'

import type { TranslationKey } from '../i18n'

import type { DeviceType } from './deviceType'

// (#314 §4) Handing someone a link to a project is the app's whole
// hand-in/hand-out mechanism — there is no homework object, a student sends a
// link to their fork and a teacher sends a link to the copy they made. Until
// this existed the only way to get that link was to select the browser's
// address bar, which a tablet in standalone PWA mode does not show at all.

/** What actually happened when the user asked to share a project.
 *
 *  `dismissed` is deliberately its own outcome rather than a failure: closing
 *  the system share sheet is a decision, and reporting it back as "could not
 *  share" would be the app arguing with it. */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

/** Just the two capabilities this file uses, so a test can hand in a fake and
 *  so the optionality is honest: `share` is missing on most desktop browsers,
 *  and `clipboard` is missing outside a secure context. */
export interface ShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
  clipboard?: { writeText: (text: string) => Promise<void> }
}

/** The address a participant opens to land in this project — the same route
 *  the lesson list links to. `origin` is passed in rather than read here so
 *  this stays a pure function; `window.location.origin` never carries a
 *  trailing slash. */
export function roomShareUrl(roomId: string, origin: string): string {
  return `${origin}/room/${roomId}`
}

/** Whether to open the OS share sheet instead of copying.
 *
 *  Capability alone isn't the question: Chrome and Edge on Windows implement
 *  `navigator.share` and answer it with the Windows share flyout, which is a
 *  worse answer than the clipboard for someone who is going to paste the link
 *  into a chat they already have open. On a tablet the sheet *is* the way to
 *  reach the messenger, and there is no comfortable paste. So the split is the
 *  app's existing `deviceType` — the same "which controls are within reach"
 *  question this flag answers everywhere else (see deviceType.ts). */
export function canShareNatively(deviceType: DeviceType, nav: ShareNavigator): boolean {
  return deviceType === 'tablet' && typeof nav.share === 'function'
}

/** Offers the link through the system share sheet where that makes sense, and
 *  copies it otherwise. A share sheet that fails for any reason other than the
 *  user closing it falls through to the clipboard rather than reporting
 *  nothing happened — the user asked for a link, not for a particular UI. */
export async function shareOrCopy(input: {
  url: string
  title: string
  deviceType: DeviceType
  nav?: ShareNavigator
}): Promise<ShareOutcome> {
  const nav: ShareNavigator = input.nav ?? navigator
  const share = canShareNatively(input.deviceType, nav) ? nav.share : undefined

  if (share) {
    try {
      await share.call(nav, { title: input.title, url: input.url })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'dismissed'
      // Anything else — no permission, no target app, an OS-level refusal —
      // is this path failing, not the user declining. Fall through.
    }
  }

  const clipboard = nav.clipboard
  if (!clipboard) return 'failed'
  try {
    await clipboard.writeText(input.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export interface ShareNotice {
  variant: 'success' | 'warning' | 'error'
  message: TranslationKey
}

/** What to tell the user afterwards — one strip, never two.
 *
 *  An `invite_only` project still shares (the recipient may already be on the
 *  allow-list, and the owner may be about to add them), but the link on its
 *  own does not admit anyone, so saying only "copied" would set up a support
 *  question later. A successful *native* share says nothing at all on the open
 *  path: the OS sheet was the feedback. */
export function shareNoticeFor(outcome: ShareOutcome, accessMode: RoomAccessMode): ShareNotice | null {
  const inviteOnly = accessMode === 'invite_only'
  switch (outcome) {
    case 'dismissed':
      return null
    case 'failed':
      return { variant: 'error', message: 'share.failed' }
    case 'shared':
      return inviteOnly ? { variant: 'warning', message: 'share.inviteOnly' } : null
    case 'copied':
      return inviteOnly
        ? { variant: 'warning', message: 'share.copiedInviteOnly' }
        : { variant: 'success', message: 'share.copied' }
  }
}

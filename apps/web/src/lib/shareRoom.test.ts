import { describe, expect, it, vi } from 'vitest'

import { canShareNatively, roomShareUrl, shareNoticeFor, shareOrCopy, type ShareNavigator } from './shareRoom'

/** A navigator with either capability present or missing, so each branch is
 *  exercised against the shape a real browser actually presents (a desktop
 *  Chrome has no `share`; an insecure context has no `clipboard`). */
function fakeNavigator(parts: {
  share?: (data: { url?: string }) => Promise<void>
  writeText?: (text: string) => Promise<void>
}): ShareNavigator {
  return {
    share: parts.share,
    clipboard: parts.writeText ? { writeText: parts.writeText } : undefined,
  }
}

function abortError(): Error {
  const error = new Error('Share canceled')
  error.name = 'AbortError'
  return error
}

describe('roomShareUrl', () => {
  it('points at the same route the lesson list links to', () => {
    expect(roomShareUrl('hWc6QM7h', 'https://grafetto.com')).toBe('https://grafetto.com/room/hWc6QM7h')
  })
})

describe('canShareNatively', () => {
  const nav = fakeNavigator({ share: () => Promise.resolve() })

  it('is for tablets, where the share sheet is how you reach a messenger', () => {
    expect(canShareNatively('tablet', nav)).toBe(true)
  })

  // Windows Chrome/Edge do implement navigator.share, so capability alone
  // would open the OS flyout on a PC — worse than the clipboard for someone
  // about to paste into a chat that is already open.
  it('is not for desktop even when the browser supports it', () => {
    expect(canShareNatively('desktop', nav)).toBe(false)
  })

  it('is not available without the API', () => {
    expect(canShareNatively('tablet', fakeNavigator({}))).toBe(false)
  })
})

describe('shareOrCopy', () => {
  const url = 'https://grafetto.com/room/hWc6QM7h'

  it('hands the link to the system sheet on a tablet', async () => {
    const share = vi.fn(() => Promise.resolve())
    const writeText = vi.fn(() => Promise.resolve())

    const outcome = await shareOrCopy({
      url, title: 'Still life', deviceType: 'tablet', nav: fakeNavigator({ share, writeText }),
    })

    expect(outcome).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Still life', url })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies on desktop without touching the share API', async () => {
    const share = vi.fn(() => Promise.resolve())
    const writeText = vi.fn(() => Promise.resolve())

    const outcome = await shareOrCopy({
      url, title: 'Still life', deviceType: 'desktop', nav: fakeNavigator({ share, writeText }),
    })

    expect(outcome).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(url)
    expect(share).not.toHaveBeenCalled()
  })

  // Closing the sheet is a decision. Copying anyway would put a link the user
  // just declined to send onto their clipboard, over whatever was there.
  it('treats a closed share sheet as done, not as a reason to copy', async () => {
    const writeText = vi.fn(() => Promise.resolve())

    const outcome = await shareOrCopy({
      url,
      title: 'Still life',
      deviceType: 'tablet',
      nav: fakeNavigator({ share: () => Promise.reject(abortError()), writeText }),
    })

    expect(outcome).toBe('dismissed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the share sheet fails for any other reason', async () => {
    const writeText = vi.fn(() => Promise.resolve())

    const outcome = await shareOrCopy({
      url,
      title: 'Still life',
      deviceType: 'tablet',
      nav: fakeNavigator({ share: () => Promise.reject(new Error('no target app')), writeText }),
    })

    expect(outcome).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(url)
  })

  it('reports failure when there is no clipboard to fall back to', async () => {
    const outcome = await shareOrCopy({
      url, title: 'Still life', deviceType: 'desktop', nav: fakeNavigator({}),
    })

    expect(outcome).toBe('failed')
  })

  it('reports failure when the clipboard write is refused', async () => {
    const outcome = await shareOrCopy({
      url,
      title: 'Still life',
      deviceType: 'desktop',
      nav: fakeNavigator({ writeText: () => Promise.reject(new Error('denied')) }),
    })

    expect(outcome).toBe('failed')
  })
})

describe('shareNoticeFor', () => {
  it('confirms a copy, and says nothing after a system share', () => {
    expect(shareNoticeFor('copied', 'anyone_with_link')).toEqual({
      variant: 'success', message: 'share.copied',
    })
    expect(shareNoticeFor('shared', 'anyone_with_link')).toBeNull()
  })

  it('warns that an invite-only link admits nobody on its own', () => {
    expect(shareNoticeFor('copied', 'invite_only')).toEqual({
      variant: 'warning', message: 'share.copiedInviteOnly',
    })
    // Even when the OS sheet already confirmed the send — the caveat is about
    // the project, not about whether the message went out.
    expect(shareNoticeFor('shared', 'invite_only')).toEqual({
      variant: 'warning', message: 'share.inviteOnly',
    })
  })

  it('stays quiet when the user closed the sheet', () => {
    expect(shareNoticeFor('dismissed', 'invite_only')).toBeNull()
  })

  it('reports a failure in both modes', () => {
    expect(shareNoticeFor('failed', 'anyone_with_link')).toEqual({
      variant: 'error', message: 'share.failed',
    })
    expect(shareNoticeFor('failed', 'invite_only')).toEqual({
      variant: 'error', message: 'share.failed',
    })
  })
})

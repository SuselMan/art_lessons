import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isFullscreen, isFullscreenSupported, subscribeFullscreenChange, toggleFullscreen,
} from './fullscreen'

// (#466) Like gzip.test.ts, this file exists for the branch nothing else runs.
// The suite has no DOM environment at all — 140 test files, all of them node —
// so rather than pull in jsdom for four functions, `document` is stubbed by
// hand. That is cheap here precisely because lib/fullscreen reads the global
// per call instead of capturing it at import time.

interface FakeDocument {
  documentElement: Record<string, unknown>
  fullscreenEnabled?: boolean
  fullscreenElement?: unknown
  exitFullscreen?: () => Promise<void>
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: unknown
  webkitExitFullscreen?: () => Promise<void>
  addEventListener: (type: string, handler: () => void) => void
  removeEventListener: (type: string, handler: () => void) => void
}

type Spelling = 'standard' | 'webkit'

/** The two names for each member of the API. Kept as one table so a test can
 *  ask for a spelling without repeating the mapping four times — and so the
 *  pairing is stated once, where it can be read. */
const NAMES = {
  standard: { enabled: 'fullscreenEnabled', element: 'fullscreenElement', exit: 'exitFullscreen', request: 'requestFullscreen', event: 'fullscreenchange' },
  webkit:   { enabled: 'webkitFullscreenEnabled', element: 'webkitFullscreenElement', exit: 'webkitExitFullscreen', request: 'webkitRequestFullscreen', event: 'webkitfullscreenchange' },
} as const

const listeners = new Map<string, Set<() => void>>()

/** Installs a document carrying exactly one spelling of the API.
 *
 *  The request method goes on `documentElement` and the exit method on the
 *  document, matching the real split: entering is asked of an element, leaving
 *  is asked of the document. */
function install(which: Spelling | 'none') {
  listeners.clear()
  const request = vi.fn(() => Promise.resolve())
  const exit = vi.fn(() => Promise.resolve())
  const fake: FakeDocument = {
    documentElement: {},
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
    },
    removeEventListener: (type, handler) => { listeners.get(type)?.delete(handler) },
  }
  if (which !== 'none') {
    const n = NAMES[which]
    Object.assign(fake, { [n.enabled]: true, [n.element]: null, [n.exit]: exit })
    fake.documentElement[n.request] = request
  }
  globalThis.document = fake as unknown as Document
  return { request, exit, fake }
}

/** Marks something as currently fullscreen under the installed spelling. */
function setActive(fake: FakeDocument, which: Spelling, active: boolean): void {
  Object.assign(fake, { [NAMES[which].element]: active ? fake.documentElement : null })
}

function dispatch(type: string): void {
  for (const handler of listeners.get(type) ?? []) handler()
}

const noDocument = globalThis.document
afterEach(() => {
  globalThis.document = noDocument
  listeners.clear()
})

describe.each<Spelling>(['standard', 'webkit'])('with the %s API only', which => {
  it('reports the browser as capable', () => {
    install(which)
    expect(isFullscreenSupported()).toBe(true)
  })

  it('enters fullscreen through the spelling that exists', async () => {
    const { request, exit } = install(which)

    await expect(toggleFullscreen()).resolves.toBe(true)

    expect(request).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })

  it('leaves fullscreen when something already is', async () => {
    const { request, exit, fake } = install(which)
    setActive(fake, which, true)

    await expect(toggleFullscreen()).resolves.toBe(true)

    expect(exit).toHaveBeenCalledTimes(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('tracks state through the matching change event', () => {
    const { fake } = install(which)
    const seen: boolean[] = []
    const unsubscribe = subscribeFullscreenChange(v => seen.push(v))

    setActive(fake, which, true)
    dispatch(NAMES[which].event)
    setActive(fake, which, false)
    dispatch(NAMES[which].event)
    unsubscribe()
    dispatch(NAMES[which].event)

    // The third dispatch lands after the unsubscribe and must not be recorded:
    // a listener outliving its component keeps writing to a dead setState for
    // the rest of the session.
    expect(seen).toEqual([true, false])
  })
})

describe('with no Fullscreen API at all', () => {
  // iPhone Safari, where only <video> can go fullscreen. The room hides the
  // button rather than leaving it dead, so this check is what decides that.
  it('reports the browser as incapable', () => {
    install('none')
    expect(isFullscreenSupported()).toBe(false)
  })

  it('reports not-fullscreen rather than a truthy undefined', () => {
    install('none')
    // The bug the old inline check carried: `document.fullscreenElement !==
    // null` is `true` when the property does not exist, which would have shown
    // the "exit fullscreen" icon on a browser that never entered it.
    expect(isFullscreen()).toBe(false)
  })

  it('refuses the toggle instead of throwing', async () => {
    install('none')
    await expect(toggleFullscreen()).resolves.toBe(false)
  })
})

describe('when the browser refuses the request', () => {
  it('resolves false rather than rejecting', async () => {
    // A refusal is ordinary — no user gesture, an iframe without
    // allow="fullscreen" — and must not surface as an unhandled rejection in a
    // click handler that has nothing to do about it.
    const { fake } = install('standard')
    fake.documentElement.requestFullscreen = () => Promise.reject(new Error('not allowed'))

    await expect(toggleFullscreen()).resolves.toBe(false)
  })
})

describe('outside a browser altogether', () => {
  it('is inert rather than throwing', async () => {
    // Server-side rendering has no document. Nothing renders this button
    // there today, but every entry point here reads a global that may not
    // exist, and a module that throws on import is a blank page.
    Reflect.deleteProperty(globalThis, 'document')

    expect(isFullscreenSupported()).toBe(false)
    expect(isFullscreen()).toBe(false)
    await expect(toggleFullscreen()).resolves.toBe(false)
    expect(subscribeFullscreenChange(() => {})()).toBeUndefined()
  })
})

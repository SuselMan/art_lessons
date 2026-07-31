import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// (#377) jsdom is not used (vitest env is 'node' — see root vitest.config.ts),
// and this module reaches for `window`/`history` at import time, so the fake
// below is installed on globalThis *before* each dynamic import of it. The
// module registers its popstate listener once, at module load, and keeps its
// armed URL in module state — hence vi.resetModules() + await import() per
// test rather than a top-level import.
//
// A fake rather than a mock: what's being tested is the interaction between
// pushState's truncate-and-append and the browser's history depth, and
// asserting "pushState was called" would prove none of it. In particular
// `back()` models the one behavior the whole fix turns on — going back from
// the very first entry leaves the site and fires no popstate at all.
interface FakeBrowser {
  /** Presses back. Returns whether the user is still on our site. */
  back: () => 'stayed' | 'left the site'
  url: () => string
  depth: () => number
}

function installFakeBrowser(initialUrl: string): FakeBrowser {
  const entries = [initialUrl]
  let index = 0
  const listeners: Array<() => void> = []

  const history = {
    pushState(_state: unknown, _title: string, url: string): void {
      // Real pushState drops everything ahead of the current entry, then
      // appends. The truncation is why the depth stays flat instead of
      // growing on every blocked gesture.
      entries.splice(index + 1)
      entries.push(url)
      index = entries.length - 1
    },
  }

  const window = {
    addEventListener(type: string, listener: () => void): void {
      if (type === 'popstate') listeners.push(listener)
    },
  }

  // One documented cast for the whole file: `window` and `history` are bare
  // globals to the module under test, and node has neither.
  const globals = globalThis as unknown as { window: unknown; history: unknown }
  globals.window = window
  globals.history = history

  return {
    back() {
      if (index === 0) return 'left the site'
      index -= 1
      listeners.forEach(fn => fn())
      return 'stayed'
    },
    url: () => entries[index],
    depth: () => entries.length,
  }
}

const ROOM = '/room/abc123'

async function loadGuard() {
  vi.resetModules()
  return import('./backNavigationGuard')
}

describe('backNavigationGuard', () => {
  let browser: FakeBrowser

  beforeEach(() => {
    browser = installFakeBrowser(ROOM)
  })

  afterEach(() => {
    const globals = globalThis as unknown as { window?: unknown; history?: unknown }
    delete globals.window
    delete globals.history
  })

  it('leaves back navigation alone while disarmed', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    setBackNavigationGuard(null)

    // Depth 1 and nothing armed: back walks off the site, which is exactly
    // what should happen outside the editor.
    expect(browser.back()).toBe('left the site')
  })

  it('pushes a spare entry when armed, so a room opened by direct link has one to consume', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    // Depth 1 is the student's case: room link opened from a messenger, join
    // gate and editor share this URL, nothing ever navigated.
    expect(browser.depth()).toBe(1)

    setBackNavigationGuard(ROOM)

    expect(browser.depth()).toBe(2)
    expect(browser.back()).toBe('stayed')
    expect(browser.url()).toBe(ROOM)
  })

  it('never runs out of history however many times the gesture fires', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    setBackNavigationGuard(ROOM)

    for (let i = 0; i < 20; i++) {
      expect(browser.back()).toBe('stayed')
      expect(browser.url()).toBe(ROOM)
    }
    // Flat, not growing: each blocked gesture consumes one entry and pushes
    // one back.
    expect(browser.depth()).toBe(2)
  })

  it('keeps the page the user came from reachable, but not by the gesture', async () => {
    // The teacher's path: /create pushed an entry before navigating here, so
    // there is a real previous page behind the room. The spare sits between
    // them, which is what makes the gesture a no-op — it never gets far
    // enough back to reach /create.
    const withPrevious = installFakeBrowser('/create')
    const { setBackNavigationGuard } = await loadGuard()
    const globals = globalThis as unknown as { history: { pushState: (s: unknown, t: string, u: string) => void } }
    globals.history.pushState(null, '', ROOM)

    setBackNavigationGuard(ROOM)
    for (let i = 0; i < 5; i++) withPrevious.back()
    expect(withPrevious.url()).toBe(ROOM)

    // Not destroyed, just out of the gesture's reach: once the room unmounts,
    // the way back to /create is still there.
    setBackNavigationGuard(null)
    withPrevious.back()
    withPrevious.back()
    expect(withPrevious.url()).toBe('/create')
  })

  it('does not push a second spare when re-armed for the same URL', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    setBackNavigationGuard(ROOM)
    const afterFirstArm = browser.depth()

    // A rename or a fresh room_state re-runs the arming effect; the history
    // must not grow an entry every time it does.
    setBackNavigationGuard(ROOM)
    setBackNavigationGuard(ROOM)

    expect(browser.depth()).toBe(afterFirstArm)
  })

  it('pushes a fresh spare for a different room', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    setBackNavigationGuard(ROOM)
    const other = '/room/xyz789'

    setBackNavigationGuard(other)

    expect(browser.back()).toBe('stayed')
    expect(browser.url()).toBe(other)
  })

  it('stops interfering once disarmed', async () => {
    const { setBackNavigationGuard } = await loadGuard()
    setBackNavigationGuard(ROOM)
    setBackNavigationGuard(null)

    // The spare survives (history entries can't be un-pushed), so the first
    // back is absorbed by it — but it is no longer replaced, so the next one
    // leaves, and the room is no longer trapping anyone.
    expect(browser.back()).toBe('stayed')
    expect(browser.back()).toBe('left the site')
  })
})

// (#400) The whole decision is three cases, and each one exists because the
// other two get it wrong. Asserted here rather than read off the
// implementation because the failure mode is a later edit collapsing them back
// into one rule — which is what #48 shipped, and what cost two wrong readings
// of production.
import { describe, expect, it } from 'vitest'

import { RESUME_HIDDEN_MS, decideUpdateAction, isResumeFromBackground } from './updatePolicy'

describe('decideUpdateAction (#400)', () => {
  it('applies silently when nothing is at risk, tab or installed alike', () => {
    expect(decideUpdateAction({ reloadUnsafe: false, installed: false })).toBe('apply')
    expect(decideUpdateAction({ reloadUnsafe: false, installed: true })).toBe('apply')
  })

  it('never offers in a browser tab', () => {
    // The platform activates the waiting worker when the last tab closes, so
    // the offer would only be asking the user to do the browser's job — on the
    // one screen where saying yes actually costs something.
    expect(decideUpdateAction({ reloadUnsafe: true, installed: false })).toBe('wait')
  })

  it('offers in an installed app that is holding a room', () => {
    // The only case with no way out on its own: an installed app may never be
    // closed, so waiting here means waiting forever.
    expect(decideUpdateAction({ reloadUnsafe: true, installed: true })).toBe('prompt')
  })
})

describe('isResumeFromBackground (#515)', () => {
  it('treats a return from a minute or more away as a resume', () => {
    expect(isResumeFromBackground(RESUME_HIDDEN_MS)).toBe(true)
    expect(isResumeFromBackground(60 * 60 * 1000)).toBe(true)
  })

  it('does not, for the pick-up-and-put-down flicker the check floor exists for', () => {
    // A tablet being handled fires visibilitychange seconds apart, and every
    // one of those would otherwise be a network request.
    expect(isResumeFromBackground(0)).toBe(false)
    expect(isResumeFromBackground(3_000)).toBe(false)
  })

  it('does not depend on the app being installed', () => {
    // An installed app is the case that motivates it — it is never closed, so
    // this is its only chance — but a long-backgrounded tab is stale for the
    // same reason and gains the same thing. Deliberately one rule, so there is
    // no second code path that only ever runs on a device nobody debugs on.
    expect(isResumeFromBackground(RESUME_HIDDEN_MS - 1)).toBe(false)
  })
})

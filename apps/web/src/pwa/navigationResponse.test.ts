// (#502) The ordering rule, asserted directly.
//
// The first test is the regression itself and is worth reading as such: before
// this change the worker answered every navigation from the precache, so a tab
// opened after a deploy ran the previous build for as long as any older tab
// held the old worker active. `serves the network answer, not the cached shell`
// fails against that behaviour — which is the only reason to trust it now.
import { describe, expect, it } from 'vitest'

import { resolveNavigation } from './navigationResponse'

/** A promise that never settles — the network on a connection that is up and
 *  not delivering, and the expiry on every test that must not time out. */
const never = new Promise<never>(() => {})
/** Already elapsed: the expiry for a test about what happens after the wait. */
const elapsed = Promise.resolve()

describe('resolveNavigation', () => {
  it('serves the network answer, not the cached shell', async () => {
    const answer = await resolveNavigation({
      network: Promise.resolve('fresh index.html'),
      shell: () => Promise.resolve('precached index.html'),
      expiry: never,
    })
    expect(answer).toBe('fresh index.html')
  })

  it('does not even look in the cache while the network is answering', async () => {
    let looked = false
    await resolveNavigation({
      network: Promise.resolve('fresh'),
      shell: () => {
        looked = true
        return Promise.resolve('precached')
      },
      expiry: never,
    })
    expect(looked).toBe(false)
  })

  it('falls back to the shell when the network fails', async () => {
    // Offline. This is the cold start #48 bought (PWA-READINESS §2.5) and the
    // reason index.html is still precached at all.
    const answer = await resolveNavigation({
      network: Promise.resolve(null),
      shell: () => Promise.resolve('precached'),
      expiry: never,
    })
    expect(answer).toBe('precached')
  })

  it('falls back to the shell when the network stops delivering', async () => {
    // Up, connected, and silent — the case a plain `await fetch()` turns into a
    // page that hangs. A slightly old build beats a white screen.
    const answer = await resolveNavigation({ network: never, shell: () => Promise.resolve('precached'), expiry: elapsed })
    expect(answer).toBe('precached')
  })

  it('waits the network out when there is no shell to fall back to', async () => {
    // A denylisted URL, or a first visit that went offline mid-install. The
    // timeout limits how long the user stares at nothing; with nothing to show
    // them it buys nothing.
    const answer = await resolveNavigation({
      network: Promise.resolve('slow but real'),
      shell: () => Promise.resolve(null),
      expiry: elapsed,
    })
    expect(answer).toBe('slow but real')
  })

  it('reports nothing at all when neither source can answer', async () => {
    const answer = await resolveNavigation({
      network: Promise.resolve(null),
      shell: () => Promise.resolve(null),
      expiry: elapsed,
    })
    expect(answer).toBeNull()
  })
})

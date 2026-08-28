import { describe, expect, it, vi } from 'vitest'

import {
  DEV_VERSION, VERSION_PATTERN, exposeAppVersion, isDeployedBuild, resolveAppVersion,
} from './appVersion'

describe('app version (#515)', () => {
  it('uses the version CI injected', () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: '2026.08.28-7041f19' })).toBe('2026.08.28-7041f19')
  })

  it('says "dev" when nothing injected one, rather than inventing a number', () => {
    // A local `npm run dev` and a local `npm run build` both land here. The
    // string has to be one nobody could mistake for a deploy: a made-up
    // version that cannot be traced back to a commit is worse than no version,
    // because it is the kind of thing that gets quoted in a bug report.
    expect(resolveAppVersion({})).toBe(DEV_VERSION)
    expect(resolveAppVersion({ VITE_APP_VERSION: '' })).toBe(DEV_VERSION)
    expect(resolveAppVersion({ VITE_APP_VERSION: '   ' })).toBe(DEV_VERSION)
  })

  it('agrees with the format deploy.yml produces', () => {
    // Guards the contract from this side: the workflow builds
    // `$(date -u +%Y.%m.%d)-$(git rev-parse --short=7 HEAD)`, and the deploy
    // report quotes it back for comparison against what Settings shows. A
    // change to either half that does not change the other is the failure this
    // catches.
    expect('2026.08.28-7041f19').toMatch(VERSION_PATTERN)
    expect(DEV_VERSION).not.toMatch(VERSION_PATTERN)
  })

  it('only offers the update check on a build that could have one', () => {
    // There is no service worker in dev (devOptions.enabled: false), so a
    // check button there is a control that can only ever report 'unavailable'.
    expect(isDeployedBuild('2026.08.28-7041f19')).toBe(true)
    expect(isDeployedBuild(DEV_VERSION)).toBe(false)
  })

  it('puts the version on globalThis for a console or a CDP session to read', () => {
    // The whole point of the version is being readable on the machine that has
    // the problem, which is never the one debugging it. Settings covers a
    // person holding the tablet; this covers everything else — a remote CDP
    // attach, a paste from devtools, a bug report.
    exposeAppVersion('2026.08.28-7041f19')
    expect(globalThis.__APP_VERSION__).toBe('2026.08.28-7041f19')
    vi.unstubAllGlobals()
  })
})

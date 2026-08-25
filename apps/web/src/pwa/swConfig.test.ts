// (#48, #502) Guards the two mistakes in this area that are invisible where
// they are made and expensive where they land.
//
// The precache-size one costs users: the build succeeds, the app works, the
// service worker registers, and the damage only shows up as a 12 MB first visit
// on someone else's mobile data — or, on iOS, as a quota rejection that fails
// the whole precache install and leaves the app with no offline support at all.
//
// The routing one costs trust in the console: a route that exists at all means
// Workbox proxies the request and turns a network blip into an unhandled
// rejection (#383), and a route pointed at the API means one person's session
// answered from cache on a shared tablet.
//
// Deliberately asserted against the config rather than the generated sw.js:
// the CI test job runs before the build job and never sees dist/, so a check
// on the output would have skipped in exactly the situation it was written
// for. That is also why sw.ts registers routes only out of `runtimeRoutes` —
// see the module's own header.
import { describe, expect, it } from 'vitest'

import {
  APP_SHELL_FALLBACK,
  PAPER_TEXTURE_MAX_ENTRIES,
  isNavigationFallbackDenied,
  precacheConfig,
  runtimeRoutes,
} from './swConfig'

/** Rough stand-in for Workbox's own glob matching — enough to answer "would
 *  this pattern take this file", which is all these assertions ask. */
function matches(pattern: string, path: string): boolean {
  const braces = pattern.replace(/\{([^}]+)\}/g, (_, alts: string) => `(${alts.split(',').join('|')})`)
  const rx = new RegExp(
    '^' +
      braces
        .replace(/\./g, '\\.')
        .replace(/\*\*\//g, '§§')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/§§/g, '(?:.*/)?') +
      '$',
  )
  return rx.test(path)
}

const anyPatternTakes = (path: string) => precacheConfig.globPatterns!.some((p) => matches(p, path))
const anyIgnoreDrops = (path: string) => precacheConfig.globIgnores!.some((p) => matches(p, path))
const isPrecached = (path: string) => anyPatternTakes(path) && !anyIgnoreDrops(path)

/** The runtime route sw.ts would hand `href` to, or undefined if none claims
 *  it — an unrouted request never reaches a cache at all. */
const routeMatching = (href: string) => runtimeRoutes.find((route) => route.match(new URL(href)))

describe('service worker precache', () => {
  it('would actually catch the regression it is guarding against', () => {
    // Without this the suite could pass on a broken matcher that answers
    // "no" to everything. `**/*` is the default these configs ship with and
    // the exact mistake the module exists to prevent — it must read as
    // taking a texture, while the real pattern list must not.
    expect(matches('**/*', 'paper/coarse.d93ef331.paper')).toBe(true)
    expect(matches('paper/*.paper', 'paper/coarse.d93ef331.paper')).toBe(true)
    expect(matches('paper/*.paper', 'paper/manifest.json')).toBe(false)
    expect(anyPatternTakes('assets/index-BHj3OlKJ.js')).toBe(true)
  })

  it('never takes a baked paper texture', () => {
    // ~4 MB each, three of them. This is the whole reason the precache is
    // enumerated instead of inherited.
    expect(isPrecached('paper/coarse.d93ef331.paper')).toBe(false)
  })

  it('never takes the dev-only grain variants', () => {
    // 69 MB, gitignored, present only on a developer's machine — so a rule
    // debugged against a local dist has to reject them explicitly rather than
    // happen to not meet them.
    expect(isPrecached('paper-variants/rough-v7.paper')).toBe(false)
  })

  it('does take the paper previews, the shell and the icon font', () => {
    // The other half of the trade: these are what make an offline cold start
    // show a working paper picker instead of broken thumbnails.
    for (const path of [
      'paper/coarse.6e885150.preview',
      'index.html',
      'assets/index-BHj3OlKJ.js',
      'assets/material-symbols-subset-vrNBW_Zh.woff2',
      'manifest.webmanifest',
      'icon-512.png',
    ]) {
      expect(isPrecached(path), path).toBe(true)
    }
  })
})

describe('service worker routing', () => {
  it('keeps the texture cache bounded and content-addressed', () => {
    const textures = routeMatching('https://x/paper/coarse.d93ef331.paper')
    expect(textures?.strategy).toBe('CacheFirst')
    // Unbounded would mean every paper ever opened, forever. Three is how many
    // exist, so this is "all of them" — the bound matters if that number grows.
    expect(textures?.maxEntries).toBe(PAPER_TEXTURE_MAX_ENTRIES)
    expect(PAPER_TEXTURE_MAX_ENTRIES).toBeLessThanOrEqual(3)
  })

  it('routes nothing at the API or the socket handshake', () => {
    // (#383) Two requirements in one assertion, and the stronger one is the
    // reason it reads as "no route" rather than "a NetworkOnly route".
    //
    // The original: a cached /api/me would hand one person's session to the
    // next visitor on a shared tablet. Not matching satisfies that outright —
    // an unrouted request is never even offered to a cache, and unlike a rule
    // with a handler, it cannot be given a caching one by a later edit.
    //
    // The one that replaced it: a matched route means Workbox proxies the
    // request through its own fetch and turns every network failure into an
    // unhandled WorkboxError. See swConfig.ts for what that did to the console
    // on a flaky connection.
    expect(routeMatching('https://x/api/me'), '/api/me is routed').toBeUndefined()
    expect(routeMatching('https://x/socket.io/?EIO=4'), 'socket.io is routed').toBeUndefined()
    // The matcher has to be able to say "yes", or the two above pass on a
    // helper that answers "no" to everything — the same self-check the glob
    // assertions above make.
    expect(routeMatching('https://x/paper/manifest.json')).toBeDefined()
  })

  it('never serves the paper manifest CacheFirst', () => {
    // It is the one unhashed pointer into an immutably-cached set: a stale
    // copy names files a later deploy deleted, which is a 404 and no paper at
    // all, not a cosmetic staleness. Precaching has the same effect, so the
    // manifest must not be reachable by a glob either.
    expect(routeMatching('https://x/paper/manifest.json')?.strategy).toBe('NetworkFirst')
    expect(anyPatternTakes('paper/manifest.json')).toBe(false)
  })
})

describe('navigation fallback', () => {
  it('has a precached shell to fall back to', () => {
    // (#502) The document is answered from the network now, and the precached
    // copy exists for exactly one purpose: the offline cold start #48 bought
    // (PWA-READINESS §2.5). Dropping index.html from the globs would leave the
    // fallback branch in sw.ts reaching for something that is not there, and
    // nothing else in this file would notice.
    expect(isPrecached(APP_SHELL_FALLBACK.replace(/^\//, ''))).toBe(true)
  })

  it('never answers the API or the socket handshake with the shell', () => {
    // Answering /api with index.html would hand a JSON parser an HTML body —
    // the same trap paperLoader.ts documents for a dev server's SPA fallback.
    // Only reachable by typing one into the address bar while offline, and
    // still worth a network error instead of a lie.
    expect(isNavigationFallbackDenied(new URL('https://x/api/me'))).toBe(true)
    expect(isNavigationFallbackDenied(new URL('https://x/socket.io/?EIO=4'))).toBe(true)
    expect(isNavigationFallbackDenied(new URL('https://x/my-lessons'))).toBe(false)
    expect(isNavigationFallbackDenied(new URL('https://x/room/abc123'))).toBe(false)
  })
})

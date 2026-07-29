// (#48) Guards the precache-size trap, which is the one mistake in this area
// that costs users rather than developers.
//
// Every assertion here exists because the failure it describes is invisible
// locally: the build succeeds, the app works, the service worker registers,
// and the damage only shows up as a 22 MB first visit on someone else's
// mobile data — or, on iOS, as a quota rejection that fails the whole
// precache install and leaves the app with no offline support at all.
//
// Deliberately asserted against the config rather than the generated sw.js:
// the CI test job runs before the build job and never sees dist/, so a check
// on the output would have skipped in exactly the situation it was written
// for. See the module's own header.
import { describe, expect, it } from 'vitest'

import { PAPER_TEXTURE_MAX_ENTRIES, workboxConfig } from './workboxConfig'

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

const anyPatternTakes = (path: string) => workboxConfig.globPatterns!.some((p) => matches(p, path))
const anyIgnoreDrops = (path: string) => workboxConfig.globIgnores!.some((p) => matches(p, path))

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
    // ~7.4 MB each, three of them. This is the whole reason the precache is
    // enumerated instead of inherited.
    const texture = 'paper/coarse.d93ef331.paper'
    expect(anyPatternTakes(texture) && !anyIgnoreDrops(texture)).toBe(false)
  })

  it('never takes the dev-only grain variants', () => {
    // 69 MB, gitignored, present only on a developer's machine — so a rule
    // debugged against a local dist has to reject them explicitly rather than
    // happen to not meet them.
    const variant = 'paper-variants/rough-v7.paper'
    expect(anyPatternTakes(variant) && !anyIgnoreDrops(variant)).toBe(false)
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
      expect(anyPatternTakes(path) && !anyIgnoreDrops(path), path).toBe(true)
    }
  })

  it('keeps the texture cache bounded', () => {
    const textures = workboxConfig.runtimeCaching!.find((r) => r.options?.cacheName === 'paper-textures')
    expect(textures?.handler).toBe('CacheFirst')
    // Unbounded would mean every paper ever opened, forever. Three is how many
    // exist, so this is "all of them" — the bound matters if that number grows.
    expect(textures?.options?.expiration?.maxEntries).toBe(PAPER_TEXTURE_MAX_ENTRIES)
    expect(PAPER_TEXTURE_MAX_ENTRIES).toBeLessThanOrEqual(3)
  })

  it('never serves the API or the socket handshake from cache', () => {
    const api = workboxConfig.runtimeCaching!.find((r) => r.handler === 'NetworkOnly')
    expect(api, 'no NetworkOnly rule at all').toBeDefined()
    // A cached /api/me would hand one person's session to the next visitor on
    // a shared tablet, which is the failure this rule exists to prevent.
    const asRoute = api!.urlPattern as (opts: { url: URL }) => boolean
    expect(asRoute({ url: new URL('https://x/api/me') })).toBe(true)
    expect(asRoute({ url: new URL('https://x/socket.io/?EIO=4') })).toBe(true)
    expect(asRoute({ url: new URL('https://x/paper/manifest.json') })).toBe(false)
  })

  it('never serves the paper manifest CacheFirst', () => {
    // It is the one unhashed pointer into an immutably-cached set: a stale
    // copy names files a later deploy deleted, which is a 404 and no paper at
    // all, not a cosmetic staleness. Precaching has the same effect, so the
    // manifest must not be reachable by a glob either.
    const manifest = workboxConfig.runtimeCaching!.find((r) => r.options?.cacheName === 'paper-manifest')
    expect(manifest?.handler).toBe('NetworkFirst')
    expect(anyPatternTakes('paper/manifest.json')).toBe(false)
  })

  it('falls back to the app shell for navigation, but not for the API', () => {
    expect(workboxConfig.navigateFallback).toBe('/index.html')
    // Answering /api with index.html would hand a JSON parser an HTML body —
    // the same trap paperLoader.ts documents for a dev server's SPA fallback.
    const denied = workboxConfig.navigateFallbackDenylist!
    expect(denied.some((rx) => rx.test('/api/me'))).toBe(true)
    expect(denied.some((rx) => rx.test('/socket.io/'))).toBe(true)
    expect(denied.some((rx) => rx.test('/my-lessons'))).toBe(false)
  })
})

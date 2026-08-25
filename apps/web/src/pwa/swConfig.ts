// (#48, #502) What the service worker precaches, what it must never cache, and
// which URLs get a runtime strategy.
//
// This lives in its own module rather than inline in vite.config.ts or sw.ts so
// it can be asserted without running a build and without a worker global. That
// is not tidiness: the failures it guards against are silent.
//
// Widening `globPatterns` to `**/*` — the default most PWA setups ship with —
// would pull the paper bake into the precache, and everything would still work
// perfectly on a developer's wifi. The bill arrives as 12 MB on a first visit
// over mobile data, and on iOS as a storage quota rejection that takes the
// whole precache down with it. The CI test job runs before the build job and
// never sees `dist/`, so a check against the generated sw.js would have skipped
// in exactly the place it was needed.
//
// The runtime routes are here for a second reason on top of that one: sw.ts
// registers routes *only* from `runtimeRoutes` below, which is what lets
// swConfig.test.ts assert the thing #383 paid for — that nothing at all claims
// `/api/` or `/socket.io/`. A route registered by hand inside the worker would
// be invisible to that test.
//
// See docs/PWA-READINESS.md §2.2 for the precache numbers.
import type { VitePWAOptions } from 'vite-plugin-pwa'

type InjectManifestConfig = NonNullable<VitePWAOptions['injectManifest']>

/** Handed to `injectManifest` in vite.config.ts. Only the glob half: in
 *  `injectManifest` mode workbox-build generates the precache manifest and
 *  nothing else, and every routing decision below is made by sw.ts. */
export const precacheConfig: Pick<InjectManifestConfig, 'globPatterns' | 'globIgnores'> = {
  // Enumerated, not inherited. `.paper` is deliberately absent from these
  // extensions: those are the 4 MB textures, handled at runtime below.
  //
  // `webmanifest` is here on purpose — an installed app launched offline still
  // has its manifest fetched, and a miss there is what makes the launcher fall
  // back to a bare-bones window.
  //
  // `index.html` is precached too, but since #502 it is no longer what a
  // navigation is normally answered with — see APP_SHELL_FALLBACK.
  globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}', 'paper/*.preview'],
  globIgnores: [
    // The bake's textures. `paper/*.paper` rather than `paper/**` — the
    // previews matched above are wanted, these are not.
    'paper/*.paper',
    // Dev-only grain-variant bake (69 MB, gitignored, never built in CI).
    // Listed even though CI never produces it: `npm run build` locally and in
    // CI yield different file sets, and a rule debugged against the local
    // dist has to survive the directory simply not being there.
    'paper-variants/**',
    // Uploaded to Sentry and deleted before deploy, but a local build still
    // has them on disk when this manifest is generated.
    '**/*.map',
  ],
}

export const PAPER_TEXTURES_CACHE = 'paper-textures'
export const PAPER_MANIFEST_CACHE = 'paper-manifest'

/** How many baked textures the runtime cache keeps. A room uses exactly one
 *  (its own PaperType), and three is how many exist — so the ceiling is
 *  "every paper the user has actually opened", ~4 MB in the common case
 *  and ~12 MB only for someone who has opened all three. */
export const PAPER_TEXTURE_MAX_ENTRIES = 3

/** A URL the worker answers from a cache, and how.
 *
 *  Deliberately narrower than Workbox's own `RuntimeCaching`: this is a list of
 *  decisions someone has to justify, not a config surface. Anything not
 *  expressible here has not been argued for yet. */
export interface RuntimeRoute {
  /** The Cache Storage bucket responses land in. Also how the test finds a
   *  route, so it doubles as the route's name. */
  cacheName: string
  /** Whether this route claims the URL. A callback rather than a RegExp so it
   *  reads the way the reasoning does: "the bake's textures", not a pattern to
   *  re-derive. */
  match: (url: URL) => boolean
  strategy: 'CacheFirst' | 'NetworkFirst'
  /** CacheFirst only: cap on stored entries, so the cache cannot grow into
   *  "every asset ever fetched, forever". */
  maxEntries?: number
  /** CacheFirst only: keep byte ranges answerable from the cache. */
  rangeRequests?: boolean
  /** NetworkFirst only: how long to wait before falling back to the cache. */
  networkTimeoutSeconds?: number
}

export const runtimeRoutes: RuntimeRoute[] = [
  {
    // CacheFirst is only safe here because #322 made these names
    // content-hashed: a byte-identical URL can no longer change meaning, so
    // "cache indefinitely" cannot go stale. Before that it would have been
    // strictly worse than the HTTP cache — indefinite instead of a day.
    cacheName: PAPER_TEXTURES_CACHE,
    match: (url) => url.pathname.startsWith('/paper/') && url.pathname.endsWith('.paper'),
    strategy: 'CacheFirst',
    maxEntries: PAPER_TEXTURE_MAX_ENTRIES,
    // paperLoader.ts counts bytes against Content-Length to drive the download
    // bar (#345); range support has to survive the worker for a cached response
    // to still report a size.
    rangeRequests: true,
  },
  {
    // The bake's manifest — the one unhashed pointer into that immutable set,
    // and deliberately NOT precached.
    //
    // PWA-READINESS §2.2 asks for it in the precache so the previews stay
    // reachable offline. That trade is wrong in one direction: a precache entry
    // only refreshes when the worker itself does, so a client still on an older
    // worker would keep reading a manifest naming files the last
    // `rsync --delete` removed. paperLoader.ts recovers from a missing asset by
    // re-reading the manifest — which would hit the same stale entry and
    // recover into the same 404.
    //
    // NetworkFirst gives both halves: online it is always the running deploy's
    // manifest, offline it falls back to the last good copy, which is what
    // keeps the precached previews reachable. The cost is one round-trip for
    // 535 bytes.
    cacheName: PAPER_MANIFEST_CACHE,
    match: (url) => url.pathname === '/paper/manifest.json',
    strategy: 'NetworkFirst',
    networkTimeoutSeconds: 5,
  },
  // (#383) There is deliberately no route for /api/ or /socket.io/ here.
  //
  // There used to be one — `handler: 'NetworkOnly'`, under a comment saying
  // "never let Workbox near the API or the socket handshake". It did keep them
  // out of every cache, which is the requirement and still holds, but it got
  // there by the opposite means: a route is a *registered* route, so Workbox
  // took the request, ran it through its own fetch, and on any network failure
  // threw WorkboxError('no-response') into a promise nobody awaits. On a flaky
  // connection that fills the console with `Uncaught (in promise) no-response`
  // — one per failed poll, and socket.io polls on every reconnect — burying
  // real errors and spending Sentry quota on a client-side network blip.
  // Observed on prod 03.08: 17 such rejections, none of whose requests ever
  // reached nginx.
  //
  // Matching no route is what "never let Workbox near it" actually spells: the
  // Router then never calls respondWith, the request goes straight to the
  // network as if no worker existed, and a failure stays an ordinary
  // ERR_FAILED that socket.io's own reconnect logic already handles. It is also
  // strictly safer for the caching requirement — a route that exists can be
  // given the wrong handler later; one that doesn't cannot.
  //
  // The socket's long-polling transport is the concrete reason this is not
  // merely cosmetic: a poll holds a request open for up to 25 s, and the
  // browser is free to evict and respawn the worker underneath it.
  // swConfig.test.ts asserts the absence, since absence is exactly the kind of
  // thing a later edit restores without noticing.
]

/** The precached document a navigation falls back to when the network will not
 *  answer. Only when — see sw.ts for why this is a fallback rather than the
 *  first answer, which is the whole of #502. */
export const APP_SHELL_FALLBACK = '/index.html'

/** How long a navigation waits for the network before serving the precached
 *  shell instead.
 *
 *  This is the one place freshness is traded away, and only against a worse
 *  outcome: on a connection that is technically up but not delivering, the
 *  alternative to a slightly old build is a page that hangs. Five seconds is
 *  long enough that a normal mobile round-trip never reaches it, and short
 *  enough to be under the "is this broken?" threshold. */
export const NAVIGATION_TIMEOUT_MS = 5000

/** Paths that must never be answered with the app shell, even offline.
 *
 *  These are not navigations in normal use — nothing in the app links to them —
 *  but a person can type one into the address bar, and handing a JSON parser an
 *  HTML body is the same trap paperLoader.ts documents for a dev server's SPA
 *  fallback. Offline they get a network error, which is the truth. */
export const NAVIGATION_FALLBACK_DENYLIST = [/^\/api\//, /^\/socket\.io\//]

export function isNavigationFallbackDenied(url: URL): boolean {
  return NAVIGATION_FALLBACK_DENYLIST.some((rx) => rx.test(url.pathname))
}

// (#48) What the service worker caches, and what it must never cache.
//
// This lives in its own module rather than inline in vite.config.ts so it can
// be asserted without running a build. That is not tidiness: the failure this
// guards against is silent. Widening `globPatterns` to `**/*` — the default
// most PWA setups ship with — would pull the paper bake into the precache,
// and everything would still work perfectly on a developer's wifi. The bill
// arrives as 22 MB on a first visit over mobile data, and on iOS as a storage
// quota rejection that takes the whole precache down with it. The CI test job
// runs before the build job and never sees `dist/`, so a check against the
// generated sw.js would have skipped in exactly the place it was needed.
//
// See docs/PWA-READINESS.md §2.2 for the full reasoning and the numbers.
import type { VitePWAOptions } from 'vite-plugin-pwa'

type WorkboxConfig = NonNullable<VitePWAOptions['workbox']>

export const PAPER_TEXTURES_CACHE = 'paper-textures'
export const PAPER_MANIFEST_CACHE = 'paper-manifest'

/** How many baked textures the runtime cache keeps. A room uses exactly one
 *  (its own PaperType), and three is how many exist — so the ceiling is
 *  "every paper the user has actually opened", ~7.4 MB in the common case
 *  and ~22 MB only for someone who has opened all three. */
export const PAPER_TEXTURE_MAX_ENTRIES = 3

export const workboxConfig: WorkboxConfig = {
  // Enumerated, not inherited. `.paper` is deliberately absent from these
  // extensions: those are the 7.4 MB textures, handled at runtime below.
  //
  // `webmanifest` is here on purpose — an installed app launched offline still
  // has its manifest fetched, and a miss there is what makes the launcher fall
  // back to a bare-bones window.
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
  // A cold start with no network has to reach our own UI rather than the
  // browser's error page — the one thing #201/#313 could not fix from inside
  // the app, because nothing of ours ran at all (PWA-READINESS §2.5).
  navigateFallback: '/index.html',
  // The API is denylisted so a failed request surfaces as a failed request.
  // Answering it with index.html would hand a JSON parser an HTML body, which
  // is the same trap paperLoader.ts already documents for the paper manifest.
  navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
  runtimeCaching: [
    {
      // CacheFirst is only safe here because #322 made these names
      // content-hashed: a byte-identical URL can no longer change meaning, so
      // "cache indefinitely" cannot go stale. Before that it would have been
      // strictly worse than the HTTP cache — indefinite instead of a day.
      urlPattern: ({ url }) => url.pathname.startsWith('/paper/') && url.pathname.endsWith('.paper'),
      handler: 'CacheFirst',
      options: {
        cacheName: PAPER_TEXTURES_CACHE,
        expiration: { maxEntries: PAPER_TEXTURE_MAX_ENTRIES, purgeOnQuotaError: true },
        // Without this an errored response would be stored as if it were the
        // texture, and CacheFirst would then serve that failure forever.
        cacheableResponse: { statuses: [200] },
        // paperLoader.ts counts bytes against Content-Length to drive the
        // download bar (#345); range support has to survive the worker for a
        // cached response to still report a size.
        rangeRequests: true,
      },
    },
    {
      // The bake's manifest — the one unhashed pointer into that immutable
      // set, and deliberately NOT precached.
      //
      // PWA-READINESS §2.2 asks for it in the precache so the previews stay
      // reachable offline. That trade is wrong in one direction: a precache
      // entry only refreshes when the worker itself does, so a client still on
      // an older worker would keep reading a manifest naming files the last
      // `rsync --delete` removed. paperLoader.ts recovers from a missing asset
      // by re-reading the manifest — which would hit the same stale entry and
      // recover into the same 404.
      //
      // NetworkFirst gives both halves: online it is always the running
      // deploy's manifest, offline it falls back to the last good copy, which
      // is what keeps the precached previews reachable. The cost is one
      // round-trip for 535 bytes.
      urlPattern: ({ url }) => url.pathname === '/paper/manifest.json',
      handler: 'NetworkFirst',
      options: {
        cacheName: PAPER_MANIFEST_CACHE,
        networkTimeoutSeconds: 5,
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      // Never let Workbox near the API or the socket handshake. Both are
      // per-request and identity-bearing: a cached /api/me would hand one
      // person's session to the next visitor on a shared tablet.
      urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/'),
      handler: 'NetworkOnly',
    },
  ],
}

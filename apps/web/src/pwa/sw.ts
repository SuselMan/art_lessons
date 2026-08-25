/// <reference lib="webworker" />
// (#48, #502) The service worker itself.
//
// Written by hand (`strategies: 'injectManifest'`) rather than generated,
// because the one routing decision that matters here cannot be expressed in
// `generateSW`'s config: **a navigation must not be answered from the cache
// while there is a network.**
//
// #502 is what that costs when it is not true. A newly opened tab is controlled
// by the *active* worker — the old one, since a new worker sits in `waiting`
// for as long as any client is still around — and `generateSW`'s
// `navigateFallback` makes that worker answer the navigation out of its own
// precache. The precached index.html names last deploy's hashed chunks, so the
// fresh tab boots the previous build in full. `skipWaiting` does not help this
// load either: the document is served before a new worker could activate. It
// cost two wrong conclusions about production — #294 on 30.07 and the
// join-request run recorded in #314 §6 — both drawn from a pre-deploy bundle
// with `registration.waiting` set and nobody having clicked.
//
// Network-first on the document fixes it at the root: a fresh tab gets a fresh
// index.html, which names hashed asset URLs that are in nobody's precache, so
// they come from the network too. The new build then runs regardless of which
// worker generation is active and regardless of how many old tabs are open.
//
// It does *not* reload tabs that are already open, and must not: a room
// mid-lesson has operations in flight (#313). That decision stays where #400
// put it — lib/registerServiceWorker.ts + pwa/updatePolicy.ts.
//
// What is cached, and what must never be, lives in swConfig.ts next to its
// test.
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { enable as enableNavigationPreload } from 'workbox-navigation-preload'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { RangeRequestsPlugin } from 'workbox-range-requests'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import type { RouteHandlerCallbackOptions, WorkboxPlugin } from 'workbox-core'

import { resolveNavigation } from './navigationResponse'
import {
  APP_SHELL_FALLBACK,
  NAVIGATION_TIMEOUT_MS,
  isNavigationFallbackDenied,
  runtimeRoutes,
} from './swConfig'

declare const self: ServiceWorkerGlobalScope & {
  /** Replaced at build time by workbox-build with the precache manifest. */
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

precacheAndRoute(self.__WB_MANIFEST)

// `generateSW` did this by default; hand-written workers have to ask. Without
// it every deploy leaves its predecessor's precache bucket behind forever.
cleanupOutdatedCaches()

// Navigations now go to the network, which means they now pay for waking the
// worker up first — on a phone that has had the app in the background, tens to
// hundreds of milliseconds before the request is even sent. Navigation preload
// starts the fetch in parallel with that wake-up, which is exactly the cost
// #502 introduces. The handler below consumes `preloadResponse` on *every*
// navigation, including the denylisted ones: a preload that is started and
// never read logs a warning, and #383 is the record of what console noise from
// this file costs.
enableNavigationPreload()

for (const route of runtimeRoutes) {
  // Applied to every route rather than per-route: storing a non-200 as if it
  // were the asset is never right, and under CacheFirst it would then serve
  // that failure forever.
  const plugins: WorkboxPlugin[] = [new CacheableResponsePlugin({ statuses: [200] })]
  if (route.maxEntries !== undefined) {
    plugins.push(new ExpirationPlugin({ maxEntries: route.maxEntries, purgeOnQuotaError: true }))
  }
  if (route.rangeRequests) plugins.push(new RangeRequestsPlugin())

  const { cacheName } = route
  registerRoute(
    ({ url }) => route.match(url),
    route.strategy === 'CacheFirst'
      ? new CacheFirst({ cacheName, plugins })
      : new NetworkFirst({ cacheName, plugins, networkTimeoutSeconds: route.networkTimeoutSeconds }),
  )
}

/** Workbox types the handler's `event` as an ExtendableEvent, which is all a
 *  route is promised. A type guard rather than a cast: `preloadResponse` is
 *  genuinely absent in browsers without navigation preload, and pretending
 *  otherwise is how that becomes a runtime TypeError instead of a fallback. */
function isFetchEvent(event: ExtendableEvent): event is FetchEvent {
  return 'request' in event && 'preloadResponse' in event
}

/** The network attempt for a navigation, preferring the preloaded response.
 *  Never rejects — see NavigationSources.network. */
async function documentFromNetwork(request: Request, event: ExtendableEvent): Promise<Response | null> {
  try {
    if (isFetchEvent(event)) {
      const preloaded: unknown = await event.preloadResponse
      if (preloaded instanceof Response) return preloaded
    }
    return await fetch(request)
  } catch {
    return null
  }
}

/** The precached shell — the *only* thing this worker ever answers a navigation
 *  with from a cache, and the entire reason index.html is still precached. */
async function precachedShell(url: URL): Promise<Response | null> {
  if (isNavigationFallbackDenied(url)) return null
  return (await matchPrecache(APP_SHELL_FALLBACK)) ?? null
}

async function handleNavigation({ request, url, event }: RouteHandlerCallbackOptions): Promise<Response> {
  // Cleared as soon as the race is decided: an outstanding timer keeps the
  // worker alive for no reason on every navigation that answered instantly.
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS)
  })
  try {
    const response = await resolveNavigation({
      network: documentFromNetwork(request, event),
      shell: () => precachedShell(url),
      expiry,
    })
    return response ?? Response.error()
  } finally {
    clearTimeout(timer)
  }
}

registerRoute(new NavigationRoute(handleNavigation))

// `registerType: 'prompt'` means the app decides when a waiting worker takes
// over, and it says so with this message — workbox-window's
// `messageSkipWaiting()`, reached from `updateSW(true)` in
// lib/registerServiceWorker.ts. `generateSW` shipped this listener for free;
// without it here, every update offer would be a button that does nothing.
self.addEventListener('message', (event) => {
  const data: unknown = event.data
  if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

// (#177) Must stay the first import in the file — see the module's own
// comment for why the order is the whole point of it existing.
import './lib/initSentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './styles/global.css'
import { fetchMe, type Me } from './lib/api'
import { ME_QUERY_KEY } from './lib/authState'
import { queryClient } from './lib/queryClient'
import { setSentryDeviceType, setSentryUser } from './lib/sentry'
// Side-effecting import: registers its popstate listener before
// <BrowserRouter> (inside App) ever mounts and adds its own — see the
// module's own comment for why registration order matters here.
import './lib/backNavigationGuard'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { syncDebugToolsFromUrl } from './lib/debugTools'
import {
  syncDeviceTypeAttribute,
  syncDocumentLanguage,
  syncThemeAttribute,
  useSettingsStore,
} from './stores/settingsStore'
import { App } from './App'

// (#208) index.html can only carry a static `lang`; the real one is the
// stored/detected locale, and assistive tech reads this attribute.
syncDocumentLanguage()

// (#331, ADR #318) Same idea for the tablet/desktop control scheme — set
// before the first paint so nothing renders one layout and then swaps.
syncDeviceTypeAttribute()
setSentryDeviceType(useSettingsStore.getState().deviceType)

// (#426) And the palette, for the same before-the-first-paint reason — an app
// that flashes dark and then turns light is worse for the person this theme
// was added for than one that was simply dark.
syncThemeAttribute()

// (#321) `?debug=1` / `?debug=0` toggles the settings panel's developer tab
// for this browser. Read before the tree mounts so the first render of the
// panel already agrees with the address bar.
syncDebugToolsFromUrl(window.location.search)

// (#186) A stale chunk reference — this tab was left open across a deploy,
// and lazy-loaded route chunks (App.tsx's lazy() calls) are content-hashed,
// so an old filename simply stops existing on the server once superseded —
// makes Vite's dynamic import() reject with this event instead of a plain
// unhandled rejection. A silent reload recovers automatically instead of
// leaving the user stuck on a permanently broken lazy-loaded route (the
// suspected cause of a "Could not fetch Room.js" report). Guarded against a
// reload loop — a genuinely offline/broken network would otherwise reload
// forever — via a one-shot sessionStorage flag; a real fix (a newer deploy,
// or the network coming back) clears on the next fresh tab/session anyway.
//
// (#48) The service worker does not replace this and does not fight it. It
// makes the case rarer — every lazy chunk is precached, so a tab open across
// a deploy keeps loading routes out of its own cache instead of asking a
// server that no longer has them — but not impossible: a chunk requested for
// the first time after the precache was evicted under storage pressure still
// misses.
//
// (#400) Since the worker started applying updates by itself, this is no
// longer the only thing here that can reload the page — but the two still
// cannot chase each other. Each fires at most once with nothing to hand back:
// this one is one-shot per session, and applying an update leaves no pending
// update to find. The worst case is two reloads in a row, which is also the
// case where they were both right.
window.addEventListener('vite:preloadError', () => {
  const key = 'al_chunk_reload_once'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

// Warms up the identity cookie (#41) before the app tree ever mounts — has
// to happen here, not in a top-level App useEffect, because a direct
// /room/:id visit renders Room (and fires its socket-connecting effect) in
// the very same commit as App's own effect, and React runs child effects
// before parent effects: an effect in App would already have lost that race.
// Renders regardless of outcome — a failed warm-up (server down) still
// falls back to the pre-existing offline-ish local behavior, same as before
// this cookie existed at all. Prefetches into the same queryClient every
// useAuth() reads from, so this is the only /api/me call on load — not one
// here plus another from the first component that calls useAuth().
// (#177) Follows identity for the lifetime of the tab rather than reading it
// once: the id changes on register/login/logout (#41 mints a guest first),
// and a stale guest id on an error from a logged-in teacher answers the wrong
// question — "one person's device or everyone's deploy" is the only thing we
// ask this tag.
queryClient.getQueryCache().subscribe(event => {
  if (event.query.queryKey[0] !== ME_QUERY_KEY[0]) return
  setSentryUser(queryClient.getQueryData<Me>(ME_QUERY_KEY)?.userId ?? null)
})

// (#48) After the identity warm-up is queued, not before: registration opens
// its own request for the worker script, and the cookie warm-up is the one
// thing on this path that races (see the comment above it).
registerServiceWorker()

queryClient.prefetchQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe })
  .catch(err => console.error('failed to warm up identity', err))
  .finally(() => {
    // (#177) React 19 routes render-time errors through these two hooks
    // instead of letting them reach window.onerror, so without them every
    // component crash — the blank-screen class of bug — would be invisible
    // to Sentry. `onCaughtError` covers what an error boundary swallows;
    // there is none in the tree yet, and when one arrives (#326) this keeps
    // reporting what it hides. Neither changes behaviour: reactErrorHandler
    // reports and then defers to React's own default.
    createRoot(document.getElementById('root')!, {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
    }).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { fetchMe } from './lib/api'
import { ME_QUERY_KEY } from './lib/authState'
import { queryClient } from './lib/queryClient'
// Side-effecting import: registers its popstate listener before
// <BrowserRouter> (inside App) ever mounts and adds its own — see the
// module's own comment for why registration order matters here.
import './lib/backNavigationGuard'
import { App } from './App'

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
queryClient.prefetchQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe })
  .catch(err => console.error('failed to warm up identity', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

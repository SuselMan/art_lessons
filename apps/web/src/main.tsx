import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { fetchMe } from './lib/api'
import { App } from './App'

// Warms up the identity cookie (#41) before the app tree ever mounts — has
// to happen here, not in a top-level App useEffect, because a direct
// /room/:id visit renders Room (and fires its socket-connecting effect) in
// the very same commit as App's own effect, and React runs child effects
// before parent effects: an effect in App would already have lost that race.
// Renders regardless of outcome — a failed warm-up (server down) still
// falls back to the pre-existing offline-ish local behavior, same as before
// this cookie existed at all.
fetchMe().catch(err => console.error('failed to warm up identity', err)).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

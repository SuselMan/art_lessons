import { lazy, Suspense, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import { NoticeStack } from './components/Notice'
import { prefetchPaper } from './engine/src/paperLoader'
import { queryClient } from './lib/queryClient'
import { importRoomPage } from './lib/roomChunk'
import { useSettingsStore } from './stores/settingsStore'

// Route-level code splitting (#130): Room alone pulls in the WebGL pencil
// engine, @dnd-kit, and socket.io-client — none of which /login, /create, or
// /my-lessons need. Each page ships as its own chunk, fetched on navigation.
const CreateRoom = lazy(() => import('./pages/CreateRoom').then(m => ({ default: m.CreateRoom })))
// Through `importRoomPage` rather than an inline `import()` so the pages that
// preload this chunk share one specifier with it — see lib/roomChunk.ts.
const Room       = lazy(() => importRoomPage().then(m => ({ default: m.Room })))
const Auth       = lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })))
const MyLessons  = lazy(() => import('./pages/MyLessons').then(m => ({ default: m.MyLessons })))
const Settings   = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

// No spinner/skeleton convention exists elsewhere in the app yet — a blank
// page in the app's own background color (avoids a white flash) is enough
// while a route chunk loads.
function RouteFallback() {
  return <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }} />
}

/** (#345) Starts pulling the paper texture the moment the app boots, rather
 *  than when a room finally asks for it.
 *
 *  It is ~4 MB and it blocks the room's loading screen (Room awaits
 *  engine.paperReady() before it even fetches the snapshot), so on the common
 *  path — land on the lesson list, read it, pick a room — the download can be
 *  finished or nearly finished before the room is opened at all. The bytes are
 *  the same ones the room would have fetched; byteCache hands the in-flight
 *  promise straight to it.
 *
 *  Imported from `engine/src/paperLoader` rather than the engine's public
 *  `engine/index` on purpose: Room is a lazy route precisely so the WebGL
 *  engine stays out of the initial bundle (#130), and pulling the whole engine
 *  in here to start a download would undo that. paperLoader's own imports are
 *  the shared types and the manifest parser, nothing else.
 *
 *  Fires once for the tab. A wrong guess is cancelled by the room that
 *  disagrees, not re-guessed here — see prefetchPaper/claimSpeculative. */
function usePaperPrefetch(): void {
  useEffect(() => {
    // Read imperatively, not as a subscription: this must fire once, and
    // subscribing would restart it every time a room recorded a paper type.
    prefetchPaper(useSettingsStore.getState().lastPaperType)
  }, [])
}

export function App() {
  usePaperPrefetch()

  return (
    <QueryClientProvider client={queryClient}>
      {/* Above the router (#310): a confirm can be awaited from any page, and
          its dialog must outlive a route's own render tree — the dialog itself
          portals to <body> regardless. */}
      <ConfirmDialogProvider>
        {/* (#343) Outside the router for the same reason the provider above
            is: a notice pushed by a request that failed on one page has to
            survive navigating away from that page. */}
        <NoticeStack />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/create" replace />} />
              <Route path="/create" element={<CreateRoom />} />
              <Route path="/room/:id" element={<Room />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/my-lessons" element={<MyLessons />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  )
}

import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient'

// Route-level code splitting (#130): Room alone pulls in the WebGL pencil
// engine, @dnd-kit, and socket.io-client — none of which /login, /create, or
// /my-lessons need. Each page ships as its own chunk, fetched on navigation.
const CreateRoom = lazy(() => import('./pages/CreateRoom').then(m => ({ default: m.CreateRoom })))
const Room       = lazy(() => import('./pages/Room').then(m => ({ default: m.Room })))
const Auth       = lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })))
const MyLessons  = lazy(() => import('./pages/MyLessons').then(m => ({ default: m.MyLessons })))

// No spinner/skeleton convention exists elsewhere in the app yet — a blank
// page in the app's own background color (avoids a white flash) is enough
// while a route chunk loads.
function RouteFallback() {
  return <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }} />
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/create" replace />} />
            <Route path="/create" element={<CreateRoom />} />
            <Route path="/room/:id" element={<Room />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/my-lessons" element={<MyLessons />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

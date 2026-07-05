import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { CreateRoom } from './pages/CreateRoom'
import { Room } from './pages/Room'
import { Auth } from './pages/Auth'
import { MyLessons } from './pages/MyLessons'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/create" replace />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/my-lessons" element={<MyLessons />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

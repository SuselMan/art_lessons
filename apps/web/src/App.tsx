import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { CreateRoom } from './pages/CreateRoom'
import { Room } from './pages/Room'
import { Auth } from './pages/Auth'
import { MyLessons } from './pages/MyLessons'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/create" replace />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/my-lessons" element={<MyLessons />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CreateRoom } from './pages/CreateRoom'
import { Room } from './pages/Room'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/room/:id" element={<Room />} />
      </Routes>
    </BrowserRouter>
  )
}

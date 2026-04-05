import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { HomePage } from './pages/HomePage'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { JoinRoomPage } from './pages/JoinRoomPage'
import { WaitingRoomPage } from './pages/WaitingRoomPage'
import { GamePage } from './pages/GamePage'
import { ResultPage } from './pages/ResultPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/create" element={<CreateRoomPage />} />
        <Route path="/join" element={<JoinRoomPage />} />
        <Route path="/waiting/:roomId" element={<WaitingRoomPage />} />
        <Route path="/game/:roomId" element={<GamePage />} />
        <Route path="/result/:roomId" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

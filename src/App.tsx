import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/"     element={<HomePage />} />
        <Route path="/game" element={<GamePage />} />
        {/* Catch-all: redirect unknown routes to home */}
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

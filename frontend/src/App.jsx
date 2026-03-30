import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/shared/Header';
import IdentityArchive from './features/auth/IdentityArchive';
import GravitySlot from './features/voting/GravitySlot';
import PendulumView from './features/shared/PendulumView';
import BlueprintGrid from './features/admin/BlueprintGrid';
import CreateElectionView from './features/admin/CreateElectionView';
import ResultsView from './features/results/ResultsView';
import { getSession, isAdminSession } from './store/session';
import { AdminRoute, ResultsRoute, VoterRoute, WaitingRoute } from './lib/routeGuard';

function AppContent() {
  const location = useLocation();
  const session = getSession();
  const isAdmin = location.pathname.startsWith('/admin') && isAdminSession(session);

  return (
    <div className={`min-h-screen w-full transition-colors duration-700 ${isAdmin ? 'blueprint-grid' : 'bg-[var(--surface)] text-[var(--on-surface)]'}`}>
      <Header />
      <main className="pt-24 h-full">
        <Routes>
          <Route path="/" element={<IdentityArchive />} />
          <Route path="/ballot" element={<VoterRoute><GravitySlot /></VoterRoute>} />
          <Route path="/waiting" element={<WaitingRoute><PendulumView /></WaitingRoute>} />
          <Route path="/admin" element={<AdminRoute><BlueprintGrid /></AdminRoute>} />
          <Route path="/admin/new" element={<AdminRoute><CreateElectionView /></AdminRoute>} />
          <Route path="/results" element={<ResultsRoute><ResultsView /></ResultsRoute>} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

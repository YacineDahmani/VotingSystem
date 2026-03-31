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
import { ToastProvider } from './components/ui/ToastProvider';

function AppContent() {
  const location = useLocation();
  const session = getSession();
  const isAdmin = location.pathname.startsWith('/admin') && isAdminSession(session);

  return (
    <div className={`min-h-screen w-full transition-colors duration-700 bg-[var(--surface)] text-[var(--on-surface)]`}>
      <Header />
      <main className="pt-24 h-full pb-20">
        <Routes>
          <Route path="/" element={<IdentityArchive />} />
          <Route path="/ballot" element={<VoterRoute><GravitySlot /></VoterRoute>} />
          <Route path="/waiting" element={<WaitingRoute><PendulumView /></WaitingRoute>} />
          <Route path="/admin" element={<AdminRoute><BlueprintGrid /></AdminRoute>} />
          <Route path="/admin/new" element={<AdminRoute><CreateElectionView /></AdminRoute>} />
          <Route path="/results" element={<ResultsRoute><ResultsView /></ResultsRoute>} />
        </Routes>
      </main>
      <footer
        className={`w-full border-t px-4 md:px-8 py-4 flex items-center justify-end border-[var(--on-surface)]/10 text-[var(--primary)]/80`}
      >
        <a
          href="https://github.com/YacineDahmani"
          target="_blank"
          rel="noreferrer"
          className="text-[0.62rem] tracking-[0.12em] uppercase opacity-80 transition-opacity hover:opacity-100"
          aria-label="Credit: YacineDahmani on GitHub"
        >
          Credits: YacineDahmani
        </a>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;

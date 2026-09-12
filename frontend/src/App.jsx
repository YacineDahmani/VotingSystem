import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/shared/Header';
import SignInView from './features/auth/SignInView';
import BallotView from './features/voting/BallotView';
import PendulumView from './features/shared/PendulumView';
import AdminDashboardView from './features/admin/AdminDashboardView';
import CreateElectionView from './features/admin/CreateElectionView';
import OfficersView from './features/admin/OfficersView';
import ResultsView from './features/results/ResultsView';
import { AdminRoute, ResultsRoute, VoterRoute, WaitingRoute } from './lib/routeGuard';
import { ToastProvider } from './components/ui/ToastProvider';

function AppContent() {
  return (
    <div className={`min-h-screen w-full transition-colors duration-700 bg-[var(--surface)] text-[var(--on-surface)]`}>
      <Header />
      <main className="pt-24 h-full pb-20">
        <Routes>
          <Route path="/" element={<SignInView />} />
          <Route path="/vote" element={<VoterRoute><BallotView /></VoterRoute>} />
          <Route path="/waiting" element={<WaitingRoute><PendulumView /></WaitingRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminDashboardView /></AdminRoute>} />
          <Route path="/admin/create" element={<AdminRoute><CreateElectionView /></AdminRoute>} />
          <Route path="/admin/new" element={<AdminRoute><CreateElectionView /></AdminRoute>} />
          <Route path="/admin/officers" element={<AdminRoute><OfficersView /></AdminRoute>} />
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

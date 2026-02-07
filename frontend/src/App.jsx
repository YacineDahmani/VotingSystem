import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { VoterProvider } from '@/contexts/VoterContext';
import { ToastProvider } from '@/contexts/ToastContext';

// Layouts
import AdminLayout from '@/layouts/AdminLayout';
import VoterLayout from '@/layouts/VoterLayout';

// Pages - Admin
import DashboardHome from '@/pages/admin/DashboardHome';
import ElectionManager from '@/pages/admin/ElectionManager';
import ElectionDetail from '@/pages/admin/ElectionDetail';
import AdminLogin from '@/pages/admin/Login';

// Pages - Voter
import Landing from '@/pages/voter/Landing';
import VotingBooth from '@/pages/voter/VotingBooth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedAdminRoute({ children }) {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ToastProvider>
          <AdminProvider>
            <VoterProvider>
              <Routes>
                {/* Voter Routes */}
                <Route element={<VoterLayout />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/vote/:id" element={<VotingBooth />} />
                </Route>

                {/* Admin Routes */}
                <Route path="/admin/login" element={<AdminLogin />} />

                <Route path="/admin" element={
                  <ProtectedAdminRoute>
                    <AdminLayout />
                  </ProtectedAdminRoute>
                }>
                  <Route index element={<DashboardHome />} />
                  <Route path="elections" element={<ElectionManager />} />
                  <Route path="elections/:id" element={<ElectionDetail />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </VoterProvider>
          </AdminProvider>
        </ToastProvider>
      </Router>
    </QueryClientProvider>
  );
}

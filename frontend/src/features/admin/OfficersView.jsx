import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Key,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import {
  createAdminOfficer,
  deleteAdminOfficer,
  getAdminOfficers,
  getAdminProfile,
  updateAdminOfficer,
} from '../../lib/api';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { getSession } from '../../store/session';

const ROLE_DEFINITIONS = [
  {
    role: 'super_admin',
    title: 'Super Administrator',
    badgeText: 'SUPER ADMIN',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    description: 'Full authority: Create & delete elections, manage candidate rosters & voter rolls, run simulations, and register/manage administrative officers.',
  },
  {
    role: 'election_officer',
    title: 'Election Officer',
    badgeText: 'ELECTION OFFICER',
    badgeClass: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    description: 'Operational access: Create and edit elections, add candidates, import voter eligibility lists, open and close voting sessions.',
  },
  {
    role: 'auditor',
    title: 'Integrity Auditor',
    badgeText: 'AUDITOR',
    badgeClass: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    description: 'Read-only oversight: Inspect live vote tallies, review real vs simulated ballot distributions, and export cryptographic audit reports.',
  },
];

export default function OfficersView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();

  const [adminProfile, setAdminProfile] = useState(() => ({
    username: session?.adminUsername || 'Electoral Officer',
    role: session?.adminRole || 'super_admin',
    email: session?.adminEmail || '',
  }));

  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  // Form State
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('election_officer');

  const isSuperAdmin = adminProfile?.role === 'super_admin';

  const loadOfficers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, officersRes] = await Promise.all([
        getAdminProfile().catch(() => null),
        getAdminOfficers(),
      ]);

      if (profileRes?.admin) {
        setAdminProfile(profileRes.admin);
      }
      if (officersRes?.officers) {
        setOfficers(officersRes.officers);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load officer directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfficers();
  }, [loadOfficers]);

  const handleRegisterOfficer = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      pushToast({ type: 'error', title: 'Missing Information', message: 'All fields are required.' });
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await createAdminOfficer({
        username: username.trim(),
        email: email.trim(),
        password,
        role,
      });

      pushToast({
        type: 'success',
        title: 'Officer Registered',
        message: `${res.officer?.username || username} registered as ${role.replace('_', ' ')}.`,
      });

      setUsername('');
      setEmail('');
      setPassword('');
      setRole('election_officer');
      await loadOfficers();
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to register officer.';
      setError(msg);
      pushToast({ type: 'error', title: 'Registration Failed', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (officerId, newRole) => {
    try {
      await updateAdminOfficer(officerId, { role: newRole });
      pushToast({
        type: 'success',
        title: 'Role Updated',
        message: `Officer permissions set to ${newRole.replace('_', ' ')}.`,
      });
      await loadOfficers();
    } catch (err) {
      pushToast({ type: 'error', title: 'Update Failed', message: err?.message || 'Could not change officer role.' });
    }
  };

  const handleStatusToggle = async (officerId, currentActive) => {
    try {
      await updateAdminOfficer(officerId, { is_active: !currentActive });
      pushToast({
        type: 'info',
        title: currentActive ? 'Officer Deactivated' : 'Officer Activated',
        message: `Account status set to ${!currentActive ? 'Active' : 'Inactive'}.`,
      });
      await loadOfficers();
    } catch (err) {
      pushToast({ type: 'error', title: 'Status Update Failed', message: err?.message || 'Could not update status.' });
    }
  };

  const handleDeleteOfficer = (officerId, officerUsername) => {
    setConfirmState({
      title: `Remove Officer: ${officerUsername}`,
      message: `Are you sure you want to permanently delete the administrative account for ${officerUsername}?`,
      confirmTone: 'danger',
      onConfirm: async () => {
        try {
          await deleteAdminOfficer(officerId);
          pushToast({
            type: 'success',
            title: 'Officer Removed',
            message: `Account for ${officerUsername} has been permanently deleted.`,
          });
          await loadOfficers();
        } catch (err) {
          pushToast({ type: 'error', title: 'Delete Failed', message: err?.message || 'Could not delete officer.' });
        }
      },
    });
  };

  return (
    <div className="min-h-screen py-8 px-6 md:px-12 bg-[var(--surface)] text-[var(--on-surface)]">
      <div className="w-full max-w-[1400px] mx-auto space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--on-surface)]/10 pb-6">
          <div>
            <span className="text-[0.62rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50">
              ELECTORAL COMMISSION
            </span>
            <h2 className="font-muse text-4xl text-[var(--primary)] font-bold mt-1">
              Officers & Access Roles
            </h2>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="border border-[var(--outline-variant)] px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-[var(--surface-container)] transition-colors flex items-center gap-2 self-start md:self-auto"
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Role Explanations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ROLE_DEFINITIONS.map((def) => (
            <div
              key={def.role}
              className="p-5 bg-[var(--surface-container-lowest)] border border-[var(--on-surface)]/15 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 text-[0.55rem] font-mono font-bold uppercase tracking-wider border ${def.badgeClass}`}>
                  {def.badgeText}
                </span>
              </div>
              <h4 className="font-muse text-lg font-bold text-[var(--primary)]">
                {def.title}
              </h4>
              <p className="text-xs text-[var(--on-surface)] opacity-75 leading-relaxed">
                {def.description}
              </p>
            </div>
          ))}
        </div>

        {/* Main Content: Roster + Registration Form */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Left Column: Registered Officers Roster */}
          <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--on-surface)]/10 pb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[var(--primary)]" />
                <h3 className="font-muse text-2xl font-bold text-[var(--primary)]">
                  Registered Officers
                </h3>
              </div>
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--on-surface)] opacity-60">
                {officers.length} Registered
              </span>
            </div>

            {loading ? (
              <p className="font-mono text-xs opacity-50 py-8 text-center">Loading officer records...</p>
            ) : officers.length === 0 ? (
              <p className="font-mono text-xs opacity-50 py-8 text-center">No officers found.</p>
            ) : (
              <div className="space-y-3">
                {officers.map((officer) => {
                  const isSelf = officer.username === adminProfile?.username || officer.id === session?.adminId;
                  const def = ROLE_DEFINITIONS.find((d) => d.role === officer.role) || ROLE_DEFINITIONS[1];

                  return (
                    <div
                      key={officer.id}
                      className={`p-5 bg-[var(--surface)] border ${
                        isSelf ? 'border-[var(--primary)] shadow-sm' : 'border-[var(--on-surface)]/10'
                      } flex flex-col md:flex-row md:items-center justify-between gap-4`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-muse font-bold text-xl text-[var(--on-surface)]">
                            {officer.username}
                          </span>
                          {isSelf && (
                            <span className="px-2 py-0.5 text-[0.52rem] font-mono uppercase tracking-widest bg-[var(--primary)] text-[var(--on-primary)] font-bold">
                              YOU
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-[0.55rem] font-mono font-bold uppercase tracking-wider border ${def.badgeClass}`}>
                            {def.badgeText}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[0.52rem] font-mono uppercase tracking-wider ${
                              officer.is_active
                                ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                : 'text-rose-700 dark:text-rose-400 font-bold'
                            }`}
                          >
                            {officer.is_active ? '● Active' : '○ Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--on-surface)] opacity-70">
                          {officer.email} • Last login:{' '}
                          {officer.last_login_at
                            ? new Date(officer.last_login_at).toLocaleString()
                            : 'Never'}
                        </p>
                      </div>

                      {/* Management Controls */}
                      {isSuperAdmin && (
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={officer.role}
                            onChange={(e) => handleRoleChange(officer.id, e.target.value)}
                            disabled={isSelf}
                            className="text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] px-2.5 py-1.5 text-[var(--on-surface)] font-mono disabled:opacity-40"
                            title={isSelf ? 'You cannot change your own role' : 'Change officer permissions'}
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="election_officer">Election Officer</option>
                            <option value="auditor">Auditor</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleStatusToggle(officer.id, officer.is_active)}
                            disabled={isSelf}
                            className={`px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-bold border transition-colors ${
                              officer.is_active
                                ? 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            } disabled:opacity-40`}
                            title={isSelf ? 'Cannot deactivate self' : 'Toggle status'}
                          >
                            {officer.is_active ? 'Deactivate' : 'Activate'}
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOfficer(officer.id, officer.username)}
                              className="p-2 text-rose-700 hover:text-rose-900 border border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              title="Delete officer account"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Register New Officer */}
          <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm space-y-6">
            <div className="border-b border-[var(--on-surface)]/10 pb-4">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-[var(--primary)]" />
                <h3 className="font-muse text-2xl font-bold text-[var(--primary)]">
                  Add New Officer
                </h3>
              </div>
              <p className="text-xs text-[var(--on-surface)] opacity-70 mt-1">
                Provision administrative credentials and grant permissions.
              </p>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 dark:bg-[#281a1c] border-l-4 border-l-rose-600 border border-rose-200 text-rose-950 dark:text-rose-100 text-xs">
                {error}
              </div>
            )}

            {!isSuperAdmin ? (
              <div className="p-4 bg-[var(--surface-container)] border border-[var(--on-surface)]/10 text-xs opacity-75 leading-relaxed">
                Only Super Administrators have permission to create new officer credentials or modify roles.
              </div>
            ) : (
              <form onSubmit={handleRegisterOfficer} className="space-y-4">
                <div>
                  <label className="block text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. caveman"
                    required
                    className="w-full text-xs p-3 bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. caveman@elections.gov"
                    required
                    className="w-full text-xs p-3 bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 mb-1.5">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    required
                    className="w-full text-xs p-3 bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[0.62rem] uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 mb-1.5">
                    Assigned Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full text-xs p-3 bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] font-mono"
                  >
                    <option value="election_officer">Election Officer (Operations)</option>
                    <option value="auditor">Integrity Auditor (Read-Only)</option>
                    <option value="super_admin">Super Administrator (Full)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[var(--primary)] text-[var(--on-primary)] text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90 transition-all shadow-sm flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  <span>{submitting ? 'Registering...' : 'Register Officer'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmDialog
          open={!!confirmState}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          confirmTone={confirmState.confirmTone}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            const action = confirmState.onConfirm;
            setConfirmState(null);
            if (action) await action();
          }}
        />
      )}
    </div>
  );
}

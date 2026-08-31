import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';
import {
  addCandidate,
  deleteCandidate,
  deleteElection,
  getAdminElections,
  getAdminProfile,
  getCandidates,
  getFakeVoters,
  getIntegrityReport,
  injectFakeVotes,
  regenerateElectionCode,
  updateElectionDetails,
  updateElectionStatus,
} from '../../lib/api';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { clearSession, getSession, isAdminSession, setSession } from '../../store/session';

const FILTERS = ['all', 'open', 'draft', 'closed'];

function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRemainingTime(endDateIso, nowMs) {
  if (!endDateIso) {
    return 'No end time set';
  }

  const endDate = new Date(endDateIso);
  if (Number.isNaN(endDate.getTime())) {
    return 'Invalid end time';
  }

  const remainingMs = endDate.getTime() - nowMs;
  if (remainingMs <= 0) {
    return 'Voting has ended';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export default function BlueprintGrid() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();

  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [filter, setFilter] = useState('all');

  const [candidates, setCandidates] = useState([]);
  const [injectionMap, setInjectionMap] = useState({});
  const [integrity, setIntegrity] = useState(null);
  const [fakeVoterAudit, setFakeVoterAudit] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [customEndDate, setCustomEndDate] = useState('');
  const [maxVotersInput, setMaxVotersInput] = useState('');
  const [newCandidateName, setNewCandidateName] = useState('');
  const [newCandidateDescription, setNewCandidateDescription] = useState('');

  const [adminProfile, setAdminProfile] = useState(() => ({
    username: session?.adminUsername || 'Electoral Officer',
    role: session?.adminRole || 'super_admin',
    email: session?.adminEmail || '',
  }));

  useEffect(() => {
    getAdminProfile()
      .then((res) => {
        if (res?.admin) {
          setAdminProfile(res.admin);
        }
      })
      .catch(() => null);
  }, []);

  const handleLogout = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  const filteredElections = useMemo(() => {
    if (filter === 'all') return elections;
    return elections.filter((item) => item.status === filter);
  }, [elections, filter]);

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) || null,
    [elections, selectedElectionId]
  );

  const remainingTimeLabel = useMemo(
    () => formatRemainingTime(selectedElection?.end_date, clockNow),
    [clockNow, selectedElection?.end_date]
  );

  const loadElections = useCallback(async (preferredElectionId = null) => {
    const electionListResponse = await getAdminElections();
    const nextElections = electionListResponse.elections || [];
    setElections(nextElections);

    if (!nextElections.length) {
      setSelectedElectionId(null);
      return null;
    }

    const preferred = preferredElectionId
      ? nextElections.find((item) => item.id === preferredElectionId)
      : null;
    const open = nextElections.find((item) => item.status === 'open');
    const fallback = nextElections[0];
    const nextSelected = preferred || open || fallback;

    setSelectedElectionId(nextSelected?.id || null);
    return nextSelected;
  }, []);

  const loadElectionDetails = useCallback(async (electionId) => {
    if (!electionId) {
      setCandidates([]);
      setIntegrity(null);
      setFakeVoterAudit([]);
      return;
    }

    const [candidateResponse, integrityResponse, fakeVoterResponse] = await Promise.all([
      getCandidates(electionId),
      getIntegrityReport(electionId),
      getFakeVoters(electionId),
    ]);

    const nextCandidates = candidateResponse.candidates || [];
    setCandidates(nextCandidates);
    setIntegrity(integrityResponse || null);
    setFakeVoterAudit(fakeVoterResponse?.records || []);

    setInjectionMap((previous) => {
      const next = { ...previous };
      nextCandidates.forEach((candidate) => {
        if (next[candidate.id] === undefined) {
          next[candidate.id] = 10;
        }
      });
      return next;
    });
  }, []);

  const refreshAll = useCallback(async (preferredElectionId = null) => {
    const selected = await loadElections(preferredElectionId || selectedElectionId);
    if (selected?.id) {
      await loadElectionDetails(selected.id);
    } else {
      await loadElectionDetails(null);
    }
  }, [loadElectionDetails, loadElections, selectedElectionId]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        if (!isAdminSession(session)) {
          setError('Master key verification is required for admin controls.');
          setLoading(false);
          return;
        }

        await refreshAll();
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Unable to load admin controls');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [refreshAll, session]);

  useEffect(() => {
    if (!selectedElectionId) return;

    loadElectionDetails(selectedElectionId).catch((err) => {
      setError(err.message || 'Unable to load election details');
    });
  }, [loadElectionDetails, selectedElectionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCustomEndDate(toLocalDateTimeInput(selectedElection?.end_date));
  }, [selectedElection?.end_date]);

  useEffect(() => {
    if (!selectedElection) {
      setMaxVotersInput('');
      return;
    }

    if (selectedElection.max_voters === null || selectedElection.max_voters === undefined) {
      setMaxVotersInput('');
      return;
    }

    setMaxVotersInput(String(selectedElection.max_voters));
  }, [selectedElection]);

  const withBusy = async (label, fn, successToast) => {
    try {
      setError('');
      setBusyAction(label);
      await fn();
      if (successToast) {
        pushToast({
          type: 'success',
          title: successToast.title,
          message: successToast.message,
        });
      }
    } catch (err) {
      const message = err.message || 'Action failed';
      setError(message);
      pushToast({
        type: 'error',
        title: 'Action Failed',
        message,
      });
    } finally {
      setBusyAction('');
    }
  };

  const openConfirm = ({ title, message, confirmTone = 'primary', onConfirm }) => {
    setConfirmState({ title, message, confirmTone, onConfirm });
  };

  const handleInject = async (candidateId, candidateName) => {
    if (!selectedElection) return;

    const rawCount = Number.parseInt(String(injectionMap[candidateId] ?? 10), 10);
    const count = Math.max(1, Math.min(10000, Number.isNaN(rawCount) ? 1 : rawCount));
    openConfirm({
      title: 'Simulate Votes',
      message: `Add ${count} simulated votes for ${candidateName}?`,
      onConfirm: async () => {
        await withBusy('inject', async () => {
          await injectFakeVotes(selectedElection.id, { candidateId, count });
          await refreshAll(selectedElection.id);
        }, {
          title: 'Votes Simulated',
          message: `${count} test votes added for ${candidateName}.`,
        });
      },
    });
  };

  const handleDeleteCandidate = async (candidateId, candidateName) => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Remove Candidate',
      message: `Remove ${candidateName}?`,
      confirmTone: 'danger',
      onConfirm: async () => {
        await withBusy('delete-candidate', async () => {
          await deleteCandidate(candidateId);
          await refreshAll(selectedElection.id);
        }, {
          title: 'Candidate Removed',
          message: `${candidateName} was removed.`,
        });
      },
    });
  };

  const handleAddCandidate = async () => {
    if (!selectedElection) return;

    const trimmedName = newCandidateName.trim();
    if (!trimmedName) {
      setError('Candidate name is required.');
      return;
    }

    await withBusy('add-candidate', async () => {
      await addCandidate(selectedElection.id, {
        name: trimmedName,
        description: newCandidateDescription.trim(),
      });
      setNewCandidateName('');
      setNewCandidateDescription('');
      await refreshAll(selectedElection.id);
    }, {
      title: 'Candidate Added',
      message: `${trimmedName} added.`,
    });
  };

  const handleRegenerateCode = async () => {
    if (!selectedElection) return;
    await withBusy('regen-code', async () => {
      await regenerateElectionCode(selectedElection.id);
      await refreshAll(selectedElection.id);
    }, {
      title: 'Code Regenerated',
      message: 'A new session code was generated.',
    });
  };

  const handleStatusChange = async (status) => {
    if (!selectedElection) return;
    if (selectedElection.status === status) return;
    await withBusy(`status-${status}`, async () => {
      await updateElectionStatus(selectedElection.id, status);
      await refreshAll(selectedElection.id);
    }, {
      title: 'Status Updated',
      message: `Status changed to ${status}.`,
    });
  };

  const handleExtendEndTime = async (deltaMs) => {
    if (!selectedElection) return;

    const existingEnd = selectedElection.end_date ? new Date(selectedElection.end_date) : null;
    const baseTime = existingEnd && !Number.isNaN(existingEnd.getTime())
      ? Math.max(existingEnd.getTime(), Date.now())
      : Date.now();
    const nextEndDate = new Date(baseTime + deltaMs).toISOString();

    await withBusy('extend-end-time', async () => {
      await updateElectionDetails(selectedElection.id, { end_date: nextEndDate });
      await refreshAll(selectedElection.id);
    }, {
      title: 'End Time Extended',
      message: 'End time updated.',
    });
  };

  const handleApplyCustomEndDate = async () => {
    if (!selectedElection) return;
    if (!customEndDate) {
      setError('Choose a valid end date and time.');
      return;
    }

    const parsed = new Date(customEndDate);
    if (Number.isNaN(parsed.getTime())) {
      setError('Choose a valid end date and time.');
      return;
    }

    await withBusy('set-custom-end-time', async () => {
      await updateElectionDetails(selectedElection.id, { end_date: parsed.toISOString() });
      await refreshAll(selectedElection.id);
    }, {
      title: 'End Time Updated',
      message: 'End time set successfully.',
    });
  };

  const handleDeleteSession = async () => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Delete Election',
      message: `Delete "${selectedElection.title}"? This cannot be undone.`,
      confirmTone: 'danger',
      onConfirm: async () => {
        await withBusy('delete-session', async () => {
          await deleteElection(selectedElection.id);
          await refreshAll(null);
        }, {
          title: 'Election Deleted',
          message: 'Election was deleted permanently.',
        });
      },
    });
  };

  const handleSaveMaxVoters = async () => {
    if (!selectedElection) return;

    const raw = maxVotersInput.trim();
    const payload = raw ? Number.parseInt(raw, 10) : null;

    if (raw && (Number.isNaN(payload) || payload < 1)) {
      setError('Max voters must be empty for unlimited, or a positive number.');
      return;
    }

    await withBusy('set-max-voters', async () => {
      await updateElectionDetails(selectedElection.id, { max_voters: payload });
      await refreshAll(selectedElection.id);
    }, {
      title: 'Voter Limit Updated',
      message: payload ? `Maximum voters set to ${payload}.` : 'Voter limit removed (unlimited).',
    });
  };

  const copySessionCode = async () => {
    if (!selectedElection?.code) return;

    try {
      await navigator.clipboard.writeText(selectedElection.code);
      pushToast({
        type: 'info',
        title: 'Session Code Copied',
        message: 'The election code was copied to clipboard.',
      });
    } catch {
      setError('Unable to copy session code to clipboard');
      pushToast({
        type: 'error',
        title: 'Copy Failed',
        message: 'Unable to copy session code to clipboard.',
      });
    }
  };

  const setInjectionCount = (candidateId, value) => {
    const parsed = Number.parseInt(String(value), 10);
    const safe = Number.isNaN(parsed) ? 1 : Math.max(1, Math.min(10000, parsed));
    setInjectionMap((current) => ({ ...current, [candidateId]: safe }));
  };

  const bumpInjectionCount = (candidateId, delta) => {
    const currentValue = Number.parseInt(String(injectionMap[candidateId] ?? 10), 10);
    const base = Number.isNaN(currentValue) ? 1 : currentValue;
    setInjectionCount(candidateId, base + delta);
  };

  const handleViewResults = () => {
    if (selectedElection?.id) {
      setSession({ electionId: selectedElection.id });
    }
    navigate('/results');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--primary)]">Loading admin console...</div>;
  }

  return (
    <div className="min-h-screen text-[var(--primary)] relative z-10 -mt-24 pt-32 px-8 pb-20">
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="label-md text-[var(--on-surface)] opacity-60 mb-2 tracking-[0.2em]">ADMIN</p>
          <h2 className="font-muse font-bold text-6xl text-[var(--primary)]">Elections</h2>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 bg-[var(--surface-container)] border border-[var(--primary)]/20 shadow-sm">
            <Shield size={14} className="text-[var(--primary)]" />
            <div>
              <span className="font-bold tracking-wider uppercase text-[0.65rem]">{adminProfile.username}</span>
              <span className="opacity-60 text-[0.6rem] ml-1.5 uppercase font-mono">[{adminProfile.role}]</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/new')}
            className="bg-[var(--primary)] text-[var(--on-primary)] px-6 py-3 uppercase text-xs tracking-widest transition-transform duration-200 hover:-translate-y-0.5 shadow-md hover:shadow-lg active:translate-y-0"
          >
            New Election
          </button>
          <button
            type="button"
            onClick={handleViewResults}
            className="border border-[var(--on-surface)]/20 text-[var(--primary)] px-6 py-3 uppercase text-xs tracking-widest hover:bg-[var(--primary)]/90/5 transition-all duration-200 shadow-sm hover:shadow-md active:translate-y-0.5"
          >
            View Results
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className="border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 uppercase text-xs tracking-widest hover:bg-red-500/10 transition-all duration-200 shadow-sm flex items-center gap-1.5"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Log Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-4 bg-[var(--surface-container-lowest)] text-[var(--primary)] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-muse italic text-3xl">Elections</h3>
            <span className="label-md text-[var(--on-surface)] opacity-60">{filteredElections.length}</span>
          </div>

          <div className="flex gap-2 mb-5 flex-wrap">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`px-3 py-1 text-[0.65rem] uppercase tracking-wider border transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md active:translate-y-0 ${filter === item ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'border-[var(--outline-variant)] text-[var(--on-surface)] opacity-80 hover:bg-[var(--surface-container)]'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {filteredElections.map((item) => {
              const isSelected = item.id === selectedElectionId;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedElectionId(item.id)}
                  className={`w-full text-left border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${isSelected ? 'border-[var(--primary)] bg-[var(--surface-container-low)] shadow-sm' : 'border-[var(--outline-variant)] hover:bg-[var(--surface-container-low)]'}`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <p className="font-semibold text-sm">{item.title}</p>
                    <span className={`text-[0.55rem] uppercase tracking-widest ${item.status === 'open' ? 'text-green-700' : item.status === 'closed' ? 'text-[var(--on-surface)] opacity-60' : 'text-amber-700'}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="label-md text-[var(--on-surface)] opacity-60 mt-2">Code: {item.code}</p>
                  <p className="label-md text-[var(--on-surface)] opacity-50 mt-1">
                    Votes: {item.totalVotes || 0} • Registered: {item.voterCount || 0}
                  </p>
                </button>
              );
            })}
            {!filteredElections.length ? <p className="text-sm text-[var(--on-surface)] opacity-60">No elections found.</p> : null}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-[var(--surface-container-lowest)] text-[var(--primary)] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label-md text-[var(--on-surface)] opacity-60">Election Details</p>
                <h3 className="font-muse italic text-4xl">{selectedElection ? selectedElection.title : 'None selected'}</h3>
                <p className="label-md text-[var(--on-surface)] opacity-60 mt-2">Code: {selectedElection?.code || '-'}</p>
                <p className="label-md text-[var(--on-surface)] opacity-60 mt-1">Ends: {selectedElection?.end_date ? new Date(selectedElection.end_date).toLocaleString() : 'Not scheduled'}</p>
                <p className="label-md text-[var(--on-surface)] opacity-90 mt-1">Time Remaining: {remainingTimeLabel}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={copySessionCode} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50" disabled={!selectedElection}>Copy Code</button>
                <button type="button" onClick={handleRegenerateCode} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50" disabled={!selectedElection || !!busyAction}>Regenerate Code</button>
                <button type="button" onClick={() => handleStatusChange('open')} className="border border-green-300 bg-green-50 text-green-800 px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-green-100 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 dark:border-green-500/30 dark:bg-transparent dark:text-green-100 dark:hover:bg-green-950/25" disabled={!selectedElection || !!busyAction || selectedElection.status === 'open'}>Open</button>
                <button type="button" onClick={() => handleStatusChange('closed')} className="border border-[var(--on-surface)] text-[var(--on-surface)] opacity-90 px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container-low)] hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50" disabled={!selectedElection || !!busyAction || selectedElection.status === 'closed'}>Close</button>
                <button type="button" onClick={() => handleStatusChange('draft')} className="border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-amber-100 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 dark:border-amber-500/30 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-950/25" disabled={!selectedElection || !!busyAction || selectedElection.status === 'draft'}>Draft</button>
                <button type="button" onClick={handleDeleteSession} className="border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-red-100 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-100 dark:hover:bg-rose-950/25" disabled={!selectedElection || !!busyAction}>Delete</button>
              </div>
            </div>
            {error ? <p className="label-md text-black mt-4 dark:text-red-100">{error}</p> : null}

            <div className="mt-5 border-t border-[var(--outline-variant)] pt-4">
              <p className="label-md text-[var(--on-surface)] opacity-60 mb-3">Extend End Time</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => handleExtendEndTime(5 * 60 * 1000)} disabled={!selectedElection || !!busyAction} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50">+5 min</button>
                <button type="button" onClick={() => handleExtendEndTime(15 * 60 * 1000)} disabled={!selectedElection || !!busyAction} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50">+15 min</button>
                <button type="button" onClick={() => handleExtendEndTime(60 * 60 * 1000)} disabled={!selectedElection || !!busyAction} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50">+1 hour</button>
                <button type="button" onClick={() => handleExtendEndTime(24 * 60 * 60 * 1000)} disabled={!selectedElection || !!busyAction} className="border border-[var(--outline-variant)] px-3 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50">+1 day</button>
              </div>

              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <input
                  type="datetime-local"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--outline-variant)] px-3 py-2"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomEndDate}
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--primary)] text-[var(--primary)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50"
                >
                  Set End Time
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-[var(--outline-variant)] pt-4">
              <p className="label-md text-[var(--on-surface)] opacity-60 mb-3">Voter Limit</p>
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxVotersInput}
                  onChange={(event) => setMaxVotersInput(event.target.value)}
                  placeholder="Leave empty for unlimited"
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--outline-variant)] px-3 py-2"
                />
                <button
                  type="button"
                  onClick={handleSaveMaxVoters}
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--primary)] text-[var(--primary)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50"
                >
                  Save Limit
                </button>
              </div>
              <p className="label-md text-[var(--on-surface)] opacity-60 mt-2">
                Current: {selectedElection?.max_voters ? `${selectedElection.max_voters} voters` : 'Unlimited'}
              </p>
            </div>
          </div>

          <div className="bg-[var(--surface-container-lowest)] text-[var(--primary)] p-6 shadow-xl">
            <h4 className="font-muse italic text-3xl mb-4">Integrity & Audit</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-[var(--outline-variant)] p-4"><p className="label-md text-[var(--on-surface)] opacity-60">Total Votes</p><p className="text-3xl font-bold">{integrity?.totalVotes || 0}</p></div>
              <div className="border border-[var(--outline-variant)] p-4"><p className="label-md text-[var(--on-surface)] opacity-60">Real Votes</p><p className="text-3xl font-bold text-green-700">{integrity?.realVotes || 0}</p></div>
              <div className="border border-[var(--outline-variant)] p-4"><p className="label-md text-[var(--on-surface)] opacity-60">Simulated Votes</p><p className="text-3xl font-bold text-red-700">{integrity?.fakeVotes || 0}</p></div>
              <div className="border border-[var(--outline-variant)] p-4"><p className="label-md text-[var(--on-surface)] opacity-60">Status</p><p className={`text-2xl font-bold ${integrity?.integrityStatus === 'clean' ? 'text-green-700' : 'text-red-700'}`}>{integrity?.integrityStatus === 'clean' ? 'CLEAN' : 'DISCREPANCY'}</p></div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(integrity?.candidates || []).map((item) => (
                <div key={item.id} className="border border-[var(--outline-variant)] p-4">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{item.name}</p>
                    {item.fakeVotes > 0 ? <span className="text-[0.6rem] uppercase tracking-widest text-red-700">discrepancy</span> : <span className="text-[0.6rem] uppercase tracking-widest text-green-700">clean</span>}
                  </div>
                  <p className="label-md text-[var(--on-surface)] opacity-60 mt-2">Real: {item.realVotes} | Simulated: {item.fakeVotes} | Total: {item.totalVotes}</p>
                </div>
              ))}
            </div>

            <p className="label-md text-[var(--on-surface)] opacity-60 mt-4">Simulated voter records: {fakeVoterAudit.length}</p>
          </div>

          <div className="bg-[var(--surface-container-lowest)] text-[var(--primary)] p-6 shadow-xl">
            <h4 className="font-muse italic text-3xl mb-4">Simulate Votes</h4>
            <p className="text-sm text-[var(--on-surface)] opacity-80 mb-5">
              Simulate test votes to test live tallies and UI updates.
            </p>

            <div className="mb-6 border border-[var(--outline-variant)] p-4">
              <p className="label-md text-[var(--on-surface)] opacity-60 mb-3">Add Candidate</p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  type="text"
                  value={newCandidateName}
                  onChange={(event) => setNewCandidateName(event.target.value)}
                  placeholder="Candidate name"
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--outline-variant)] px-3 py-2"
                />
                <input
                  type="text"
                  value={newCandidateDescription}
                  onChange={(event) => setNewCandidateDescription(event.target.value)}
                  placeholder="Description (optional)"
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--outline-variant)] px-3 py-2"
                />
                <button
                  type="button"
                  onClick={handleAddCandidate}
                  disabled={!selectedElection || !!busyAction}
                  className="border border-[var(--primary)] text-[var(--primary)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] disabled:opacity-50"
                >
                  Add Candidate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="border border-[var(--outline-variant)] p-4">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{candidate.name}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                      disabled={!!busyAction}
                      className="text-red-700 text-xs uppercase tracking-widest transition-colors hover:text-red-900 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="label-md text-[var(--on-surface)] opacity-60 mt-1">Current votes: {candidate.votes}</p>
                  <label className="label-md text-[var(--on-surface)] opacity-60 mt-3 block">Vote Count</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={injectionMap[candidate.id] ?? 10}
                    onChange={(event) => setInjectionCount(candidate.id, event.target.value)}
                    className="w-full mt-2 border border-[var(--outline-variant)] px-3 py-2"
                  />
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {[10, 25, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => bumpInjectionCount(candidate.id, step)}
                        className="border border-[var(--outline-variant)] px-2 py-1 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:-translate-y-0.5 shadow-sm active:translate-y-0"
                      >
                        +{step}
                      </button>
                    ))}
                    {[10, 25].map((step) => (
                      <button
                        key={`minus-${step}`}
                        type="button"
                        onClick={() => bumpInjectionCount(candidate.id, -step)}
                        className="border border-[var(--outline-variant)] px-2 py-1 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:-translate-y-0.5 shadow-sm active:translate-y-0"
                      >
                        -{step}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInject(candidate.id, candidate.name)}
                    disabled={!!busyAction}
                    className="mt-3 bg-[var(--primary)] text-[var(--on-primary)] w-full py-2 uppercase text-xs tracking-widest transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md active:translate-y-0 disabled:opacity-50"
                  >
                    Simulate Votes
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || 'Confirm'}
        message={confirmState?.message || ''}
        confirmTone={confirmState?.confirmTone || 'primary'}
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        busy={!!busyAction}
        onCancel={() => {
          if (!busyAction) {
            setConfirmState(null);
          }
        }}
        onConfirm={async () => {
          if (!confirmState?.onConfirm) return;
          await confirmState.onConfirm();
          setConfirmState(null);
        }}
      />
    </div>
  );
}

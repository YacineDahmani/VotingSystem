import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FlaskConical,
  LogOut,
  Plus,
  QrCode,
  Share2,
  Shield,
  Sliders,
  Trash2,
  Users,
} from 'lucide-react';
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
import { clearSession, getSession, isAdminSession } from '../../store/session';

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
  const [adminTab, setAdminTab] = useState('operations'); // 'operations' | 'share' | 'sandbox'

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
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  const totalElectionVotes = useMemo(() => {
    return candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
  }, [candidates]);

  const remainingTimeLabel = useMemo(
    () => formatRemainingTime(selectedElection?.end_date, clockNow),
    [clockNow, selectedElection?.end_date]
  );

  const voterJoinUrl = useMemo(() => {
    if (!selectedElection?.code) return '';
    return `${window.location.origin}/?code=${selectedElection.code}`;
  }, [selectedElection?.code]);

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
          setError('Admin credentials required.');
          setLoading(false);
          return;
        }

        await refreshAll();
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Unable to load admin dashboard');
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
          type: successToast.type || 'success',
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

  const openConfirm = ({ title, message, onConfirm, confirmTone = 'default' }) => {
    setConfirmState({
      title,
      message,
      onConfirm,
      confirmTone,
    });
  };

  const handleStatusChange = async (nextStatus) => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Update Election Status',
      message: `Change "${selectedElection.title}" to "${nextStatus.toUpperCase()}"?`,
      confirmTone: nextStatus === 'closed' ? 'danger' : 'default',
      onConfirm: async () => {
        await withBusy(`status-${nextStatus}`, async () => {
          await updateElectionStatus(selectedElection.id, nextStatus);
          await refreshAll(selectedElection.id);
        }, {
          title: 'Status Updated',
          message: `Election status set to ${nextStatus}.`,
        });
      },
    });
  };

  const handleRegenerateCode = async () => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Regenerate Session Code',
      message: 'Regenerate session code? Existing links using the old code will expire.',
      onConfirm: async () => {
        await withBusy('regenerate-code', async () => {
          const response = await regenerateElectionCode(selectedElection.id);
          await refreshAll(selectedElection.id);
          pushToast({
            type: 'info',
            title: 'Code Updated',
            message: `New session code: ${response.code}`,
          });
        });
      },
    });
  };

  const handleExtendEndTime = async (millisecondsToAdd) => {
    if (!selectedElection) return;

    const baseTime = selectedElection.end_date
      ? new Date(selectedElection.end_date).getTime()
      : Date.now();
    const safeBase = Number.isNaN(baseTime) ? Date.now() : Math.max(Date.now(), baseTime);
    const nextEndDate = new Date(safeBase + millisecondsToAdd).toISOString();

    await withBusy(`extend-${millisecondsToAdd}`, async () => {
      await updateElectionDetails(selectedElection.id, { end_date: nextEndDate });
      await refreshAll(selectedElection.id);
    }, {
      title: 'Duration Extended',
      message: 'Election end time updated.',
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
      message: 'End time updated successfully.',
    });
  };

  const handleDeleteSession = async () => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Delete Election',
      message: `Delete "${selectedElection.title}"? This action cannot be undone.`,
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
      setError('Max voters must be empty for unlimited, or a positive integer.');
      return;
    }

    await withBusy('set-max-voters', async () => {
      await updateElectionDetails(selectedElection.id, { max_voters: payload });
      await refreshAll(selectedElection.id);
    }, {
      title: 'Voter Limit Updated',
      message: payload ? `Maximum voters set to ${payload}.` : 'Voter limit set to unlimited.',
    });
  };

  const handleAddCandidate = async () => {
    if (!selectedElection) return;

    const name = newCandidateName.trim();
    const description = newCandidateDescription.trim();

    if (!name) {
      setError('Candidate name is required.');
      return;
    }

    await withBusy('add-candidate', async () => {
      await addCandidate(selectedElection.id, {
        name,
        description: description || null,
      });

      setNewCandidateName('');
      setNewCandidateDescription('');
      await refreshAll(selectedElection.id);
    }, {
      title: 'Candidate Added',
      message: `${name} has been added to the ballot.`,
    });
  };

  const handleDeleteCandidate = async (candidateId, candidateName) => {
    if (!selectedElection) return;

    openConfirm({
      title: 'Remove Candidate',
      message: `Remove candidate "${candidateName}" from this election?`,
      confirmTone: 'danger',
      onConfirm: async () => {
        await withBusy(`delete-candidate-${candidateId}`, async () => {
          await deleteCandidate(selectedElection.id, candidateId);
          await refreshAll(selectedElection.id);
        }, {
          title: 'Candidate Removed',
          message: `${candidateName} has been removed.`,
        });
      },
    });
  };

  const handleInjectFakeVotes = async (candidateId, count) => {
    if (!selectedElection) return;

    const parsedCount = Number.parseInt(count, 10);
    if (Number.isNaN(parsedCount) || parsedCount <= 0) {
      setError('Enter a valid positive number of votes.');
      return;
    }

    await withBusy(`inject-${candidateId}`, async () => {
      await injectFakeVotes(selectedElection.id, {
        candidateId,
        count: parsedCount,
      });
      await refreshAll(selectedElection.id);
    }, {
      title: 'Test Votes Injected',
      message: `Injected ${parsedCount} simulation votes.`,
    });
  };

  const copySessionCode = async () => {
    if (!selectedElection?.code) return;
    try {
      await navigator.clipboard.writeText(selectedElection.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      pushToast({
        type: 'info',
        title: 'Code Copied',
        message: `Session code ${selectedElection.code} copied.`,
      });
    } catch {
      setError('Unable to copy code to clipboard.');
    }
  };

  const copyJoinLink = async () => {
    if (!voterJoinUrl) return;
    try {
      await navigator.clipboard.writeText(voterJoinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      pushToast({
        type: 'info',
        title: 'Voter Link Copied',
        message: 'Direct invite link copied to clipboard.',
      });
    } catch {
      setError('Unable to copy invite link.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="font-muse text-2xl text-[var(--on-surface)]">Loading Administrative Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-6 md:px-12 bg-[var(--surface)]">
      {/* Top Header Bar */}
      <div className="w-full max-w-[1400px] mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--on-surface)]/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] font-bold bg-[var(--primary)] text-[var(--on-primary)]">
              ADMIN CONTROL
            </span>
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-60">
              Officer: <strong>{adminProfile.username}</strong> ({adminProfile.role})
            </p>
          </div>
          <h2 className="font-muse text-4xl text-[var(--primary)] mt-1 font-bold">
            Electoral Operations
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (selectedElection?.id) {
                setSession({ resultsElectionId: selectedElection.id });
                navigate(`/results?electionId=${selectedElection.id}`);
              } else {
                navigate('/results');
              }
            }}
            className="border border-[var(--outline-variant)] px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-[var(--surface-container)] transition-colors flex items-center gap-2"
            title="View live results & tally"
          >
            <BarChart3 size={14} />
            <span>Live Results</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/create')}
            className="bg-[var(--primary)] text-[var(--on-primary)] px-5 py-2.5 text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90 transition-all shadow-sm flex items-center gap-2"
          >
            <Plus size={14} />
            <span>Create Election</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="border border-[var(--outline-variant)] px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-[var(--surface-container)] transition-colors flex items-center gap-2"
            title="Log out of admin"
          >
            <LogOut size={14} />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="w-full max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        {/* Left Column: Election List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] font-bold text-[var(--on-surface)] opacity-70">
              ELECTIONS ({filteredElections.length})
            </p>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 text-[0.58rem] uppercase tracking-wider ${
                    filter === f
                      ? 'bg-[var(--primary)] text-[var(--on-primary)] font-bold'
                      : 'border border-[var(--outline-variant)] text-[var(--on-surface)] opacity-60 hover:opacity-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredElections.map((item) => {
              const isSelected = selectedElectionId === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedElectionId(item.id)}
                  className={`w-full text-left p-5 transition-all duration-200 border ${
                    isSelected
                      ? 'bg-[var(--surface-container-lowest)] border-[var(--primary)] shadow-md'
                      : 'bg-[var(--surface-container)]/50 border-transparent hover:border-[var(--on-surface)]/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-[var(--primary)]">
                      {item.code}
                    </span>
                    <span className="px-2 py-0.5 text-[0.52rem] uppercase tracking-widest font-bold border border-[var(--on-surface)]/20 text-[var(--on-surface)]">
                      {item.status}
                    </span>
                  </div>
                  <h4 className="font-muse text-lg font-bold text-[var(--on-surface)] leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-[0.62rem] text-[var(--on-surface)] opacity-60 mt-1">
                    End: {item.end_date ? new Date(item.end_date).toLocaleDateString() : 'Unscheduled'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Election Workspace */}
        {selectedElection ? (
          <div className="space-y-6">
            {/* Top Election Detail Card */}
            <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm font-bold text-[var(--primary)] bg-[var(--surface-container)] px-2.5 py-0.5">
                      CODE: {selectedElection.code}
                    </span>
                    <span className="px-2.5 py-0.5 text-[0.55rem] uppercase tracking-widest font-bold border border-[var(--on-surface)]/20 text-[var(--on-surface)]">
                      {selectedElection.status}
                    </span>
                  </div>
                  <h3 className="font-muse text-3xl font-bold text-[var(--primary)] leading-tight">
                    {selectedElection.title}
                  </h3>
                  {selectedElection.description && (
                    <p className="text-xs text-[var(--on-surface)] opacity-70 mt-1">
                      {selectedElection.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSession({ resultsElectionId: selectedElection.id });
                      navigate(`/results?electionId=${selectedElection.id}`);
                    }}
                    className="px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] flex items-center gap-1 transition-colors"
                    title="View live tally for this election"
                  >
                    <BarChart3 size={13} />
                    <span>Results</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('open')}
                    disabled={selectedElection.status === 'open' || !!busyAction}
                    className="px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('closed')}
                    disabled={selectedElection.status === 'closed' || !!busyAction}
                    className="px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('draft')}
                    disabled={selectedElection.status === 'draft' || !!busyAction}
                    className="px-3 py-1.5 text-[0.62rem] uppercase tracking-wider font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] disabled:opacity-40 transition-colors"
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSession}
                    disabled={!!busyAction}
                    className="p-1.5 text-rose-700 hover:text-rose-900 border border-rose-300 hover:bg-rose-50 transition-colors"
                    title="Delete election"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Stat Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[var(--on-surface)]/10">
                <div>
                  <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">TOTAL VOTES</p>
                  <p className="font-muse text-2xl font-bold text-[var(--primary)]">{totalElectionVotes}</p>
                </div>
                <div>
                  <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">CANDIDATES</p>
                  <p className="font-muse text-2xl font-bold text-[var(--primary)]">{candidates.length}</p>
                </div>
                <div>
                  <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">TIME REMAINING</p>
                  <p className="text-xs font-bold font-mono text-[var(--primary)] mt-1">{remainingTimeLabel}</p>
                </div>
                <div>
                  <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-50 font-bold">VOTER CAPACITY</p>
                  <p className="text-xs font-bold text-[var(--on-surface)] mt-1">
                    {selectedElection.max_voters ? `${selectedElection.max_voters} Max` : 'Unlimited'}
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-Tab Navigation Bar */}
            <div className="flex border-b border-[var(--on-surface)]/15">
              <button
                type="button"
                onClick={() => setAdminTab('operations')}
                className={`flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all ${
                  adminTab === 'operations'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--on-surface)] opacity-50 hover:opacity-100'
                }`}
              >
                <Sliders size={15} />
                <span>Operations & Candidates</span>
              </button>

              <button
                type="button"
                onClick={() => setAdminTab('share')}
                className={`flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all ${
                  adminTab === 'share'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--on-surface)] opacity-50 hover:opacity-100'
                }`}
              >
                <Share2 size={15} />
                <span>Voter Access & Links</span>
              </button>

              <button
                type="button"
                onClick={() => setAdminTab('sandbox')}
                className={`flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-widest font-bold border-b-2 transition-all ${
                  adminTab === 'sandbox'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--on-surface)] opacity-50 hover:opacity-100'
                }`}
              >
                <FlaskConical size={15} />
                <span>Simulation Sandbox</span>
              </button>
            </div>

            {/* TAB 1: Operations & Candidates */}
            {adminTab === 'operations' && (
              <div className="space-y-6">
                {/* Candidate Roster */}
                <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-muse text-2xl font-bold text-[var(--primary)]">Candidate Roster</h4>
                    <span className="text-[0.62rem] uppercase tracking-widest text-[var(--on-surface)] opacity-60">
                      {candidates.length} Registered
                    </span>
                  </div>

                  {/* Add Candidate Sub-form */}
                  <div className="mb-6 bg-[var(--surface-container)] p-4 border border-[var(--on-surface)]/10">
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--primary)] font-bold mb-2">
                      ADD NEW CANDIDATE
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                      <input
                        type="text"
                        placeholder="Candidate Full Name"
                        value={newCandidateName}
                        onChange={(e) => setNewCandidateName(e.target.value)}
                        className="p-2.5 text-sm bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                      />
                      <input
                        type="text"
                        placeholder="Platform Statement / Bio"
                        value={newCandidateDescription}
                        onChange={(e) => setNewCandidateDescription(e.target.value)}
                        className="p-2.5 text-sm bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] text-[var(--on-surface)]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCandidate}
                        disabled={!!busyAction}
                        className="bg-[var(--primary)] text-[var(--on-primary)] px-5 py-2.5 text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  {/* Candidate List */}
                  <div className="space-y-3">
                    {candidates.map((c, i) => {
                      const votePct = totalElectionVotes > 0 ? Math.round((c.votes / totalElectionVotes) * 100) : 0;
                      return (
                        <div
                          key={c.id}
                          className="p-4 bg-[var(--surface)] border border-[var(--on-surface)]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-4">
                            <span className="font-mono text-sm font-bold text-[var(--on-surface)] opacity-40">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <div>
                              <p className="font-muse text-lg font-bold text-[var(--on-surface)]">{c.name}</p>
                              {c.description && (
                                <p className="text-xs text-[var(--on-surface)] opacity-70 mt-0.5">{c.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 self-end sm:self-center">
                            <div className="text-right">
                              <p className="text-sm font-bold text-[var(--primary)]">{c.votes} Votes</p>
                              <p className="text-[0.6rem] text-[var(--on-surface)] opacity-60 font-mono">{votePct}% of tally</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteCandidate(c.id, c.name)}
                              className="p-2 text-rose-700 hover:text-rose-900 border border-rose-300/40 hover:bg-rose-50 transition-colors"
                              title="Delete candidate"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Duration & Capacity Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* End Time Extension */}
                  <div className="bg-[var(--surface-container-lowest)] p-6 border border-[var(--on-surface)]/15">
                    <p className="text-xs uppercase tracking-[0.16em] font-bold text-[var(--primary)] mb-3 flex items-center gap-2">
                      <Clock size={15} />
                      <span>ELECTION SCHEDULE & DURATION</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => handleExtendEndTime(15 * 60 * 1000)}
                        className="px-3 py-1.5 text-[0.62rem] uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)]"
                      >
                        +15 Min
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExtendEndTime(60 * 60 * 1000)}
                        className="px-3 py-1.5 text-[0.62rem] uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)]"
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExtendEndTime(24 * 60 * 60 * 1000)}
                        className="px-3 py-1.5 text-[0.62rem] uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)]"
                      >
                        +1 Day
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="p-2 text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCustomEndDate}
                        className="px-4 py-2 text-[0.62rem] uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Voter Capacity Limit */}
                  <div className="bg-[var(--surface-container-lowest)] p-6 border border-[var(--on-surface)]/15">
                    <p className="text-xs uppercase tracking-[0.16em] font-bold text-[var(--primary)] mb-3 flex items-center gap-2">
                      <Users size={15} />
                      <span>VOTER CAPACITY LIMIT</span>
                    </p>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Leave empty for unlimited"
                        value={maxVotersInput}
                        onChange={(e) => setMaxVotersInput(e.target.value)}
                        className="p-2 text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleSaveMaxVoters}
                        className="px-4 py-2 text-[0.62rem] uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90"
                      >
                        Save
                      </button>
                    </div>
                    <p className="text-[0.62rem] text-[var(--on-surface)] opacity-60">
                      Cap total valid voter registrations for this session.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Voter Access & Links */}
            {adminTab === 'share' && (
              <div className="bg-[var(--surface-container-lowest)] p-6 md:p-8 border border-[var(--on-surface)]/15 space-y-6">
                <div>
                  <h4 className="font-muse text-2xl font-bold text-[var(--primary)] mb-1">
                    Voter Access & Share Links
                  </h4>
                  <p className="text-xs text-[var(--on-surface)] opacity-70">
                    Distribute this direct link, session code, or scannable QR code to voters.
                  </p>
                </div>

                {/* Scannable Live QR Code Card */}
                <div className="bg-[var(--surface)] p-6 border border-[var(--on-surface)]/15 flex flex-col md:flex-row items-center gap-6">
                  <div className="p-3 bg-white border border-[var(--on-surface)]/20 shadow-sm shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(voterJoinUrl)}&margin=6`}
                      alt="Election QR Code"
                      className="w-40 h-40 block"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 space-y-2.5 text-center md:text-left">
                    <span className="text-[0.58rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50">
                      SCANNABLE QR CODE
                    </span>
                    <h5 className="font-muse text-2xl font-bold text-[var(--primary)]">
                      Instant Mobile Voting Access
                    </h5>
                    <p className="text-xs text-[var(--on-surface)] opacity-70 leading-relaxed">
                      Voters can scan this QR code with any phone camera to automatically open the voting screen with the election session pre-filled.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2 justify-center md:justify-start">
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(voterJoinUrl)}&margin=12`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 text-xs uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] flex items-center gap-1.5"
                      >
                        <ExternalLink size={13} />
                        <span>Open Fullscreen QR</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Direct Link Box */}
                <div className="bg-[var(--surface)] p-6 border border-[var(--on-surface)]/15 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.58rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50">
                      DIRECT VOTER INVITE LINK
                    </span>
                    <span className="text-[0.55rem] font-mono font-bold text-[var(--on-surface)] opacity-70">READY TO SHARE</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={voterJoinUrl}
                      className="w-full p-3 text-sm font-mono bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] select-all"
                    />
                    <button
                      type="button"
                      onClick={copyJoinLink}
                      className="px-5 py-3 text-xs uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 flex items-center gap-1.5 shrink-0"
                    >
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                    </button>
                  </div>
                </div>

                {/* Session Code Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[var(--surface)] p-6 border border-[var(--on-surface)]/15 flex flex-col justify-between">
                    <div>
                      <p className="text-[0.58rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50 mb-1">
                        8-DIGIT SESSION CODE
                      </p>
                      <p className="font-mono text-3xl font-bold tracking-widest text-[var(--primary)]">
                        {selectedElection.code}
                      </p>
                      <p className="text-xs text-[var(--on-surface)] opacity-60 mt-2">
                        Voters can type this code manually on the home page sign-in.
                      </p>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={copySessionCode}
                        className="px-4 py-2 text-xs uppercase tracking-widest font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] flex items-center gap-1.5"
                      >
                        {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerateCode}
                        className="px-4 py-2 text-xs uppercase tracking-widest border border-[var(--outline-variant)] hover:bg-[var(--surface-container)]"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] p-6 border border-[var(--on-surface)]/15 flex flex-col justify-between">
                    <div>
                      <p className="text-[0.58rem] uppercase tracking-[0.2em] font-bold text-[var(--on-surface)] opacity-50 mb-1">
                        TEST AS VOTER
                      </p>
                      <h5 className="font-muse text-xl font-bold text-[var(--primary)]">Open Voter Chamber</h5>
                      <p className="text-xs text-[var(--on-surface)] opacity-60 mt-1">
                        Opens a new window pre-loaded with this election's invite code to test the voter flow.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.open(voterJoinUrl, '_blank')}
                      className="mt-4 px-5 py-2.5 text-xs uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 flex items-center justify-center gap-2"
                    >
                      <span>Open Voter Tab</span>
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Simulation Sandbox */}
            {adminTab === 'sandbox' && (
              <div className="space-y-6">
                {/* Sandbox Info Banner */}
                <div className="bg-[var(--surface-container-lowest)] border border-[var(--on-surface)]/15 p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)]">
                    ISOLATED TEST & SIMULATION SANDBOX
                  </p>
                  <p className="text-xs text-[var(--on-surface)] opacity-75 mt-1 leading-relaxed">
                    Inject mock votes to simulate high turnout, test live chart animations, and verify tie/runoff handling.
                    All simulated votes are tracked separately in the audit report.
                  </p>
                </div>

                {/* Audit Stats */}
                <div className="bg-[var(--surface-container-lowest)] p-6 border border-[var(--on-surface)]/15">
                  <h4 className="font-muse text-xl font-bold text-[var(--primary)] mb-4">Integrity & Audit Metrics</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-[var(--surface)] border border-[var(--outline-variant)]">
                      <p className="text-[0.58rem] uppercase tracking-wider text-[var(--on-surface)] opacity-60">TOTAL VOTES</p>
                      <p className="text-2xl font-bold font-muse text-[var(--primary)]">{integrity?.totalVotes || 0}</p>
                    </div>
                    <div className="p-4 bg-[var(--surface)] border border-[var(--outline-variant)]">
                      <p className="text-[0.58rem] uppercase tracking-wider text-[var(--on-surface)] opacity-60">REAL CITIZEN VOTES</p>
                      <p className="text-2xl font-bold font-muse text-[var(--on-surface)]">{integrity?.realVotes || 0}</p>
                    </div>
                    <div className="p-4 bg-[var(--surface)] border border-[var(--outline-variant)]">
                      <p className="text-[0.58rem] uppercase tracking-wider text-[var(--on-surface)] opacity-60">SIMULATED VOTES</p>
                      <p className="text-2xl font-bold font-muse text-[var(--on-surface)]">{integrity?.fakeVotes || 0}</p>
                    </div>
                    <div className="p-4 bg-[var(--surface)] border border-[var(--outline-variant)]">
                      <p className="text-[0.58rem] uppercase tracking-wider text-[var(--on-surface)] opacity-60">INTEGRITY STATUS</p>
                      <p className="text-lg font-bold font-muse text-[var(--on-surface)]">
                        {integrity?.integrityStatus === 'clean' ? 'CLEAN' : 'SIMULATED DATA'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Candidate Injection Knobs */}
                <div className="bg-[var(--surface-container-lowest)] p-6 border border-[var(--on-surface)]/15">
                  <h4 className="font-muse text-xl font-bold text-[var(--primary)] mb-4">Batch Vote Injectors</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {candidates.map((c) => (
                      <div key={c.id} className="p-4 bg-[var(--surface)] border border-[var(--outline-variant)] space-y-3">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-[var(--on-surface)]">{c.name}</p>
                          <span className="text-xs font-mono text-[var(--primary)] font-bold">{c.votes} votes</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={injectionMap[c.id] ?? 10}
                            onChange={(e) => setInjectionMap((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            className="w-24 p-2 text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleInjectFakeVotes(c.id, injectionMap[c.id] ?? 10)}
                            disabled={!!busyAction}
                            className="flex-1 py-2 px-3 text-xs uppercase tracking-widest font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90"
                          >
                            Inject Votes
                          </button>
                        </div>

                        <div className="flex gap-1.5 flex-wrap pt-1">
                          {[10, 25, 50, 100].map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => handleInjectFakeVotes(c.id, count)}
                              disabled={!!busyAction}
                              className="px-2 py-1 text-[0.55rem] uppercase tracking-wider font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)]"
                            >
                              +{count}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[var(--surface-container-lowest)] p-12 border border-[var(--on-surface)]/15 text-center flex flex-col items-center justify-center">
            <p className="font-muse text-2xl text-[var(--primary)] mb-2">No Election Selected</p>
            <p className="text-xs text-[var(--on-surface)] opacity-60 mb-6">
              Select an existing election on the left or create a new session.
            </p>
            <button
              type="button"
              onClick={() => navigate('/admin/create')}
              className="bg-[var(--primary)] text-[var(--on-primary)] px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90"
            >
              Create New Election
            </button>
          </div>
        )}
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
          busy={!!busyAction}
        />
      )}
    </div>
  );
}

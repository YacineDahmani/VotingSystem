import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteCandidate,
  deleteElection,
  getAdminElections,
  getCandidates,
  getFakeVoters,
  getIntegrityReport,
  injectFakeVotes,
  regenerateElectionCode,
  updateElectionStatus,
} from '../../lib/api';
import { getSession, isAdminSession } from '../../store/session';

const FILTERS = ['all', 'open', 'draft', 'closed'];

export default function BlueprintGrid() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);

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

  const filteredElections = useMemo(() => {
    if (filter === 'all') return elections;
    return elections.filter((item) => item.status === filter);
  }, [elections, filter]);

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) || null,
    [elections, selectedElectionId]
  );

  const loadElections = async (preferredElectionId = null) => {
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
  };

  const loadElectionDetails = async (electionId) => {
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
  };

  const refreshAll = async (preferredElectionId = null) => {
    const selected = await loadElections(preferredElectionId || selectedElectionId);
    if (selected?.id) {
      await loadElectionDetails(selected.id);
    } else {
      await loadElectionDetails(null);
    }
  };

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
  }, [session]);

  useEffect(() => {
    if (!selectedElectionId) return;

    loadElectionDetails(selectedElectionId).catch((err) => {
      setError(err.message || 'Unable to load election details');
    });
  }, [selectedElectionId]);

  const withBusy = async (label, fn) => {
    try {
      setError('');
      setBusyAction(label);
      await fn();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyAction('');
    }
  };

  const handleInject = async (candidateId, candidateName) => {
    if (!selectedElection) return;

    const rawCount = Number.parseInt(String(injectionMap[candidateId] ?? 10), 10);
    const count = Math.max(1, Math.min(10000, Number.isNaN(rawCount) ? 1 : rawCount));
    const confirmed = window.confirm(`Inject ${count} votes into ${candidateName}?`);
    if (!confirmed) return;

    await withBusy('inject', async () => {
      await injectFakeVotes(selectedElection.id, { candidateId, count });
      await refreshAll(selectedElection.id);
    });
  };

  const handleDeleteCandidate = async (candidateId, candidateName) => {
    if (!selectedElection) return;

    const confirmed = window.confirm(`Remove ${candidateName} from this session?`);
    if (!confirmed) return;

    await withBusy('delete-candidate', async () => {
      await deleteCandidate(candidateId);
      await refreshAll(selectedElection.id);
    });
  };

  const handleRegenerateCode = async () => {
    if (!selectedElection) return;
    await withBusy('regen-code', async () => {
      await regenerateElectionCode(selectedElection.id);
      await refreshAll(selectedElection.id);
    });
  };

  const handleStatusChange = async (status) => {
    if (!selectedElection) return;
    await withBusy(`status-${status}`, async () => {
      await updateElectionStatus(selectedElection.id, status);
      await refreshAll(selectedElection.id);
    });
  };

  const handleDeleteSession = async () => {
    if (!selectedElection) return;

    const confirmed = window.confirm(`Delete session "${selectedElection.title}"? This cannot be undone.`);
    if (!confirmed) return;

    await withBusy('delete-session', async () => {
      await deleteElection(selectedElection.id);
      await refreshAll(null);
    });
  };

  const copySessionCode = async () => {
    if (!selectedElection?.code) return;

    try {
      await navigator.clipboard.writeText(selectedElection.code);
    } catch {
      setError('Unable to copy session code to clipboard');
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading admin manager...</div>;
  }

  return (
    <div className="min-h-screen text-[var(--on-primary)] relative z-10 -mt-24 pt-32 px-8 pb-20">
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="label-md text-white/50 mb-2 tracking-[0.2em]">ADMIN CONTROL ROOM</p>
          <h2 className="font-muse font-bold text-6xl text-white">Session Manager</h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/admin/new')}
            className="bg-white text-[var(--primary)] px-6 py-3 uppercase text-xs tracking-widest"
          >
            Create Session
          </button>
          <button
            type="button"
            onClick={() => navigate('/results')}
            className="border border-white/60 text-white px-6 py-3 uppercase text-xs tracking-widest hover:bg-white/10 transition-colors"
          >
            View Results
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-4 bg-white text-[var(--primary)] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-muse italic text-3xl">Voting Sessions</h3>
            <span className="label-md text-gray-500">{filteredElections.length}</span>
          </div>

          <div className="flex gap-2 mb-5 flex-wrap">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`px-3 py-1 text-[0.65rem] uppercase tracking-wider border ${filter === item ? 'bg-[var(--primary)] text-white' : 'border-gray-300 text-gray-600'}`}
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
                  className={`w-full text-left border p-4 transition-colors ${isSelected ? 'border-[var(--primary)] bg-[var(--surface-container-low)]' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <p className="font-semibold text-sm">{item.title}</p>
                    <span className={`text-[0.55rem] uppercase tracking-widest ${item.status === 'open' ? 'text-green-700' : item.status === 'closed' ? 'text-gray-500' : 'text-amber-700'}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="label-md text-gray-500 mt-2">Session Code: {item.code}</p>
                  <p className="label-md text-gray-400 mt-1">
                    Votes {item.totalVotes || 0} | Real IDs {item.voterCount || 0}
                  </p>
                </button>
              );
            })}
            {!filteredElections.length ? <p className="text-sm text-gray-500">No sessions for this filter.</p> : null}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white text-[var(--primary)] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label-md text-gray-500">Selected Session</p>
                <h3 className="font-muse italic text-4xl">{selectedElection ? selectedElection.title : 'None selected'}</h3>
                <p className="label-md text-gray-500 mt-2">Code: {selectedElection?.code || '-'}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={copySessionCode} className="border border-gray-300 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection}>Copy Code</button>
                <button type="button" onClick={handleRegenerateCode} className="border border-gray-300 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection || !!busyAction}>Regenerate Code</button>
                <button type="button" onClick={() => handleStatusChange('open')} className="border border-green-700 text-green-700 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection || !!busyAction}>Open</button>
                <button type="button" onClick={() => handleStatusChange('closed')} className="border border-gray-700 text-gray-700 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection || !!busyAction}>Close</button>
                <button type="button" onClick={() => handleStatusChange('draft')} className="border border-amber-700 text-amber-700 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection || !!busyAction}>Draft</button>
                <button type="button" onClick={handleDeleteSession} className="border border-red-700 text-red-700 px-3 py-2 text-[0.65rem] uppercase tracking-widest" disabled={!selectedElection || !!busyAction}>Delete</button>
              </div>
            </div>
            {error ? <p className="label-md text-red-700 mt-4">{error}</p> : null}
          </div>

          <div className="bg-white text-[var(--primary)] p-6 shadow-xl">
            <h4 className="font-muse italic text-3xl mb-4">Integrity Console</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-gray-200 p-4"><p className="label-md text-gray-500">Total Votes</p><p className="text-3xl font-bold">{integrity?.totalVotes || 0}</p></div>
              <div className="border border-gray-200 p-4"><p className="label-md text-gray-500">Real Votes</p><p className="text-3xl font-bold text-green-700">{integrity?.realVotes || 0}</p></div>
              <div className="border border-gray-200 p-4"><p className="label-md text-gray-500">Fake Votes</p><p className="text-3xl font-bold text-red-700">{integrity?.fakeVotes || 0}</p></div>
              <div className="border border-gray-200 p-4"><p className="label-md text-gray-500">Validity</p><p className={`text-2xl font-bold ${integrity?.integrityStatus === 'clean' ? 'text-green-700' : 'text-red-700'}`}>{integrity?.integrityStatus === 'clean' ? 'CLEAN' : 'RIGGED'}</p></div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(integrity?.candidates || []).map((item) => (
                <div key={item.id} className="border border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{item.name}</p>
                    {item.fakeVotes > 0 ? <span className="text-[0.6rem] uppercase tracking-widest text-red-700">rigged</span> : <span className="text-[0.6rem] uppercase tracking-widest text-green-700">valid</span>}
                  </div>
                  <p className="label-md text-gray-500 mt-2">Real: {item.realVotes} | Fake: {item.fakeVotes} | Total: {item.totalVotes}</p>
                </div>
              ))}
            </div>

            <p className="label-md text-gray-500 mt-4">Fake voter records tracked: {fakeVoterAudit.length}</p>
          </div>

          <div className="bg-white text-[var(--primary)] p-6 shadow-xl">
            <h4 className="font-muse italic text-3xl mb-4">Injection Controls</h4>
            <p className="text-sm text-gray-600 mb-5">
              Set an exact number of votes to inject. Use quick-step buttons for larger stress tests.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="border border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{candidate.name}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                      disabled={!!busyAction}
                      className="text-red-700 text-xs uppercase tracking-widest"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="label-md text-gray-500 mt-1">Current votes: {candidate.votes}</p>
                  <label className="label-md text-gray-500 mt-3 block">Inject Count</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={injectionMap[candidate.id] ?? 10}
                    onChange={(event) => setInjectionCount(candidate.id, event.target.value)}
                    className="w-full mt-2 border border-gray-300 px-3 py-2"
                  />
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {[10, 25, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => bumpInjectionCount(candidate.id, step)}
                        className="border border-gray-300 px-2 py-1 text-[0.65rem] uppercase tracking-widest"
                      >
                        +{step}
                      </button>
                    ))}
                    {[10, 25].map((step) => (
                      <button
                        key={`minus-${step}`}
                        type="button"
                        onClick={() => bumpInjectionCount(candidate.id, -step)}
                        className="border border-gray-300 px-2 py-1 text-[0.65rem] uppercase tracking-widest"
                      >
                        -{step}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInject(candidate.id, candidate.name)}
                    disabled={!!busyAction}
                    className="mt-3 bg-[var(--primary)] text-white w-full py-2 uppercase text-xs tracking-widest"
                  >
                    Inject
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

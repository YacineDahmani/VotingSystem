import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Info, Pause, Play, Radio, ShieldAlert, ShieldCheck } from 'lucide-react';
import { enterRunoff, getActiveElection, getAdminElections, getIntegrityReport, getResults } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import {
  VOTER_PHASES,
  clearSession,
  getSession,
  isAdminSession,
  isVoterSession,
  setSession,
  setVoterPhase,
  useSession,
} from '../../store/session';

function isElectionFinished(election) {
  if (!election) {
    return false;
  }

  if (election.status === 'closed') {
    return true;
  }

  if (!election.end_date) {
    return false;
  }

  const endDate = new Date(election.end_date);
  return !Number.isNaN(endDate.getTime()) && Date.now() >= endDate.getTime();
}

export default function ResultsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const MotionDiv = motion.div;
  const session = useSession();
  const adminView = isAdminSession(session);
  const guestResultsView = !adminView && !session?.token && !!session?.resultsElectionId;
  const endedNotice = session?.resultsNotice || '';

  const [adminElectionList, setAdminElectionList] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(
    searchParams.get('electionId') || searchParams.get('id') || session?.resultsElectionId || session?.electionId || null
  );
  const [results, setResults] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [error, setError] = useState('');

  // Load elections for admin selector
  useEffect(() => {
    if (adminView) {
      getAdminElections()
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.elections || []);
          setAdminElectionList(list);
          if (!selectedElectionId && list.length > 0) {
            setSelectedElectionId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [adminView, selectedElectionId]);

  useEffect(() => {
    let mounted = true;

    async function loadResults() {
      try {
        setError('');

        let electionId = selectedElectionId;
        if (!electionId) {
          if (adminView) {
            const list = await getAdminElections().catch(() => []);
            const elections = Array.isArray(list) ? list : (list?.elections || []);
            electionId = elections[0]?.id;
            if (electionId && mounted) {
              setSelectedElectionId(electionId);
            }
          } else {
            const active = await getActiveElection().catch(() => null);
            electionId = active?.election?.id;
          }
        }

        if (!electionId) {
          throw new Error('No election available for results. Please create or start an election.');
        }

        const response = await getResults(electionId);
        if (!mounted) return;

        setSession({
          electionStatus: response?.election?.status,
          electionEndAt: response?.election?.end_date || null,
        });

        const currentSession = getSession();
        const isVoter = isVoterSession(currentSession);
        if (isVoter && !isElectionFinished(response?.election) && currentSession?.electionId === response?.election?.id) {
          setVoterPhase(VOTER_PHASES.WAITING);
          navigate('/waiting');
          return;
        }

        if (isVoter && isElectionFinished(response?.election)) {
          setVoterPhase(VOTER_PHASES.RESULTS);
        }

        if (adminView) {
          try {
            const integrityResponse = await getIntegrityReport(electionId);
            if (mounted) {
              setIntegrity(integrityResponse);
            }
          } catch {
            if (mounted) {
              setIntegrity(null);
            }
          }
        }

        setResults(response);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Unable to load results');
      }
    }

    loadResults();

    return () => {
      mounted = false;
    };
  }, [adminView, guestResultsView, navigate, selectedElectionId]);

  if (!results && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--surface)] text-[var(--on-surface)]">
        <p className="font-muse text-2xl">Loading results & audit...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-[var(--surface)] text-[var(--on-surface)]">
        <div className="bg-[var(--surface-container-lowest)] p-8 border border-[var(--on-surface)]/20 shadow-lg text-center max-w-md">
          <p className="text-xs uppercase tracking-[0.2em] font-bold opacity-60 mb-2">RESULTS UNAVAILABLE</p>
          <p className="text-sm font-medium mb-6 opacity-90">{error}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {adminView ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="px-5 py-2.5 bg-[var(--primary)] text-[var(--on-primary)] text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90 transition-all shadow-sm"
                >
                  Admin Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/create')}
                  className="px-5 py-2.5 border border-[var(--outline-variant)] text-xs uppercase tracking-widest font-bold hover:bg-[var(--surface-container)] transition-all"
                >
                  Create Election
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-[var(--primary)] text-[var(--on-primary)] text-xs uppercase tracking-widest font-bold hover:bg-[var(--primary)]/90 transition-all shadow-md"
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalVotes = results?.totalVotes || 0;
  const maxVoters = results?.election?.max_voters || null;
  const turnoutPercentage = maxVoters ? ((totalVotes / maxVoters) * 100).toFixed(1) : null;
  const totalCandidates = results?.candidates?.length || 0;
  const topVotes = results?.candidates?.[0]?.votes || 0;
  const runnerUpVotes = results?.candidates?.[1]?.votes || 0;
  const winnerShare = totalVotes > 0 ? ((topVotes / totalVotes) * 100).toFixed(1) : '0.0';
  const winnerMarginVotes = Math.max(0, topVotes - runnerUpVotes);
  const averageVotesPerCandidate = totalCandidates > 0 ? (totalVotes / totalCandidates).toFixed(1) : '0.0';

  const distribution = (results?.candidates || []).map((candidate, index) => {
    const relativeToMaxPercentage = maxVoters ? ((candidate.votes / maxVoters) * 100).toFixed(1) : null;
    
    return {
      id: candidate.id,
      name: candidate.name,
      votes: candidate.votes,
      percentage: `${candidate.percentage}%`,
      relativePercentage: relativeToMaxPercentage ? `${relativeToMaxPercentage}%` : null,
      width: `${candidate.percentage}%`,
      barColor: index === 0 ? 'bg-[var(--primary)]' : index === 1 ? 'bg-gray-400' : 'bg-[var(--surface-container-high)]',
    };
  });

  const ageGroups = results?.ageGroups || [];
  const highestAgeGroupVotes = ageGroups.length ? Math.max(...ageGroups.map((item) => item.total)) : 0;
  const lowestAgeGroupVotes = ageGroups.length ? Math.min(...ageGroups.map((item) => item.total)) : 0;

  const metrics = ageGroups.map((item) => {
    let type = 'normal';
    if (item.total === highestAgeGroupVotes) type = 'bold';
    if (item.total === lowestAgeGroupVotes) type = 'light';

    return {
      group: item.age_group,
      stat: `${item.total} votes`,
      type,
    };
  });

  const winnerName = results?.leader?.name || distribution[0]?.name || 'No winner yet';
  const runoffElection = results?.runoffElection || null;
  const isTieResult = Boolean(results?.isTie);
  const tiedTopCandidates = isTieResult ? (results?.tiedCandidates || []) : [];
  const isOpenElection = results?.election?.status === 'open' && !isElectionFinished(results?.election);
  const heroLabel = isTieResult
    ? 'TIE'
    : isOpenElection
      ? 'LIVE STANDINGS (ELECTION IN PROGRESS)'
      : 'WINNER';
  const heroTitle = isTieResult ? 'Runoff Required' : winnerName;

  const { pushToast } = useToast();
  const [countdown, setCountdown] = useState(6);
  const [isAutoRedirectPaused, setIsAutoRedirectPaused] = useState(false);
  const [isEnteringRunoff, setIsEnteringRunoff] = useState(false);
  const [runoffError, setRunoffError] = useState('');

  const isVoter = !adminView && isVoterSession(session);
  const shouldAutoRedirect = isVoter && isTieResult && Boolean(runoffElection);

  const handleRunoffContinue = async () => {
    if (isEnteringRunoff) return;
    setIsEnteringRunoff(true);
    setRunoffError('');

    try {
      const sourceId = results?.election?.id || selectedElectionId || session?.electionId;
      const data = await enterRunoff(sourceId);
      if (data?.token && data?.election) {
        setSession({
          electionId: data.election.id,
          electionTitle: data.election.title,
          electionStatus: data.election.status || 'open',
          electionEndAt: data.election.end_date || null,
          token: data.token,
          voterId: data.voter.id,
          hasVoted: false,
          selectedCandidateId: null,
          votedCandidateName: null,
          voteReceiptCode: null,
          round: data.round || (results?.election?.round ? results.election.round + 1 : 2),
          phase: VOTER_PHASES.vote,
          resultsElectionId: null,
          resultsNotice: null,
        });
        setVoterPhase(VOTER_PHASES.vote);
        pushToast({
          type: 'info',
          title: 'Round 2 Runoff',
          message: 'Redirected to runoff ballot. Cast your deciding vote.',
        });
        navigate('/vote');
      } else {
        throw new Error('Runoff session credentials could not be issued.');
      }
    } catch (err) {
      setIsEnteringRunoff(false);
      setIsAutoRedirectPaused(true);
      setRunoffError(err?.message || 'Failed to enter runoff round. Please try again.');
      pushToast({
        type: 'error',
        title: 'Runoff Error',
        message: err?.message || 'Failed to enter runoff round.',
      });
    }
  };

  useEffect(() => {
    if (!shouldAutoRedirect || isAutoRedirectPaused || isEnteringRunoff) {
      return;
    }

    if (countdown <= 0) {
      handleRunoffContinue();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleRunoffContinue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [shouldAutoRedirect, isAutoRedirectPaused, countdown, isEnteringRunoff]);

  const handleExitResults = () => {
    clearSession();
    navigate('/');
  };

  return (
    <MotionDiv 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[var(--surface-container-lowest)] text-[var(--primary)] font-grotesque overflow-x-hidden pt-20"
    >
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-12 relative z-10">
        {adminView && isOpenElection ? (
          <div className="mb-6 p-4 bg-white dark:bg-[#15202b] border border-blue-200 dark:border-blue-900 border-l-4 border-l-blue-600 dark:border-l-blue-400 text-xs text-[var(--on-surface)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                LIVE PREVIEW
              </span>
              <span className="text-xs text-[var(--on-surface)] opacity-85">Voting is currently open. Showing live interim tallies.</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-3.5 py-1.5 text-xs uppercase tracking-wider font-bold border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] transition-colors shrink-0"
            >
              Admin Dashboard
            </button>
          </div>
        ) : null}

        {endedNotice ? (
          <div className="mb-8 p-4 bg-white dark:bg-[#262018] border border-amber-200 dark:border-amber-900 border-l-4 border-l-amber-600 dark:border-l-amber-400 text-[var(--on-surface)] shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                NOTICE
              </span>
              <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
                Voting ENDED
              </p>
            </div>
            <p className="text-xs text-[var(--on-surface)] opacity-80 leading-relaxed mt-1">{endedNotice}</p>
          </div>
        ) : null}

        {/* Official Administrative Disclosure / Simulation Notice */}
        {(results?.admin_notice || results?.election?.admin_notice) ? (
          <div className="mb-8 p-6 bg-[var(--surface-container-high)] border border-amber-500/40 border-l-4 border-l-amber-500 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                OFFICIAL ADMINISTRATIVE NOTICE
              </span>
              <span className="text-[0.62rem] font-mono text-[var(--on-surface)] opacity-60">
                Published by Election Administration
              </span>
            </div>
            <p className="text-sm font-medium text-[var(--on-surface)] leading-relaxed">
              {results?.admin_notice || results?.election?.admin_notice}
            </p>
          </div>
        ) : null}

        {adminView && integrity ? (
          <div className={`mb-8 p-4 bg-white ${integrity.integrityStatus === 'clean' ? 'dark:bg-[#16221c] border-emerald-200 dark:border-emerald-900 border-l-4 border-l-emerald-600 dark:border-l-emerald-400' : 'dark:bg-[#281a1c] border-rose-200 dark:border-rose-900 border-l-4 border-l-rose-600 dark:border-l-rose-400'} border text-[var(--on-surface)] shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-wider ${integrity.integrityStatus === 'clean' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                {integrity.integrityStatus === 'clean' ? 'INTEGRITY AUDIT: CLEAN' : 'INTEGRITY AUDIT: SIMULATED VOTES DETECTED'}
              </span>
            </div>
            <p className="text-xs opacity-85 mt-1">
              Verified Citizen Votes: <strong>{integrity.realVotes}</strong> • Simulated Sandbox Votes: <strong>{integrity.fakeVotes}</strong>
            </p>
          </div>
        ) : null}

        {/* Voter Tie & Automatic Runoff Staging Banner */}
        {isVoter && isTieResult && (
          <div className="mb-12 border-l-4 border-l-amber-500 border border-[var(--outline-variant)] bg-[var(--surface-container)] p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 text-[0.65rem] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    ROUND 1 ENDED IN A TIE
                  </span>
                  {runoffElection && (
                    <span className="text-xs font-mono text-[var(--on-surface)] opacity-70">
                      Round 2 Active
                    </span>
                  )}
                </div>
                <h3 className="font-muse text-2xl font-bold text-[var(--on-surface)]">
                  {tiedTopCandidates.length > 0
                    ? `${tiedTopCandidates.map((c) => c.name).join(' and ')} are tied with ${tiedTopCandidates[0]?.votes} votes each.`
                    : 'The election ended in a tie.'}
                </h3>
                <p className="text-xs text-[var(--on-surface)] opacity-80 max-w-2xl leading-relaxed">
                  A second round (Runoff) has been opened to determine the winner. You can proceed directly to cast your deciding vote in Round 2, or pause to review the first round breakdown below.
                </p>

                {runoffError && (
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mt-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {runoffError}
                  </p>
                )}
              </div>

              {runoffElection ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAutoRedirectPaused((prev) => !prev)}
                    className="px-4 py-2.5 text-xs font-mono uppercase tracking-wider border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {isAutoRedirectPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Resume Countdown
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Pause ({countdown}s)
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRunoffContinue}
                    disabled={isEnteringRunoff}
                    className="px-6 py-2.5 text-xs font-mono uppercase tracking-wider font-bold bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90 transition-transform active:scale-[0.98] flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {isEnteringRunoff ? (
                      'Entering Round 2...'
                    ) : (
                      <>
                        Vote in Round 2 {!isAutoRedirectPaused && `(${countdown}s)`}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Header section */}
        <div className="mb-24">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            {adminView && adminElectionList.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-[0.62rem] uppercase tracking-widest font-bold text-[var(--on-surface)] opacity-70">
                  ELECTION:
                </span>
                <select
                  value={selectedElectionId || results?.election?.id || ''}
                  onChange={(e) => {
                    const newId = Number(e.target.value);
                    setSelectedElectionId(newId);
                    setSearchParams({ electionId: newId });
                    setSession({ resultsElectionId: newId });
                  }}
                  className="p-1.5 text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] font-mono font-bold"
                >
                  {adminElectionList.map((el) => (
                    <option key={el.id} value={el.id}>
                      {el.code} — {el.title} [{el.status.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>
            ) : <div />}

            {adminView ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="border border-[var(--on-surface)]/20 bg-[var(--surface-container-low)]/70 px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:border-[var(--on-surface)]/40 hover:-translate-y-0.5 shadow-sm active:translate-y-0"
                >
                  Admin Dashboard
                </button>
              </div>
            ) : null}
          </div>

          <p className="label-md text-[var(--secondary)] mb-12 tracking-widest font-bold">
            {heroLabel}
          </p>
          
          <h1 className="font-muse italic text-8xl md:text-[11rem] leading-[0.9] text-[var(--primary)] max-w-2xl animate-ink-bleed">
            {heroTitle.split(' ')[0]}<br />{heroTitle.split(' ').slice(1).join(' ')}
          </h1>
          
          <div className="mt-12 max-w-xs label-md text-[0.6rem] leading-[1.8] text-[var(--on-surface)] opacity-50 tracking-[0.15em]">
            <p>
              {isTieResult
                ? 'The final count ended in a tie. A runoff election is required to determine the winner.'
                : 'Final results.'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface-container-low)] w-full py-24 relative z-10">
        <div className="w-full max-w-6xl mx-auto px-12 grid grid-cols-1 md:grid-cols-12 gap-16">
          
          <div className="md:col-span-4 flex flex-col gap-6">
            <div>
              <h3 className="label-md font-bold text-[var(--on-surface)] opacity-60 tracking-[0.2em] mb-4 border-b-2 border-[var(--on-surface)] pb-2">
                VOTE TOTALS
              </h3>
            </div>
            
            <div className="bg-[var(--surface-container)] border border-[var(--outline-variant)] p-6 flex flex-col gap-4 mt-2 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[var(--primary)] opacity-40"></div>
              <div>
                <p className="label-md text-[0.65rem] tracking-widest opacity-60 mb-1">TOTAL VOTES</p>
                <div className="font-muse text-5xl text-[var(--primary)]">{totalVotes}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="border-t border-[var(--outline-variant)]/50 pt-4">
                  <p className="label-md text-[0.6rem] tracking-widest opacity-50 mb-1">CANDIDATES</p>
                  <p className="font-muse text-2xl text-[var(--on-surface)]">{totalCandidates}</p>
                </div>
                <div className="border-t border-[var(--outline-variant)]/50 pt-4">
                  <p className="label-md text-[0.6rem] tracking-widest opacity-50 mb-1">AVG / CANDIDATE</p>
                  <p className="font-muse text-2xl text-[var(--on-surface)]">{averageVotesPerCandidate}</p>
                </div>
                <div className="border-t border-[var(--outline-variant)]/50 pt-4">
                  <p className="label-md text-[0.6rem] tracking-widest opacity-50 mb-1">WINNER SHARE</p>
                  <p className="font-muse text-2xl text-[var(--on-surface)]">{winnerShare}%</p>
                </div>
                <div className="border-t border-[var(--outline-variant)]/50 pt-4">
                  <p className="label-md text-[0.6rem] tracking-widest opacity-50 mb-1">VICTORY MARGIN</p>
                  <p className="font-muse text-2xl text-[var(--on-surface)]">{winnerMarginVotes}</p>
                </div>
              </div>

              {maxVoters && (
                <div className="pt-4 border-t border-[var(--outline-variant)]/50 mt-2">
                  <p className="label-md text-[0.65rem] tracking-widest opacity-60 mb-1">VOTER CAP</p>
                  <div className="flex items-end gap-3">
                    <p className="font-muse text-3xl">{maxVoters}</p>
                    <p className="text-xs opacity-60 mb-1 pb-0.5">({turnoutPercentage}% turnout)</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-8 flex flex-col gap-12 mt-2">
            {distribution.map((candidate) => (
              <div key={candidate.name}>
                <div className="flex justify-between items-end mb-4">
                  <h4 className="font-muse italic text-3xl text-[var(--on-surface)] opacity-90">{candidate.name}</h4>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-3">
                      <span className="label-md text-[0.65rem] tracking-widest opacity-50">{candidate.votes} votes</span>
                      <span className="font-bold text-xl">{candidate.percentage}</span>
                    </div>
                  </div>
                </div>
                {adminView && integrity?.candidates ? (
                  <p className="label-md text-[0.6rem] text-[var(--on-surface)] opacity-60 mb-2">
                    {(() => {
                      const integrityCandidate = integrity.candidates.find((item) => item.id === candidate.id);
                      if (!integrityCandidate) return 'Real: 0 | Simulated: 0';
                      return `Real: ${integrityCandidate.realVotes} | Simulated: ${integrityCandidate.fakeVotes}`;
                    })()}
                  </p>
                ) : null}
                {/* Carved bar background */}
                <div className="h-10 w-full bg-[var(--surface-container-high)] shadow-[var(--layer-recessed)] relative overflow-hidden">
                   <div 
                     className={`h-full ${candidate.barColor} absolute top-0 left-0 transition-all duration-1000 ease-out`}
                     style={{ width: candidate.width }}
                   />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="w-full py-24 relative z-10">
         <div className="w-full max-w-6xl mx-auto px-12">
           <h3 className="label-md font-bold italic text-[var(--on-surface)] opacity-50 tracking-[0.2em] mb-12 border-none">
             AGE DEMOGRAPHICS
           </h3>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-10">
             {metrics.map((metric, i) => (
               <div key={i} className="flex justify-between items-center border-b border-[var(--on-surface)]/10 pb-4">
                 <span className="label-md text-[var(--on-surface)] opacity-50 text-[0.6rem]">{metric.group}</span>
                 <span className={`font-muse italic text-xl ${
                    metric.type === 'bold' ? 'font-bold text-[var(--on-surface)]' : 
                    metric.type === 'light' ? 'font-light text-[var(--on-surface)] opacity-50' : 'text-[var(--on-surface)] opacity-90'
                 }`}>
                   {metric.stat}
                 </span>
               </div>
             ))}
           </div>

           {runoffElection ? (
             <div className="mt-16 p-8 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]">
               <p className="label-md text-[var(--secondary)] font-bold tracking-[0.2em] mb-3">RUNOFF ELECTION</p>
               <p className="text-sm text-[var(--on-surface)] opacity-80 mb-6">
                 This election ended in a tie. A runoff election has been created: {runoffElection.title}.
               </p>
               {tiedTopCandidates.length ? (
                 <div className="mb-6 border border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-3">
                   <p className="label-md text-[0.62rem] tracking-widest text-[var(--on-surface)] opacity-60 mb-2">
                     TIED CANDIDATES ({tiedTopCandidates.length})
                   </p>
                   <p className="text-sm text-[var(--on-surface)] opacity-90">
                     {tiedTopCandidates.map((candidate) => candidate.name).join(' • ')}
                   </p>
                 </div>
               ) : null}
                {!adminView ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      onClick={handleRunoffContinue}
                      disabled={isEnteringRunoff}
                      className="bg-[var(--primary)] text-[var(--on-primary)] px-6 py-3 uppercase text-xs tracking-widest font-bold transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 min-h-[44px] flex items-center gap-2"
                    >
                      {isEnteringRunoff ? (
                        'Entering Round 2...'
                      ) : (
                        <>
                          Vote in Second Round
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    {!isAutoRedirectPaused && shouldAutoRedirect && (
                      <span className="text-xs font-mono text-[var(--on-surface)] opacity-70">
                        Auto-redirecting in {countdown}s
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/admin')}
                    className="bg-[var(--primary)] text-[var(--on-primary)] px-6 py-3 uppercase text-xs tracking-widest font-bold transition-all duration-200 hover:bg-[var(--primary)]/90 min-h-[44px]"
                  >
                    Manage Runoff in Admin Console
                  </button>
                )}
             </div>
           ) : results?.isTie ? (
             <div className="mt-16 p-8 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]">
               <p className="label-md text-[var(--secondary)] font-bold tracking-[0.2em] mb-3">TIE</p>
               <p className="text-sm text-[var(--on-surface)] opacity-80 mb-3">
                 Final results are tied. A runoff session is being prepared.
               </p>
               {tiedTopCandidates.length ? (
                 <p className="text-sm text-[var(--on-surface)] opacity-90">
                   Tied candidates: {tiedTopCandidates.map((candidate) => candidate.name).join(' • ')}
                 </p>
               ) : null}
             </div>
           ) : null}
         </div>
      </div>
    </MotionDiv>
  );
}

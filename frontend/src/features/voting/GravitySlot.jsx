import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { castVote, getCandidates, getResults } from '../../lib/api';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { VOTER_PHASES, clearSession, getSession, getVoterPhase, markVoteSubmitted, setSession, setVoterPhase } from '../../store/session';

export default function GravitySlot() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.id === selectedCandidateId) || null,
    [candidates, selectedCandidateId]
  );

  const exitBallot = () => {
    clearSession();
    navigate('/');
  };

  const redirectEndedSessionToResults = (message) => {
    setSession({
      electionStatus: 'closed',
      resultsElectionId: session.electionId,
      resultsNotice: message || 'This voting session has already ended. Showing final results.',
    });
    setVoterPhase(VOTER_PHASES.RESULTS);
    navigate('/results', { replace: true });
  };

  const isEndedSessionError = (err) => {
    const message = (err?.message || '').toLowerCase();
    return message.includes('ended') || message.includes('closed') || err?.data?.reason === 'ended' || err?.data?.reason === 'closed';
  };

  useEffect(() => {
    if (!session.electionId || !session.voterId) {
      navigate('/');
      return;
    }

    const phase = getVoterPhase(session);
    if (phase === 'results') {
      navigate('/results', { replace: true });
      return;
    }

    if (session.hasVoted || phase === 'waiting') {
      navigate('/waiting', { replace: true });
      return;
    }

    let mounted = true;

    async function loadCandidates() {
      try {
        const results = await getResults(session.electionId);
        if (!mounted) return;

        const endDate = results?.election?.end_date ? new Date(results.election.end_date) : null;
        const hasEndedByTime = !!endDate && !Number.isNaN(endDate.getTime()) && Date.now() >= endDate.getTime();
        if (results?.election?.status === 'closed' || hasEndedByTime) {
          redirectEndedSessionToResults('This voting session has already ended. Redirecting to results.');
          return;
        }

        const result = await getCandidates(session.electionId);
        if (!mounted) return;
        setCandidates(result.candidates || []);
      } catch (err) {
        if (!mounted) return;

        if (isEndedSessionError(err)) {
          redirectEndedSessionToResults('This voting session has already ended. Redirecting to results.');
          return;
        }

        setError(err.message || 'Failed to load candidates');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCandidates();

    return () => {
      mounted = false;
    };
  }, [navigate, session]);

  const openConfirmation = () => {
    if (!selectedCandidateId || isSubmitting) {
      return;
    }
    setShowConfirm(true);
  };

  const confirmVote = async () => {
    if (!selectedCandidateId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await castVote(session.electionId, {
        candidateId: selectedCandidateId,
      });

      markVoteSubmitted(selectedCandidateId);

      pushToast({
        type: result?.notification?.type || 'success',
        title: result?.notification?.title || 'Vote Registered',
        message: result?.notification?.body || `Your vote for ${selectedCandidate?.name || 'the selected candidate'} was recorded.`,
      });

      navigate('/waiting');
    } catch (err) {
      const message = err.message || 'Unable to submit vote';

      if (isEndedSessionError(err)) {
        pushToast({
          type: 'info',
          title: 'Session Ended',
          message: 'This voting session has already ended. Showing final results.',
        });
        redirectEndedSessionToResults('This voting session has already ended. Showing final results.');
        return;
      }

      setError(message);
      pushToast({
        type: 'error',
        title: 'Vote Failed',
        message,
      });
    } finally {
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[90vh] flex flex-col items-center justify-center gap-4 label-md px-6 text-center">
        <p>Loading ballot...</p>
        <button
          type="button"
          onClick={exitBallot}
          className="border border-[var(--outline-variant)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)]"
        >
          Return To Entry
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[90vh] flex flex-col items-center pt-16 pb-40 overflow-hidden">
      <div className="absolute top-[40%] flex items-center justify-center pointer-events-none select-none z-0">
        <span className="font-muse text-[25vw] leading-none text-[var(--on-surface)]/[0.03] whitespace-nowrap">
          BALLOT
        </span>
      </div>

      <div className="w-full max-w-[1400px] px-12 mb-10 z-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="label-md text-[var(--on-surface)] opacity-60 font-bold tracking-[0.1em]">PHASE 01 - SELECTION</p>
          <button
            type="button"
            onClick={exitBallot}
            className="border border-[var(--outline-variant)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)] hover:-translate-y-0.5 shadow-sm active:translate-y-0"
          >
            Exit Ballot
          </button>
        </div>
        <h2 className="font-muse text-5xl text-[var(--primary)] max-w-2xl leading-[1.1]">
          Choose one candidate, confirm, then submit your vote once.
        </h2>
      </div>

      <div className="w-full max-w-[1400px] px-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 z-20">
        {candidates.map((candidate, index) => {
          const selected = selectedCandidateId === candidate.id;
          return (
            <button
              type="button"
              key={candidate.id}
              onClick={() => setSelectedCandidateId(candidate.id)}
              disabled={isSubmitting}
              className={`paper-float bg-[var(--surface-container-lowest)] p-12 aspect-[3/4] flex flex-col justify-between text-left transition-all duration-200 border-2 ${selected ? 'border-[var(--primary)] shadow-none md:shadow-2xl' : 'border-transparent hover:border-[var(--on-surface)]/15 shadow-none'}`}
            >
              <span className="font-muse text-[8rem] text-[var(--on-surface)]/10 leading-none -ml-4">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="label-md text-[var(--on-surface)] opacity-50 mb-4">CANDIDATE</p>
                <h3 className="font-muse text-3xl text-[var(--primary)] leading-tight">
                  {candidate.name}
                </h3>
                {candidate.description && (
                  <p className="text-sm text-[var(--on-surface)] opacity-80 mt-2 italic">
                    {candidate.description}
                  </p>
                )}
                <p className="label-md mt-4 text-[var(--on-surface)] opacity-60">
                  {selected ? 'Selected for confirmation' : 'Click to select'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--on-surface)]/10 bg-[var(--surface)]/95 backdrop-blur-md py-5 z-30">
        <div className="mx-auto w-full max-w-[1400px] px-12 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="label-md text-[var(--on-surface)] opacity-80 tracking-[0.08em]">
            {selectedCandidate
              ? `Selected: ${selectedCandidate.name}`
              : 'Select one candidate to enable vote submission'}
          </p>
          <button
            type="button"
            onClick={openConfirmation}
            disabled={!selectedCandidateId || isSubmitting}
            className="bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3 uppercase text-xs tracking-[0.16em] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
          >
            {isSubmitting ? 'Submitting Vote...' : 'Submit Vote'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-8 z-20 flex flex-col items-center gap-3">
          <p className="label-md text-red-700">{error}</p>
          <button
            type="button"
            onClick={exitBallot}
            className="border border-[var(--outline-variant)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)]"
          >
            Return To Entry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border border-[var(--outline-variant)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)]"
          >
            Retry Loading Ballot
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={showConfirm}
        title="Confirm Vote"
        message={selectedCandidate ? `Submit your final vote for ${selectedCandidate.name}? This cannot be changed.` : 'Submit this vote?'}
        confirmLabel="Confirm Vote"
        cancelLabel="Review Again"
        onCancel={() => setShowConfirm(false)}
        onConfirm={confirmVote}
        busy={isSubmitting}
      />
    </div>
  );
}

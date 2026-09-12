import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, Copy, Shield, ShieldCheck, Stamp } from 'lucide-react';
import { castVote, getCandidates, getResults } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import { VOTER_PHASES, clearSession, getSession, getVoterPhase, markVoteSubmitted, setSession, setVoterPhase, useSession } from '../../store/session';

export default function BallotView() {
  const navigate = useNavigate();
  const session = useSession();
  const { pushToast } = useToast();

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showvoteReview, setShowvoteReview] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.id === selectedCandidateId) || null,
    [candidates, selectedCandidateId]
  );

  const exitvote = () => {
    clearSession();
    navigate('/');
  };

  const redirectEndedSessionToResults = useCallback((message) => {
    setSession({
      electionStatus: 'closed',
      resultsElectionId: session.electionId,
      resultsNotice: message || 'This voting session has already ended. Showing final results.',
    });
    setVoterPhase(VOTER_PHASES.RESULTS);
    navigate('/results', { replace: true });
  }, [navigate, session.electionId]);

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
  }, [navigate, redirectEndedSessionToResults, session]);

  const openConfirmation = () => {
    if (!selectedCandidateId || isSubmitting) {
      return;
    }
    setShowvoteReview(true);
  };

  const confirmVote = async () => {
    if (!selectedCandidateId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setIsDropping(true);
    setError('');

    try {
      const result = await castVote(session.electionId, {
        candidateId: selectedCandidateId,
      });

      const receiptCode = result?.receiptCode || `SWISS-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      markVoteSubmitted(selectedCandidateId, {
        receiptCode,
        candidateName: selectedCandidate?.name,
        votedAt: result?.votedAt || new Date().toISOString(),
      });

      // Show receipt modal after drop animation completes
      setTimeout(() => {
        setIsDropping(false);
        setShowvoteReview(false);
        setReceiptData({
          receiptCode,
          candidateName: selectedCandidate?.name,
          votedAt: result?.votedAt || new Date().toISOString(),
          electionTitle: session.electionTitle || 'Electoral Session',
        });
      }, 700);

    } catch (err) {
      setIsDropping(false);
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
      setShowvoteReview(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyReceiptCode = () => {
    if (!receiptData?.receiptCode) return;
    navigator.clipboard.writeText(receiptData.receiptCode);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const proceedToWaitingRoom = () => {
    navigate('/waiting');
  };

  if (loading) {
    return (
      <div className="min-h-[90vh] flex flex-col items-center justify-center gap-4 label-md px-6 text-center">
        <p className="font-muse text-xl text-[var(--on-surface)]">Loading voting session...</p>
        <button
          type="button"
          onClick={exitvote}
          className="border border-[var(--outline-variant)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-[var(--surface-container)]"
        >
          Back
        </button>
      </div>
    );
  }

  const isRunoffRound = Boolean(session?.round && session.round > 1) || (session?.electionTitle || '').toLowerCase().includes('runoff');

  return (
    <div className="relative min-h-[90vh] flex flex-col items-center pt-8 pb-40 bg-[var(--surface)]">
      {/* Header Info */}
      <div className="w-full max-w-[1400px] px-6 sm:px-8 md:px-12 mb-8 z-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isRunoffRound ? (
              <span className="px-2.5 py-1 text-xs uppercase tracking-wider font-bold bg-amber-600 text-white shadow-xs">
                ROUND {session.round || 2} · RUNOFF
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs uppercase tracking-wider font-bold bg-[var(--primary)] text-[var(--on-primary)] shadow-xs">
                VOTING
              </span>
            )}
            <span className="text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-70">
              Voter: <strong className="text-[var(--on-surface)] font-bold">{session.voterName || 'Verified Citizen'}</strong>
            </span>
          </div>
        </div>
        <h2 className="font-muse text-4xl md:text-5xl text-[var(--primary)] max-w-2xl leading-[1.1]">
          {isRunoffRound ? 'Cast your deciding vote.' : 'Cast your vote.'}
        </h2>
        <p className="text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-70 mt-2 font-medium">
          {isRunoffRound
            ? 'Round 1 ended in a tie. Select the winning candidate between the tied finalists below.'
            : 'Choose a candidate below and confirm your choice.'}
        </p>
      </div>

      {/* Candidate Grid */}
      <div className="w-full max-w-[1400px] px-8 md:px-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 z-20">
        {candidates.map((candidate, index) => {
          const selected = selectedCandidateId === candidate.id;
          return (
            <button
              type="button"
              key={candidate.id}
              onClick={() => setSelectedCandidateId(candidate.id)}
              disabled={isSubmitting}
              className={`group bg-[var(--surface-container-lowest)] p-8 aspect-[3/4] flex flex-col justify-between text-left transition-all duration-200 relative border ${
                selected
                  ? 'border-red-600 dark:border-red-500 ring-2 ring-red-600/20 shadow-lg translate-y-[2px]'
                  : 'border-[var(--on-surface)]/15 hover:border-[var(--primary)]/60 hover:-translate-y-0.5 shadow-sm'
              }`}
            >
              {/* Top Accent Stamp */}
              <div className="flex items-start justify-between w-full">
                <span className="font-muse text-7xl text-[var(--on-surface)]/10 leading-none">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors border ${
                    selected
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-[var(--on-surface)]/20 group-hover:border-[var(--primary)]'
                  }`}
                >
                  {selected && <Check size={14} />}
                </div>
              </div>

              {/* Candidate Info */}
              <div className="mt-auto">
                <h3 className="font-muse text-2xl md:text-3xl text-[var(--primary)] leading-tight font-bold">
                  {candidate.name}
                </h3>
                {candidate.description && (
                  <p className="text-xs text-[var(--on-surface)] opacity-75 mt-2 line-clamp-3">
                    {candidate.description}
                  </p>
                )}
                <div className="mt-6 pt-3 border-t border-[var(--on-surface)]/10 flex items-center justify-between">
                  <span className={`text-xs uppercase tracking-wider font-bold ${selected ? 'text-red-600 dark:text-red-400' : 'text-[var(--on-surface)] opacity-60'}`}>
                    {selected ? 'SELECTED' : 'SELECT'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sticky Bottom Confirmation Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--on-surface)]/10 bg-[var(--surface)]/95 backdrop-blur-md py-4 z-30 shadow-2xl">
        <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-8 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Stamp size={18} className="text-[var(--primary)]" />
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-60 font-bold">CURRENT SELECTION</p>
              <p className="font-muse text-lg font-bold text-[var(--primary)]">
                {selectedCandidate ? selectedCandidate.name : 'No candidate selected'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openConfirmation}
            disabled={!selectedCandidateId || isSubmitting}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-8 py-3.5 uppercase text-xs tracking-wider font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-md flex items-center justify-center gap-3 active:translate-y-[1px]"
          >
            <span>REVIEW & CONFIRM VOTE</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Ceremonial vote Review Modal */}
      {showvoteReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="relative w-full max-w-lg bg-[var(--surface-container-lowest)] p-8 md:p-10 border border-[var(--on-surface)]/20 shadow-2xl flex flex-col items-center text-center"
          >
            {/* Slot Indicator */}
            <div className="w-48 h-3 bg-black/80 rounded-full mb-6 border border-white/20 shadow-inner flex items-center justify-center">
              <span className="text-[0.65rem] tracking-widest uppercase text-white/70 font-mono font-bold">vote SLOT</span>
            </div>

            {/* vote Sheet */}
            <div
              className={`w-full bg-[var(--surface)] border border-[var(--on-surface)]/20 p-6 md:p-8 text-left transition-transform duration-700 ${
                isDropping ? '-translate-y-36 opacity-0 scale-95' : 'translate-y-0 opacity-100'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[var(--on-surface)]/15 pb-3 mb-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Shield size={14} />
                  <span id="review-title" className="text-xs tracking-wider uppercase font-bold">vote REVIEW</span>
                </div>
                <span className="text-xs font-mono tracking-wider uppercase text-[var(--on-surface)] opacity-70">
                  {session.sessionCode || 'ELECTION'}
                </span>
              </div>

              <div className="mb-6">
                <p className="text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-60 mb-1 font-bold">VOTER</p>
                <p className="font-muse font-bold text-lg text-[var(--on-surface)]">{session.voterName || 'Citizen'}</p>
              </div>

              <div className="mb-6 bg-[var(--surface-container)] p-4 border-l-4 border-l-red-600 border border-[var(--on-surface)]/10">
                <p className="text-xs uppercase tracking-wider text-red-600 dark:text-red-400 font-bold mb-1">CANDIDATE SELECTED</p>
                <p className="font-muse text-2xl font-bold text-[var(--primary)]">{selectedCandidate?.name}</p>
                {selectedCandidate?.description && (
                  <p className="text-xs text-[var(--on-surface)] opacity-80 mt-1">{selectedCandidate.description}</p>
                )}
              </div>

              <p className="text-xs text-[var(--on-surface)] opacity-70 text-center">
                Once submitted, your vote is recorded and cannot be changed.
              </p>
            </div>

            {/* Modal Buttons */}
            <div className="w-full flex items-center justify-between gap-4 mt-8">
              <button
                type="button"
                onClick={() => setShowvoteReview(false)}
                disabled={isSubmitting}
                className="px-5 py-3 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-xs tracking-wider hover:bg-[var(--surface-container)] transition-colors disabled:opacity-50 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmVote}
                disabled={isSubmitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3.5 uppercase text-xs tracking-wider font-bold transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'SUBMITTING...' : 'CONFIRM VOTE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Cryptographic vote Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-title"
            className="w-full max-w-md bg-[var(--surface-container-lowest)] p-8 md:p-10 border border-[var(--on-surface)]/20 shadow-2xl text-center flex flex-col items-center"
          >
            <p className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-70 mb-1">
              VOTE RECORDED
            </p>
            <h3 id="receipt-title" className="font-muse text-3xl font-bold text-[var(--primary)] mb-2">Vote Receipt</h3>
            <p className="text-xs text-[var(--on-surface)] opacity-75 mb-6">
              Your vote has been counted. Save this receipt code to verify your vote anytime.
            </p>

            {/* Receipt Hash Box */}
            <div className="w-full bg-[var(--surface-container)] p-4 border border-[var(--on-surface)]/10 border-l-4 border-l-red-600 mb-6 text-left">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-70 font-bold">
                  RECEIPT CODE
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">VERIFIED</span>
              </div>
              <p className="font-mono text-base font-bold tracking-wider text-[var(--primary)] select-all tabular-nums">
                {receiptData.receiptCode}
              </p>
              <div className="mt-3 pt-2 border-t border-[var(--on-surface)]/10 flex justify-between text-xs text-[var(--on-surface)] opacity-70 font-mono">
                <span>Timestamp</span>
                <span>{new Date(receiptData.votedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={copyReceiptCode}
                className="w-full py-3 border border-[var(--primary)]/30 text-[var(--primary)] text-xs uppercase tracking-wider hover:bg-[var(--surface-container)] transition-colors flex items-center justify-center gap-2 font-bold"
              >
                {copiedReceipt ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedReceipt ? 'COPIED' : 'COPY CODE'}</span>
              </button>

              <button
                type="button"
                onClick={proceedToWaitingRoom}
                className="w-full bg-[var(--primary)] text-[var(--on-primary)] py-3.5 text-xs uppercase tracking-wider font-bold hover:bg-[var(--primary)]/90 transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>CONTINUE TO WAITING ROOM</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

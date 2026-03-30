import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { castVote, getCandidates } from '../../lib/api';
import { getSession, markVoteSubmitted } from '../../store/session';

export default function GravitySlot() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votedCandidateId, setVotedCandidateId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session.electionId || !session.voterId) {
      navigate('/');
      return;
    }

    let mounted = true;

    async function loadCandidates() {
      try {
        const result = await getCandidates(session.electionId);
        if (!mounted) return;
        setCandidates(result.candidates || []);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load candidates');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCandidates();

    return () => {
      mounted = false;
    };
  }, [navigate, session.electionId, session.voterId]);

  const handleDragEnd = async (event, info, candidateId) => {
    if (isSubmitting) return;

    if (info.offset.y > 170) {
      setIsSubmitting(true);
      setError('');
      try {
        await castVote(session.electionId, {
          candidateId,
        });

        setVotedCandidateId(candidateId);
        markVoteSubmitted(candidateId);
        setTimeout(() => navigate('/waiting'), 700);
      } catch (err) {
        setError(err.message || 'Unable to submit vote');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (loading) {
    return <div className="min-h-[90vh] flex items-center justify-center label-md">Loading ballot...</div>;
  }

  return (
    <div className="relative min-h-[90vh] flex flex-col items-center pt-16 overflow-hidden">
      
      {/* Background Watermark */}
      <div className="absolute top-[40%] flex items-center justify-center pointer-events-none select-none z-0">
        <span className="font-muse text-[25vw] leading-none text-black/[0.03] whitespace-nowrap">
          BALLOT
        </span>
      </div>

      {/* Header */}
      <div className="w-full max-w-[1400px] px-12 mb-16 z-10">
        <p className="label-md text-gray-500 mb-6 font-bold tracking-[0.1em]">PHASE 01 — SELECTION</p>
        <h2 className="font-muse text-5xl text-[var(--primary)] max-w-xl leading-[1.1]">
          Cast your intent into the permanent record.
        </h2>
      </div>

      {/* Cards Container */}
      <div className="w-full max-w-[1400px] px-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 z-20">
        {candidates.map((candidate, index) => (
          <motion.div
            key={candidate.id}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => handleDragEnd(e, info, candidate.id)}
            whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing' }}
            animate={
              votedCandidateId
                ? votedCandidateId === candidate.id
                  ? { y: 1000, opacity: 0 }
                  : { opacity: 0.2 }
                : { y: 0, opacity: 1 }
            }
            className="paper-float bg-white p-12 aspect-[3/4] flex flex-col justify-between cursor-grab hover:shadow-2xl transition-shadow duration-300 relative"
          >
            <span className="font-muse text-[8rem] text-gray-100 leading-none -ml-4">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="label-md text-gray-400 mb-4">CANDIDATE</p>
              <h3 className="font-muse text-3xl text-[var(--primary)] leading-tight">
                {candidate.name}
              </h3>
            </div>
          </motion.div>
        ))}
      </div>

      {error ? <p className="mt-8 label-md text-red-700 z-20">{error}</p> : null}

      {/* The Slot */}
      <div className="absolute bottom-0 w-full h-48 flex justify-center items-end pb-8 z-10 pointer-events-none">
        <div className="w-full max-w-4xl flex flex-col items-center">
          <p className="label-md text-gray-400 mb-6 tracking-[0.2em]">DRAG SELECTION TO DEPOSIT</p>
          <div className="w-full h-16 bg-[var(--surface-container-high)] shadow-[var(--layer-recessed)] relative overflow-hidden flex items-center justify-center">
             <div className="w-[80%] h-1 bg-gradient-to-b from-black/20 to-transparent absolute top-0" />
             <span className="text-gray-400">↓</span>
             <div className="absolute top-0 right-0 h-full w-full flex items-center justify-end pr-4 pointer-events-none">
                <span className="label-md text-[0.5rem] tracking-[0.2em] transform rotate-90 origin-right text-gray-300 -mr-6">
                  ANALOG PRECISION SYSTEM V.2.4
                </span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

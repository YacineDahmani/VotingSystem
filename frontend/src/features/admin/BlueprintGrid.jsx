import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteCandidate, getAdminElections, getCandidates, injectFakeVotes, updateElectionStatus } from '../../lib/api';
import { getSession, isAdminSession } from '../../store/session';

export default function BlueprintGrid() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const [election, setElection] = useState(null);
  const [stats, setStats] = useState({ totalVotes: 0, voterCount: 0 });
  const [candidates, setCandidates] = useState([]);
  const [influenceMap, setInfluenceMap] = useState({});
  const [deletingCandidateId, setDeletingCandidateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAdminData = async () => {
    const electionListResponse = await getAdminElections();
    const elections = electionListResponse.elections || [];
    const selectedElection =
      elections.find((item) => item.status === 'open') ||
      elections[0] ||
      null;

    if (!selectedElection) {
      setElection(null);
      setCandidates([]);
      setStats({ totalVotes: 0, voterCount: 0 });
      return;
    }

    setElection(selectedElection);
    setStats({
      totalVotes: selectedElection.totalVotes || 0,
      voterCount: selectedElection.voterCount || 0,
    });

    const candidateResponse = await getCandidates(selectedElection.id);
    const nextCandidates = candidateResponse.candidates || [];
    setCandidates(nextCandidates);

    setInfluenceMap((previous) => {
      const next = { ...previous };
      nextCandidates.forEach((candidate) => {
        if (next[candidate.id] === undefined) {
          next[candidate.id] = 30;
        }
      });
      return next;
    });
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

        await loadAdminData();
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

  const handleInject = async (candidateId) => {
    if (!election) return;

    const influence = influenceMap[candidateId] || 20;
    const count = Math.max(1, Math.round(influence / 20));

    try {
      setError('');
      await injectFakeVotes(election.id, { candidateId, count });
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Injection failed');
    }
  };

  const handleClosePolls = async () => {
    if (!election) return;
    try {
      await updateElectionStatus(election.id, 'closed');
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Unable to close polls');
    }
  };

  const handleDeleteCandidate = async (candidateId, candidateName) => {
    if (!election) return;

    const confirmed = window.confirm(`Remove ${candidateName} from this election?`);
    if (!confirmed) return;

    try {
      setError('');
      setDeletingCandidateId(candidateId);
      await deleteCandidate(candidateId);
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Unable to remove candidate');
    } finally {
      setDeletingCandidateId(null);
    }
  };

  const fakeVoteOverflow = Math.max(0, (stats.totalVotes || 0) - (stats.voterCount || 0));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading blueprint...</div>;
  }

  return (
    <div className="min-h-screen text-[var(--on-primary)] relative z-10 -mt-24 pt-32 px-12 pb-24">
      {/* Header */}
      <div className="mb-12">
        <p className="label-md text-white/50 mb-2 tracking-[0.2em]">OPERATIONAL OVERVIEW</p>
        <h2 className="font-muse font-bold text-7xl text-white">The Blueprint.</h2>
      </div>

      <div className="grid grid-cols-12 gap-8">
        
        {/* Left Panel: Ledger Status */}
        <div className="col-span-3 bg-white text-[var(--primary)] p-8 relative flex flex-col justify-between shadow-2xl">
          {/* Tape corner detail */}
          <div className="absolute top-0 right-0 w-8 h-8 bg-transparent border-t-[16px] border-r-[16px] border-[var(--surface-container-high)] opacity-50" />
          
          <div>
            <p className="label-md text-gray-400 mb-6">SESSION IDENTITY</p>
            <h3 className="font-muse italic text-2xl">{election ? `EL-${election.id}` : 'NO ACTIVE SESSION'}</h3>
          </div>

          <div className="space-y-8 mt-48">
            <div className="flex justify-between items-end border-b border-gray-200 pb-2">
              <span className="label-md text-gray-500 text-[0.65rem]">AGGREGATE INTENT</span>
              <span className="font-bold text-4xl leading-none">{stats.totalVotes}</span>
            </div>
            <div className="flex justify-between items-end border-b border-gray-200 pb-2">
              <span className="label-md text-gray-500 text-[0.65rem] text-red-700">UNIQUE CODES ISSUED</span>
              <span className="font-bold text-3xl leading-none text-red-700">{stats.voterCount}</span>
            </div>
            <div className="flex justify-between items-end border-b border-gray-200 pb-2">
              <span className="label-md text-gray-500 text-[0.65rem]">BALANCE WARNING</span>
              <span className={`font-bold text-2xl leading-none ${fakeVoteOverflow > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {fakeVoteOverflow > 0 ? `+${fakeVoteOverflow}` : 'STABLE'}
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right: Sliders Grid */}
        <div className="col-span-9 grid grid-cols-3 gap-8 content-start">
          {candidates.map((candidate, idx) => (
            <div
              key={candidate.id}
              className="bg-white text-[var(--primary)] p-8 relative flex flex-col justify-between h-72 shadow-lg transition-transform"
              style={{ transform: `perspective(800px) rotateX(${((influenceMap[candidate.id] || 20) - 50) / 10}deg)` }}
            >
               <div className="absolute top-0 right-0 w-6 h-6 bg-transparent border-t-[12px] border-r-[12px] border-[var(--surface-container-high)] opacity-50" />
               <button
                 onClick={() => handleInject(candidate.id)}
                 className="absolute top-4 right-4 text-gray-400 hover:text-black"
                 aria-label={`Inject votes into ${candidate.name}`}
               >
                 +
               </button>
               <button
                 onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                 disabled={deletingCandidateId === candidate.id}
                 className="absolute top-4 left-4 text-gray-400 hover:text-red-700 disabled:opacity-40"
                 aria-label={`Remove ${candidate.name}`}
               >
                 {deletingCandidateId === candidate.id ? '...' : 'x'}
               </button>

               <div>
                 <span className="font-muse font-bold text-[5rem] text-gray-200 leading-none -ml-2">{String(idx + 1).padStart(2, '0')}</span>
                 <h4 className="font-muse text-2xl mt-4 leading-none">{candidate.name}</h4>
                 <p className="label-md text-gray-400 text-[0.55rem] mt-2">CURRENT VOTES: {candidate.votes}</p>
               </div>

               <div className="mt-8">
                 <div className="flex justify-between items-center mb-4">
                   <p className="label-md text-gray-400 text-[0.5rem] tracking-wider">INFLUENCE DRAFT</p>
                   <p className="label-md text-gray-500 text-[0.5rem]">{influenceMap[candidate.id] || 20}%</p>
                 </div>
                 <p className="label-md text-gray-500 text-[0.5rem] mb-2">
                   Injection batch: {Math.max(1, Math.round((influenceMap[candidate.id] || 20) / 20))} votes
                 </p>
                 <div className="h-1 bg-gray-200 w-full relative">
                    <div className="h-full bg-black absolute top-0 left-0" style={{ width: `${influenceMap[candidate.id] || 20}%` }} />
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={influenceMap[candidate.id] || 20}
                      onChange={(event) => {
                        const value = parseInt(event.target.value, 10);
                        setInfluenceMap((current) => ({ ...current, [candidate.id]: value }));
                      }}
                      className="absolute top-1/2 left-0 w-full -translate-y-1/2 opacity-0 cursor-ew-resize"
                    />
                 </div>
               </div>
            </div>
          ))}

          {/* Empty Add Slot */}
          <button
            type="button"
            onClick={() => navigate('/admin/new')}
            className="border-2 border-dashed border-white/20 p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors h-72"
          >
             <div className="text-white/40 mb-4">+</div>
             <p className="label-md text-white/40 tracking-widest text-center">INITIALIZE NEW ENTRY</p>
          </button>
        </div>
      </div>

      {/* Rigging Protocol Banner */}
      <div className="mt-12 bg-white text-[var(--primary)] p-12 flex items-center justify-between shadow-xl relative overflow-hidden">
        <span className="font-muse text-[15rem] leading-none text-gray-100 absolute left-[60%] top-1/2 -translate-y-1/2 select-none pointer-events-none">A</span>
        
        <div className="max-w-xl z-10">
          <h3 className="font-muse italic text-4xl mb-4">The Rigging Protocol</h3>
          <p className="text-sm text-gray-600 leading-relaxed font-sans">
            System parameters currently isolated. Influence sliders define the weight of each injection burst, and the plus marker spawns paper scraps directly into candidate tallies.
          </p>
          {error ? <p className="label-md text-red-700 mt-4">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-4 z-10 items-end">
           <button onClick={handleClosePolls} className="bg-red-700 text-white px-8 py-4 uppercase text-xs tracking-widest hover:-translate-y-1 transition-transform shadow-[var(--layer-hover)]">
             Close Polls
           </button>
           <button className="text-[var(--primary)] underline underline-offset-4 decoration-2 text-xs tracking-widest font-bold uppercase hover:text-[var(--secondary)] hover:decoration-[var(--secondary)]">
             Election: {election ? election.title : 'Unavailable'}
           </button>
        </div>
      </div>

      {/* Footer Details */}
      <div className="flex justify-between items-center mt-12 text-white/30">
         <span className="label-md text-[0.55rem]">© 2024 THE EDITORIAL BALLOT — ALL DRAFTS RESERVED</span>
         <span className="label-md text-[0.55rem]">TERMINAL: 882.11.0 &nbsp;&nbsp;&nbsp; LAT: 52.5200° N, LON: 13.4050° E</span>
      </div>
    </div>
  );
}

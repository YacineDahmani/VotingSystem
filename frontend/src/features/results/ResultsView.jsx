import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getActiveElection, getIntegrityReport, getResults } from '../../lib/api';
import { VOTER_PHASES, clearSession, getSession, isAdminSession, setSession, setVoterPhase } from '../../store/session';

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
  const MotionDiv = motion.div;
  const session = useMemo(() => getSession(), []);
  const adminView = isAdminSession(session);
  const guestResultsView = !adminView && !session?.token && !!session?.resultsElectionId;
  const endedNotice = session?.resultsNotice || '';
  const [results, setResults] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadResults() {
      try {
        let electionId = session.electionId || session.resultsElectionId;
        if (!electionId) {
          const active = await getActiveElection();
          electionId = active?.election?.id;
        }

        if (!electionId) {
          throw new Error('No election available for results');
        }

        const response = await getResults(electionId);
        if (!mounted) return;

        setSession({
          electionStatus: response?.election?.status,
          electionEndAt: response?.election?.end_date || null,
        });

        if (!adminView && !guestResultsView && !isElectionFinished(response?.election)) {
          setVoterPhase(VOTER_PHASES.WAITING);
          navigate('/waiting');
          return;
        }

        if (!adminView && !guestResultsView) {
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
  }, [adminView, guestResultsView, navigate, session]);

  if (!results && !error) {
    return <div className="min-h-screen flex items-center justify-center">Compiling final scroll...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="label-md text-red-700">{error}</p>
        <button onClick={() => navigate('/')} className="px-6 py-3 bg-[var(--primary)] text-white label-md transition-all duration-200 hover:bg-black hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">Return to entry</button>
      </div>
    );
  }

  const distribution = (results?.candidates || []).map((candidate, index) => ({
    id: candidate.id,
    name: candidate.name,
    percentage: `${candidate.percentage}%`,
    width: `${candidate.percentage}%`,
    barColor: index === 0 ? 'bg-[var(--primary)]' : index === 1 ? 'bg-gray-400' : 'bg-gray-200',
  }));

  const ageGroups = results?.ageGroups || [];
  const highestAgeGroupVotes = ageGroups.length ? Math.max(...ageGroups.map((item) => item.total)) : 0;
  const lowestAgeGroupVotes = ageGroups.length ? Math.min(...ageGroups.map((item) => item.total)) : 0;

  const metrics = ageGroups.map((item) => {
    let type = 'normal';
    if (item.total === highestAgeGroupVotes) type = 'bold';
    if (item.total === lowestAgeGroupVotes) type = 'light';

    return {
      group: item.age_group,
      stat: `${item.total} recorded votes`,
      type,
    };
  });

  const winnerName = results?.leader?.name || distribution[0]?.name || 'No winner yet';
  const runoffElection = results?.runoffElection || null;

  const handleRunoffContinue = () => {
    clearSession();
    navigate('/');
  };

  const handleExitResults = () => {
    clearSession();
    navigate('/');
  };

  return (
    <MotionDiv 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-white text-[var(--primary)] font-grotesque overflow-x-hidden pt-20"
    >
      
      {/* Massive subtle absolute letter */}
      <div className="absolute top-[20%] right-[-5%] overflow-hidden max-h-screen z-0">
          <span className="font-muse text-[50vw] leading-none text-gray-100 select-none pointer-events-none">
            V
          </span>
      </div>

      <div className="w-full max-w-6xl mx-auto px-12 relative z-10">
        {endedNotice ? (
          <div className="mb-8 border border-amber-700 bg-amber-50 px-6 py-4">
            <p className="label-md tracking-widest text-amber-900">SESSION UPDATE</p>
            <p className="text-sm mt-2 text-amber-900">{endedNotice}</p>
          </div>
        ) : null}

        {adminView && integrity ? (
          <div className={`mb-10 border px-6 py-4 ${integrity.integrityStatus === 'clean' ? 'border-green-700 bg-green-50' : 'border-red-700 bg-red-50'}`}>
            <p className="label-md tracking-widest">INTEGRITY CHECK</p>
            <p className="text-sm mt-2">
              Status: <strong>{integrity.integrityStatus === 'clean' ? 'CLEAN' : 'RIGGED'}</strong> | Real Votes: {integrity.realVotes} | Fake Votes: {integrity.fakeVotes}
            </p>
          </div>
        ) : null}

        {/* Header section */}
        <div className="mb-24">
          <div className="mb-8 flex justify-end gap-3">
            {adminView ? (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="border border-[var(--primary)] px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-gray-100 hover:-translate-y-0.5 shadow-sm active:translate-y-0"
              >
                Back To Admin
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleExitResults}
              className="bg-[var(--primary)] text-white px-4 py-2 text-[0.65rem] uppercase tracking-widest transition-all duration-200 hover:bg-black hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
            >
              Exit Results
            </button>
          </div>

          <p className="label-md text-[var(--secondary)] mb-12 tracking-widest font-bold">
            CONSENSUS REACHED
          </p>
          
          <h1 className="font-muse italic text-8xl md:text-[11rem] leading-[0.9] text-[var(--primary)] max-w-2xl animate-ink-bleed">
            {winnerName.split(' ')[0]}<br />{winnerName.split(' ').slice(1).join(' ')}
          </h1>
          
          <div className="mt-12 max-w-xs label-md text-[0.6rem] leading-[1.8] text-gray-400 tracking-[0.15em]">
            <p>DECLARED WINNER OF THE CURRENT EDITORIAL SELECTION. THE FOLLOWING DATA REPRESENTS THE FINAL VERIFIED COUNT.</p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface-container-low)] w-full py-24 relative z-10">
        <div className="w-full max-w-6xl mx-auto px-12 grid grid-cols-1 md:grid-cols-12 gap-16">
          
          <div className="md:col-span-4">
            <h3 className="label-md font-bold text-gray-500 tracking-[0.2em] mb-6 border-b-2 border-black pb-2">
              VOTE DISTRIBUTION
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Final tally generated directly from the election ledger. Bars are proportional to verified candidate vote totals.
            </p>
          </div>

          <div className="md:col-span-8 flex flex-col gap-12">
            {distribution.map((candidate) => (
              <div key={candidate.name}>
                <div className="flex justify-between items-end mb-4">
                  <h4 className="font-muse italic text-3xl text-gray-500">{candidate.name}</h4>
                  <span className="font-bold text-lg">{candidate.percentage}</span>
                </div>
                {adminView && integrity?.candidates ? (
                  <p className="label-md text-[0.6rem] text-gray-500 mb-2">
                    {(() => {
                      const integrityCandidate = integrity.candidates.find((item) => item.id === candidate.id);
                      if (!integrityCandidate) return 'Real: 0 | Fake: 0';
                      return `Real: ${integrityCandidate.realVotes} | Fake: ${integrityCandidate.fakeVotes}`;
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

      <div className="w-full py-32 relative z-10">
         <div className="w-full max-w-6xl mx-auto px-12">
           <h3 className="label-md font-bold italic text-gray-400 tracking-[0.2em] mb-16 border-none">
             METRIC DISSECTION
           </h3>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-12">
             {metrics.map((metric, i) => (
               <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-4">
                 <span className="label-md text-gray-400 text-[0.6rem]">{metric.group}</span>
                 <span className={`font-muse italic text-xl ${
                    metric.type === 'bold' ? 'font-bold text-black' : 
                    metric.type === 'light' ? 'font-light text-gray-400' : 'text-gray-700'
                 }`}>
                   {metric.stat}
                 </span>
               </div>
             ))}
           </div>

           {runoffElection ? (
             <div className="mt-16 p-8 bg-[var(--surface-container-low)] border border-gray-200">
               <p className="label-md text-[var(--secondary)] font-bold tracking-[0.2em] mb-3">RUNOFF AVAILABLE</p>
               <p className="text-sm text-gray-600 mb-6">
                 This election ended in a tie. A runoff has been opened as {runoffElection.title}.
               </p>
               {!adminView ? (
                 <button
                   onClick={handleRunoffContinue}
                   className="bg-[var(--primary)] text-white px-6 py-3 uppercase text-xs tracking-widest transition-all duration-200 hover:bg-black hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                 >
                   Return To Entry For Runoff
                 </button>
               ) : (
                 <p className="label-md text-gray-600">Use the admin room to monitor the runoff session.</p>
               )}
             </div>
           ) : null}
         </div>
      </div>

      <div className="bg-[var(--surface-container-high)] py-12 text-[0.6rem] uppercase tracking-widest text-gray-500 relative z-10">
         <div className="w-full max-w-6xl mx-auto px-12 flex justify-between items-end">
            <div className="max-w-[30%] opacity-60">
              * Data compiled by the Independent Editorial Commission (IEC). Results are binding and archived for a period of ten standard years. Any discrepancies must be filed via Form 12-B within 48 hours.
            </div>
            
            <div className="flex flex-col items-end gap-6 text-black">
              <span className="font-bold">THE EDITORIAL BALLOT © 2024</span>
              <div className="flex gap-6 font-bold">
                 <a href="#" className="underline underline-offset-4 decoration-1">PRIVACY</a>
                 <a href="#" className="underline underline-offset-4 decoration-1">LOG</a>
                 <a href="#" className="underline underline-offset-4 decoration-1">AUDIT</a>
              </div>
            </div>
         </div>
      </div>

    </MotionDiv>
  );
}

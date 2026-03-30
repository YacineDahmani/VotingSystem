import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { getResults } from '../../lib/api';
import { VOTER_PHASES, getSession, setVoterPhase } from '../../store/session';

export default function PendulumView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const [totalVotes, setTotalVotes] = useState(0);
  const [kickEnergy, setKickEnergy] = useState(8);

  useEffect(() => {
    if (!session.electionId) {
      navigate('/');
      return;
    }

    setVoterPhase(VOTER_PHASES.WAITING);

    let mounted = true;

    async function loadCurrentResults() {
      try {
        const results = await getResults(session.electionId);
        if (!mounted) return;
        setTotalVotes(results.totalVotes || 0);
        if (results.election?.status === 'closed') {
          setVoterPhase(VOTER_PHASES.RESULTS);
          navigate('/results');
        }
      } catch {
        // Silent fallback: socket updates continue if available.
      }
    }

    loadCurrentResults();

    const socket = io(import.meta.env.VITE_API_BASE_URL || undefined, {
      transports: ['websocket'],
    });

    socket.emit('election:watch', session.electionId);

    socket.on('election:update', (payload) => {
      if (payload?.electionId !== session.electionId) return;
      setTotalVotes(payload.totalVotes || 0);
    });

    socket.on('vote:kick', (payload) => {
      if (payload?.electionId !== session.electionId) return;
      setKickEnergy((current) => Math.min(current + 3, 20));
    });

    socket.on('election:closed', (payload) => {
      if (payload?.electionId !== session.electionId) return;
      setVoterPhase(VOTER_PHASES.RESULTS);
      navigate('/results');
    });

    const energyDecay = setInterval(() => {
      setKickEnergy((current) => Math.max(8, current - 1));
    }, 700);

    const polling = setInterval(loadCurrentResults, 8000);

    return () => {
      mounted = false;
      clearInterval(energyDecay);
      clearInterval(polling);
      socket.close();
    };
  }, [navigate, session.electionId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between pt-12 pb-24 overflow-hidden relative bg-[var(--surface)] text-[var(--primary)]">
      
      {/* Subtle details */}
      <div className="absolute top-24 left-12">
        <h2 className="font-muse text-4xl italic text-[var(--primary)] mb-2">The Pendulum</h2>
        <p className="label-md text-gray-400 tracking-[0.2em]">SECTION: 04 / STATUS: PROCESSING</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center -mt-24">
        
        {/* The Pendulum Assembly */}
        <div className="relative flex flex-col items-center h-[400px]">
          {/* Top Anchor */}
          <div className="w-3 h-3 bg-[var(--primary)]" />
          
          {/* Swinging Arm and Bob */}
          <motion.div
            className="flex flex-col items-center origin-top absolute top-0"
            animate={{ rotate: [-kickEnergy, kickEnergy, -kickEnergy] }}
            transition={{
              duration: 3,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          >
            {/* The String */}
            <div className="w-[4px] h-[300px] bg-[var(--primary)]" />
            
            {/* The Weight (Bob) */}
            <div className="w-8 h-8 bg-[var(--primary)] shadow-[var(--layer-hover)]" />
          </motion.div>
        </div>

        {/* The Counter */}
        <div className="mt-8 z-10 w-full text-center">
          <motion.div 
            className="font-muse font-bold text-[18rem] leading-none text-[var(--primary)] tracking-tighter"
            key={totalVotes}
            initial={{ scale: 0.98 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {totalVotes}
          </motion.div>
        </div>

        {/* Sub-labels */}
        <div className="w-full max-w-2xl px-12 flex justify-between items-center mt-12 pt-8 border-t border-[var(--outline-variant)] opacity-50">
          <span className="label-md text-[0.6rem] text-gray-500 tracking-[0.2em]">SYNCHRONIZING ARCHIVE</span>
          <span className="label-md text-[0.6rem] text-gray-500 tracking-[0.2em]">V01-BLLT</span>
          <span className="label-md text-[0.6rem] text-gray-500 tracking-[0.2em]">ACTIVE LEDGER</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getResults } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import { VOTER_PHASES, clearSession, getSession, markWaitingDismissed, setVoterPhase } from '../../store/session';

export default function PendulumView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();
  const [totalVotes, setTotalVotes] = useState(0);
  const [kickEnergy, setKickEnergy] = useState(8);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [electionEndAt, setElectionEndAt] = useState(null);
  const [timeRemainingLabel, setTimeRemainingLabel] = useState('Schedule pending');

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
        setElectionEndAt(results.election?.end_date || null);
        if (results.election?.status === 'closed') {
          setVoterPhase(VOTER_PHASES.RESULTS);
          pushToast({
            type: 'success',
            title: 'Results Are Live',
            message: 'Voting has finished. Redirecting to results.',
          });
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

    socket.on('connect', () => {
      setIsSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
    });

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
      pushToast({
        type: 'success',
        title: 'Voting Closed',
        message: 'Results are now available.',
      });
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
  }, [navigate, pushToast, session.electionId]);

  useEffect(() => {
    if (!electionEndAt) {
      setTimeout(() => setTimeRemainingLabel('No end time scheduled'), 0);
      return undefined;
    }

    const endTime = new Date(electionEndAt);
    if (Number.isNaN(endTime.getTime())) {
      setTimeout(() => setTimeRemainingLabel('Invalid end time'), 0);
      return undefined;
    }

    const formatRemaining = (remainingMs) => {
      const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
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
    };

    const updateTimeRemaining = () => {
      const remaining = endTime.getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemainingLabel('Voting window ended');
        return;
      }

      setTimeRemainingLabel(formatRemaining(remaining));
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [electionEndAt]);

  const handleLeaveWaiting = () => {
    markWaitingDismissed();
    clearSession();
    pushToast({
      type: 'info',
      title: 'Waiting Area Left',
      message: 'You can return later from the entry screen using the same voter ID and session code.',
    });
    navigate('/');
  };

  const swingAmplitude = Math.min(Math.max(kickEnergy, 6), 22);
  const swingDuration = Math.max(1.4, 2.8 - kickEnergy * 0.06);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between pt-0 pb-12 overflow-hidden relative bg-[#f7f7f7] text-[#1a1c1c]">

      {/* Grid Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Massive subtle typography in background */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none overflow-hidden z-0 pl-12 -space-y-12 opacity-40">
        <span className="font-muse text-[clamp(8rem,18vw,26rem)] leading-[0.8] text-black/[0.015] whitespace-nowrap uppercase tracking-tighter mix-blend-multiply ml-24">
          WAITING
        </span>
        <span className="font-muse text-[clamp(8rem,18vw,26rem)] leading-[0.8] text-black/[0.015] whitespace-nowrap uppercase tracking-tighter mix-blend-multiply -ml-24">
          ROOM
        </span>
      </div>

      {/* Decorative Paper Fold Bottom Right */}
      <div className="absolute bottom-0 right-0 w-64 h-64 md:w-96 md:h-96 pointer-events-none z-0 overflow-hidden floating-paper">
        <div className="absolute inset-0 bg-gradient-to-tl from-black/10 via-black/5 to-transparent transform rotate-12 scale-150 translate-x-1/4 translate-y-1/4 shadow-2xl skew-x-12 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-transparent shadow-inner" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.8)_45%,rgba(0,0,0,0.05)_50%,transparent_55%)] blur-[2px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_60%,rgba(255,255,255,0.6)_62%,rgba(0,0,0,0.03)_65%,transparent_70%)] blur-[3px]" />
      </div>

      {/* Subtle details */}
      <div className="w-full flex justify-between items-start px-6 md:px-12 relative z-20 mt-4 md:mt-0">
        <div>
          <h2 className="font-muse text-[2.5rem] italic text-[#1a1c1c] mb-2 font-normal leading-none">The Pendulum</h2>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gray-400 mt-4">SECTION: 04 / STATUS: PROCESSING</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? 'bg-black' : 'bg-red-600 animate-pulse'}`} />
            <p className="text-[0.55rem] uppercase tracking-[0.2em] text-gray-400">
              {isSocketConnected ? 'LIVE CHANNEL' : 'RECONNECTING'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLeaveWaiting}
            className="mt-4 px-6 py-3 bg-[#1a1c1c] text-white hover:bg-black text-[0.65rem] uppercase tracking-[0.2em] transition-colors duration-300 font-bold shadow-md hover:-translate-y-px"
          >
            Leave Waiting Area
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center mt-16 w-full relative z-10">
        
        {/* The Pendulum Assembly */}
        <div className="relative flex flex-col items-center h-[350px] w-full z-10">
          {/* Top Anchor */}
          <div className="w-4 h-4 bg-[#1a1c1c] z-20 shadow-md rounded-sm" />
          
          {/* Swinging Arm and Bob */}
          <div
            className="flex flex-col items-center absolute top-2 origin-top"
            style={{
              animation: `pendulumSwing ${swingDuration}s ease-in-out infinite`,
              '--pendulum-amplitude': `${swingAmplitude}deg`
            }}
          >
            {/* The String */}
            <div className="w-[3px] h-[280px] bg-[#1a1c1c]" />
            
            {/* The Weight (Bob) */}
            <div
              className="w-10 h-10 bg-[#1a1c1c] shadow-xl rotate-45 flex-shrink-0"
              style={{
                animation: `pendulumBobGlow ${swingDuration}s ease-in-out infinite`
              }}
            />
          </div>
        </div>

        {/* The Foreground Number */}
        <div className="z-10 w-full text-center -mt-8 flex flex-col items-center">
          <div className="font-muse font-bold text-[10rem] md:text-[14rem] leading-none text-[#1a1c1c] tracking-tighter">
            {totalVotes}
          </div>
          <div className="flex flex-col items-center mt-2 border-t border-black/10 pt-4 px-12">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gray-500 font-bold mb-6">
              Total Votes Cast Live
            </p>
            <p className="text-[0.55rem] uppercase tracking-[0.2em] text-gray-400">
              VOTING ENDS IN
            </p>
            <p className="text-sm mt-1 font-bold uppercase tracking-[0.15em] text-[#1a1c1c]">
              {timeRemainingLabel}
            </p>
          </div>
        </div>

        {/* Sub-labels */}
        <div className="w-full max-w-2xl px-8 flex justify-between items-center mt-24 opacity-60 relative z-20">
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-black/10 pb-1 text-gray-500">SYNCHRONIZING ARCHIVE</span>
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-black/10 pb-1 text-gray-500">V01-BLLT</span>
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-black/10 pb-1 text-gray-500">ACTIVE LEDGER</span>
        </div>
      </div>
    </div>
  );
}

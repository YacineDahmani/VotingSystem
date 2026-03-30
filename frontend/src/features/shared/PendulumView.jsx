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
  const [lastSyncAt, setLastSyncAt] = useState(null);
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
        setLastSyncAt(new Date().toISOString());
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
      setLastSyncAt(new Date().toISOString());
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
      setTimeRemainingLabel('No end time scheduled');
      return undefined;
    }

    const endTime = new Date(electionEndAt);
    if (Number.isNaN(endTime.getTime())) {
      setTimeRemainingLabel('Invalid end time');
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

  const syncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Pending';

  const swingAmplitude = Math.min(Math.max(kickEnergy, 6), 22);
  const swingDuration = Math.max(1.4, 2.8 - kickEnergy * 0.06);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between pt-24 pb-12 overflow-hidden relative bg-[var(--surface)] text-[var(--primary)]">
      
      {/* Subtle details */}
      <div className="absolute top-32 left-12">
        <h2 className="font-muse text-5xl italic text-[var(--primary)] mb-2">The Pendulum</h2>
        <p className="label-md text-gray-500 tracking-[0.2em] mt-4">SECTION: 04</p>
        <p className="label-md text-gray-500 tracking-[0.2em]">STATUS: VOTE RECORDED</p>
      </div>

      <div className="absolute top-32 right-12 flex flex-col items-end gap-3 z-20">
        <div className="bg-[var(--surface-container-lowest)] border border-black/10 px-5 py-3 shadow-[var(--layer-recessed)]">
          <p className="label-md text-[0.62rem] tracking-[0.16em] text-gray-500">LIVE CHANNEL</p>
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-600' : 'bg-amber-600 animate-pulse'}`} />
            <p className={`text-xs font-bold uppercase tracking-widest ${isSocketConnected ? 'text-green-700' : 'text-amber-700'}`}>
              {isSocketConnected ? 'Connected' : 'Reconnecting'}
            </p>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] border border-black/10 px-5 py-3 min-w-[220px] text-right shadow-[var(--layer-recessed)]">
          <p className="label-md text-[0.62rem] tracking-[0.16em] text-gray-500">VOTING ENDS IN</p>
          <p className="text-sm mt-1 font-bold uppercase tracking-[0.12em] text-[var(--primary)]">{timeRemainingLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleLeaveWaiting}
          className="border border-[var(--primary)] mt-2 px-5 py-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors duration-300"
        >
          Leave Waiting Area
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center mt-16 w-full relative">
        
        {/* The Pendulum Assembly */}
        <div className="relative flex flex-col items-center h-[350px] w-full z-10">
          {/* Top Anchor */}
          <div className="w-4 h-4 rounded-sm bg-[var(--primary)] z-20 shadow-md" />
          
          {/* Swinging Arm and Bob */}
          <div
            className="pendulum-swing flex flex-col items-center absolute top-2"
            style={{
              '--pendulum-amplitude': `${swingAmplitude}deg`,
              '--pendulum-duration': `${swingDuration}s`,
              transformOrigin: 'top center',
            }}
          >
            {/* The String */}
            <div className="w-[3px] h-[280px] bg-[var(--primary)]" />
            
            {/* The Weight (Bob) */}
            <div 
              className="pendulum-bob w-10 h-10 bg-[var(--primary)] rotate-45 shadow-xl transition-all duration-300"
              style={{ '--pendulum-duration': `${swingDuration}s` }} 
            />
          </div>
        </div>

        {/* The Counter Background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
          <div className="font-muse font-bold text-[35rem] leading-none tracking-tighter">
            {totalVotes}
          </div>
        </div>

        {/* The Counter Foreground */}
        <div className="z-10 w-full text-center mt-12 bg-[var(--surface)]/60 backdrop-blur-md py-8 border-y border-black/5">
          <div className="font-muse font-bold text-8xl md:text-9xl leading-none text-[var(--primary)] tracking-tighter">
            {totalVotes}
          </div>
          <p className="label-md mt-6 text-gray-500 tracking-[0.2em]">
            Total votes synchronized
          </p>
          <p className="label-md mt-2 text-gray-400 tracking-[0.12em]">
            Last sync at: {syncLabel}
          </p>
        </div>

        {/* Sub-labels */}
        <div className="w-full max-w-4xl px-12 flex justify-between items-center mt-auto pt-16 opacity-40">
          <span className="label-md text-[0.6rem] tracking-[0.2em] border-b border-black/20 pb-1">SYNCHRONIZING ARCHIVE</span>
          <span className="label-md text-[0.6rem] tracking-[0.2em] border-b border-black/20 pb-1">V01-BLLT</span>
          <span className="label-md text-[0.6rem] tracking-[0.2em] border-b border-black/20 pb-1">ACTIVE LEDGER</span>
        </div>
      </div>
    </div>
  );
}

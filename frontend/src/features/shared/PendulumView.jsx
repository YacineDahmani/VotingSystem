import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getResults } from '../../lib/api';
import { useToast } from '../../components/ui/useToast';
import { VOTER_PHASES, clearSession, getSession, markWaitingDismissed, setSession, setVoterPhase } from '../../store/session';

export default function PendulumView() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const { pushToast } = useToast();
  const [totalVotes, setTotalVotes] = useState(0);
  const [kickEnergy, setKickEnergy] = useState(8);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [electionEndAt, setElectionEndAt] = useState(null);
  const [timeRemainingLabel, setTimeRemainingLabel] = useState('Schedule pending');
  const [timerEnded, setTimerEnded] = useState(false);
  const [displayAngle, setDisplayAngle] = useState(0);

  const anchorRef = useRef(null);
  const armRef = useRef(null);
  const frameRef = useRef(0);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const dragHistoryRef = useRef([]);
  const physicsRef = useRef({ angle: 0, velocity: 0 });

  const maxAngle = Math.PI / 2.3;
  const maxVelocity = 0.045;
  const gravityStrength = 0.002;
  const damping = 0.995;

  const clampAngle = useCallback((angle) => Math.max(-maxAngle, Math.min(maxAngle, angle)), [maxAngle]);

  const renderAngle = (angle) => {
    setDisplayAngle(angle);
    if (armRef.current) {
      armRef.current.style.transform = `rotate(${angle}rad)`;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      if (!draggingRef.current) {
        let { angle, velocity } = physicsRef.current;

        velocity += -gravityStrength * Math.sin(angle);
        
 
        const timeFactor = performance.now() / 1200;
        const ambientPush = (Math.sin(timeFactor) + Math.sin(timeFactor * 0.65)) * 0.00018;
        velocity += ambientPush;

        velocity *= damping;

        if (velocity > maxVelocity) velocity = maxVelocity;
        if (velocity < -maxVelocity) velocity = -maxVelocity;

        angle = clampAngle(angle + velocity);

        if (angle === maxAngle || angle === -maxAngle) {
          velocity *= -0.28;
        }

        physicsRef.current.angle = angle;
        physicsRef.current.velocity = velocity;
        renderAngle(angle);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
    };
  }, [clampAngle, maxAngle]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!draggingRef.current || !anchorRef.current) return;

      const rect = anchorRef.current.getBoundingClientRect();
      const anchorX = rect.left + rect.width / 2;
      const anchorY = rect.top + rect.height / 2;
      const dx = event.clientX - anchorX;
      const dy = event.clientY - anchorY;
      const pointerAngle = Math.atan2(dy, dx) - Math.PI / 2;
      const angle = clampAngle(pointerAngle + dragOffsetRef.current);
      const now = performance.now();
      const history = dragHistoryRef.current;

      if (history.length > 0) {
        const previous = history[history.length - 1];
        const dt = Math.max(1, now - previous.time);
        history.push({ angle, time: now, velocity: (angle - previous.angle) / dt });
        if (history.length > 6) history.shift();
      } else {
        history.push({ angle, time: now, velocity: 0 });
      }

      physicsRef.current.angle = angle;
      physicsRef.current.velocity = 0;
      renderAngle(angle);
    };

    const handlePointerUp = () => {
      if (!draggingRef.current) return;

      draggingRef.current = false;

      const samples = dragHistoryRef.current.slice(-4);
      const releaseVelocity = samples.length
        ? samples.reduce((sum, sample) => sum + sample.velocity, 0) / samples.length
        : 0;

      physicsRef.current.velocity = Math.max(-maxVelocity, Math.min(maxVelocity, releaseVelocity * 0.9));
      dragHistoryRef.current = [];
      dragOffsetRef.current = 0;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [clampAngle]);

  const handlePointerDown = (event) => {
    event.preventDefault();
    if (!anchorRef.current) return;

    draggingRef.current = true;
    dragHistoryRef.current = [];

    const rect = anchorRef.current.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top + rect.height / 2;
    const dx = event.clientX - anchorX;
    const dy = event.clientY - anchorY;
    const pointerAngle = Math.atan2(dy, dx) - Math.PI / 2;

    dragOffsetRef.current = physicsRef.current.angle - clampAngle(pointerAngle);
    physicsRef.current.velocity = 0;
    physicsRef.current.angle = clampAngle(pointerAngle + dragOffsetRef.current);
    renderAngle(physicsRef.current.angle);
  };

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

        setSession({
          electionStatus: results.election?.status,
          electionEndAt: results.election?.end_date || null,
        });

        const endAt = results.election?.end_date ? new Date(results.election.end_date) : null;
        const hasEndedByTime = !!endAt && !Number.isNaN(endAt.getTime()) && Date.now() >= endAt.getTime();

        if (results.election?.status === 'closed' || hasEndedByTime) {
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
    socket.on('connect', () => setIsSocketConnected(true));
    socket.on('disconnect', () => setIsSocketConnected(false));

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
      setSession({ electionStatus: 'closed' });
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
      const timeoutId = setTimeout(() => {
        setTimerEnded(false);
        setTimeRemainingLabel('No end time scheduled');
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const endTime = new Date(electionEndAt);
    if (Number.isNaN(endTime.getTime())) {
      const timeoutId = setTimeout(() => {
        setTimerEnded(false);
        setTimeRemainingLabel('Invalid end time');
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const formatRemaining = (remainingMs) => {
      const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
      return `${minutes}m ${seconds}s`;
    };

    const updateTimeRemaining = () => {
      const remaining = endTime.getTime() - Date.now();
      if (remaining <= 0) {
        setTimerEnded(true);
        setTimeRemainingLabel('Voting window ended');
        return;
      }

      setTimerEnded(false);
      setTimeRemainingLabel(formatRemaining(remaining));
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [electionEndAt]);

  useEffect(() => {
    if (kickEnergy > 8 && !draggingRef.current) {
      physicsRef.current.velocity += Math.sign(physicsRef.current.angle || 1) * 0.0008;
    }
  }, [kickEnergy]);

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

  const handleGoToResults = () => {
    setVoterPhase(VOTER_PHASES.RESULTS);
    navigate('/results');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between pt-0 pb-12 overflow-hidden relative bg-[var(--surface)] text-[var(--primary)]">
      <div
        className="absolute inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none overflow-hidden z-0 pl-12 -space-y-12 opacity-40">
        <span className="font-muse text-[clamp(8rem,18vw,26rem)] leading-[0.8] text-[var(--on-surface)]/[0.015] whitespace-nowrap uppercase tracking-tighter mix-blend-multiply ml-24">
          WAITING
        </span>
        <span className="font-muse text-[clamp(8rem,18vw,26rem)] leading-[0.8] text-[var(--on-surface)]/[0.015] whitespace-nowrap uppercase tracking-tighter mix-blend-multiply -ml-24">
          ROOM
        </span>
      </div>

      <div className="absolute bottom-0 right-0 w-64 h-64 md:w-96 md:h-96 pointer-events-none z-0 overflow-hidden floating-paper">
        <div className="absolute inset-0 bg-gradient-to-tl from-black/10 via-black/5 to-transparent transform rotate-12 scale-150 translate-x-1/4 translate-y-1/4 shadow-2xl skew-x-12 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-transparent shadow-inner" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.8)_45%,rgba(0,0,0,0.05)_50%,transparent_55%)] blur-[2px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_60%,rgba(255,255,255,0.6)_62%,rgba(0,0,0,0.03)_65%,transparent_70%)] blur-[3px]" />
      </div>

      <div className="w-full flex justify-between items-start px-6 md:px-12 relative z-20 mt-4 md:mt-0">
        <div>
          <h2 className="font-muse text-[2.5rem] italic text-[var(--primary)] mb-2 font-normal leading-none">The Pendulum</h2>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--on-surface)] opacity-50 mt-4">SECTION: 04 / STATUS: PROCESSING</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? 'bg-black' : 'bg-red-600 animate-pulse'}`} />
            <p className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--on-surface)] opacity-50">
              {isSocketConnected ? 'LIVE CHANNEL' : 'RECONNECTING'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLeaveWaiting}
            className="mt-4 px-6 py-3 bg-[var(--primary)] text-[var(--on-primary)] text-[0.65rem] uppercase tracking-[0.2em] transition-all duration-200 hover:bg-[var(--primary)]/90 hover:-translate-y-0.5 shadow-md active:translate-y-0 font-bold"
          >
            Leave Waiting Area
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center mt-16 w-full relative z-10" style={{ touchAction: 'none' }}>
        <div className="relative flex flex-col items-center h-[350px] w-full z-10">
          <div ref={anchorRef} className="w-4 h-4 bg-[var(--primary)] z-20 shadow-md rounded-sm" />

          <div
            ref={armRef}
            className="flex flex-col items-center absolute top-2 origin-top cursor-grab active:cursor-grabbing will-change-transform"
            onPointerDown={handlePointerDown}
            style={{ transform: `rotate(${displayAngle}rad)` }}
          >
            <div className="w-[3px] h-[280px] bg-[var(--primary)] pointer-events-none" />
            <div
              className="w-10 h-10 bg-[var(--primary)] shadow-xl rotate-45 flex-shrink-0"
              style={{
                boxShadow: kickEnergy > 10 ? '0 0 15px var(--primary)' : 'none',
                transition: 'box-shadow 0.2s ease-out',
              }}
            />
          </div>
        </div>

        <div className="z-10 w-full text-center -mt-8 flex flex-col items-center">
          <div className="font-muse font-bold text-[10rem] md:text-[14rem] leading-none text-[var(--primary)] tracking-tighter">
            {totalVotes}
          </div>
          <div className="flex flex-col items-center mt-2 border-t border-[var(--on-surface)]/10 pt-4 px-12">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--on-surface)] opacity-60 font-bold mb-6">
              Total Votes Cast Live
            </p>
            <p className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--on-surface)] opacity-50">
              VOTING ENDS IN
            </p>
            <p className="text-sm mt-1 font-bold uppercase tracking-[0.15em] text-[var(--primary)]">
              {timeRemainingLabel}
            </p>
            {timerEnded ? (
              <button
                type="button"
                onClick={handleGoToResults}
                className="mt-4 px-6 py-3 border border-[var(--primary)] text-[var(--primary)] text-[0.65rem] uppercase tracking-[0.2em] transition-all duration-200 hover:bg-[var(--primary)] hover:text-[var(--on-primary)] hover:-translate-y-0.5 shadow-sm active:translate-y-0 font-bold"
              >
                Go To Results
              </button>
            ) : null}
          </div>
        </div>

        <div className="w-full max-w-2xl px-8 flex justify-between items-center mt-24 opacity-60 relative z-20">
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-[var(--on-surface)]/10 pb-1 text-[var(--on-surface)] opacity-60">SYNCHRONIZING ARCHIVE</span>
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-[var(--on-surface)]/10 pb-1 text-[var(--on-surface)] opacity-60">V01-BLLT</span>
          <span className="text-[0.55rem] uppercase tracking-[0.2em] border-b border-[var(--on-surface)]/10 pb-1 text-[var(--on-surface)] opacity-60">ACTIVE LEDGER</span>
        </div>
      </div>
    </div>
  );
}

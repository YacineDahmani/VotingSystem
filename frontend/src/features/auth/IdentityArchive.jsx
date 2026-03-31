import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield } from 'lucide-react';
import { submitIdentity, validateElectionCode } from '../../lib/api';
import { clearSession, getSession, getVoterPhase, isAdminSession, isVoterSession, setSession } from '../../store/session';

export default function IdentityArchive() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState('voter');
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [voterIdCode, setVoterIdCode] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    const currentSession = getSession();

    if (isAdminSession(currentSession)) {
      navigate('/admin', { replace: true });
      return;
    }

    if (!isVoterSession(currentSession)) {
      return;
    }

    const phase = getVoterPhase(currentSession);
    if (phase === 'results') {
      navigate('/results', { replace: true });
      return;
    }

    if (currentSession.hasVoted || phase === 'waiting') {
      navigate('/waiting', { replace: true });
      return;
    }

    navigate('/ballot', { replace: true });
  }, [navigate]);

  const calculateAge = useCallback((value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const parsed = new Date(year, month - 1, day);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.getFullYear() !== year
      || parsed.getMonth() !== month - 1
      || parsed.getDate() !== day
      || parsed > new Date()
    ) {
      return null;
    }

    const today = new Date();
    let years = today.getFullYear() - year;
    const hasReachedBirthday = (today.getMonth() + 1 > month)
      || ((today.getMonth() + 1 === month) && today.getDate() >= day);

    if (!hasReachedBirthday) {
      years -= 1;
    }

    return years;
  }, []);

  const handleBirthdateChange = useCallback((value) => {
    setBirthdate(value);

    if (stepIndex !== 1) {
      return;
    }

    if (!value) {
      setError('Birthdate is required.');
      return;
    }

    const years = calculateAge(value);
    if (years !== null && years < 18) {
      setError('You must be at least 18 years old to vote.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 420);
      return;
    }

    setError('');
  }, [calculateAge, stepIndex]);

  const steps = useMemo(() => ([
    {
      label: 'NAME',
      placeholder: 'ENTER FULL NAME',
      value: name,
      onChange: setName,
      type: 'text',
    },
    {
      label: 'BIRTHDATE',
      placeholder: '',
      value: birthdate,
      onChange: handleBirthdateChange,
      type: 'date',
    },
    {
      label: 'VOTER ID CODE',
      placeholder: 'ENTER YOUR VOTER ID CODE',
      value: voterIdCode,
      onChange: setVoterIdCode,
      type: 'text',
    },
    {
      label: 'SESSION CODE',
      placeholder: 'ENTER VOTING SESSION CODE',
      value: sessionCode,
      onChange: setSessionCode,
      type: 'text',
    },
  ]), [name, birthdate, voterIdCode, sessionCode, handleBirthdateChange]);

  const handleBack = () => {
    if (isSubmitting || stepIndex === 0) return;
    setError('');
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const triggerSnag = (message) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 420);
  };

  const routeClosedSessionToResults = useCallback((election, message) => {
    clearSession();
    setSession({
      resultsElectionId: election?.id || null,
      electionTitle: election?.title || null,
      electionStatus: election?.status || 'closed',
      electionEndAt: election?.end_date || null,
      resultsNotice: message || 'This voting session has already ended. Showing results.',
    });
    navigate('/results', { replace: true });
  }, [navigate]);

  const ensureSessionCodeIsOpen = useCallback(async () => {
    const normalizedCode = sessionCode.trim().toUpperCase();

    try {
      await validateElectionCode(normalizedCode);
      return true;
    } catch (err) {
      const reason = err?.data?.reason;
      const election = err?.data?.election;

      if ((reason === 'ended' || reason === 'closed') && election?.id) {
        const message = err?.message || 'This voting session has already ended. Redirecting to results.';
        triggerSnag(message);
        routeClosedSessionToResults(election, message);
        return false;
      }

      triggerSnag(err?.message || 'Unable to validate session code.');
      return false;
    }
  }, [routeClosedSessionToResults, sessionCode]);

  const validateCurrentStep = () => {
    if (stepIndex === 0 && name.trim().length < 2) {
      triggerSnag('Name must include at least 2 characters.');
      return false;
    }

    if (stepIndex === 1) {
      const years = calculateAge(birthdate);
      if (years === null) {
        triggerSnag('Birthdate is required.');
        return false;
      }

      if (years < 18) {
        triggerSnag('You must be at least 18 years old to vote.');
        return false;
      }
    }

    if (stepIndex === 2 && voterIdCode.trim().length < 3) {
      triggerSnag('Voter ID code is required.');
      return false;
    }

    if (stepIndex === 3 && sessionCode.trim().length < 4) {
      triggerSnag('Session code is required.');
      return false;
    }

    setError('');
    return true;
  };

  const handleAdvance = async () => {
    if (isSubmitting) return;

    if (!validateCurrentStep()) return;

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    setIsSubmitting(true);

    try {
      const isSessionOpen = await ensureSessionCodeIsOpen();
      if (!isSessionOpen) {
        return;
      }

      const payload = {
        name: name.trim(),
        birthdate,
        voterIdCode: voterIdCode.trim(),
        sessionCode: sessionCode.trim().toUpperCase(),
      };

      const result = await submitIdentity(payload);

      if (result.role === 'admin') {
        clearSession();
        setSession({ role: 'admin', token: result.token });
        setIsFlipping(true);
        setTimeout(() => navigate('/admin'), 600);
        return;
      }

      clearSession();
      setSession({
        role: 'voter',
        token: result.token,
        voterId: result.voter.id,
        voterName: result.voter.name,
        birthdate,
        voterIdCode: voterIdCode.trim(),
        sessionCode: result.sessionCode || sessionCode.trim().toUpperCase(),
        electionId: result.election.id,
        electionTitle: result.election.title,
        electionStatus: result.election.status,
        electionEndAt: result.election.end_date || null,
        hasVoted: !!result.hasVoted,
        selectedCandidateId: result.selectedCandidateId || null,
        votedAt: result.votedAt || null,
        phase: result.phase || 'ballot',
        resultsElectionId: null,
        resultsNotice: null,
      });
      const phase = result.phase || 'ballot';
      if (phase === 'results') {
        navigate('/results');
      } else if (phase === 'waiting' || result.hasVoted) {
        navigate('/waiting');
      } else {
        navigate('/ballot');
      }
    } catch (err) {
      const reason = err?.data?.reason;
      const election = err?.data?.election;
      if ((reason === 'ended' || reason === 'closed') && election?.id) {
        const message = err?.message || 'This voting session has already ended. Redirecting to results.';
        triggerSnag(message);
        routeClosedSessionToResults(election, message);
        return;
      }

      triggerSnag(err.message || 'Unable to verify identity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminAccess = async () => {
    if (isSubmitting) return;

    const normalizedAdminKey = adminKey.trim();
    if (!normalizedAdminKey) {
      triggerSnag('Admin master key is required for admin access.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitIdentity({ adminKey: normalizedAdminKey });

      if (result.role !== 'admin') {
        throw new Error('Admin authentication failed.');
      }

      clearSession();
      setSession({ role: 'admin', token: result.token });
      setIsFlipping(true);
      setTimeout(() => navigate('/admin'), 600);
    } catch (err) {
      triggerSnag(err.message || 'Unable to verify admin key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      if (entryMode === 'admin') {
        handleAdminAccess();
      } else {
        handleAdvance();
      }
    }
  };

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[var(--surface)]"
      style={isFlipping ? { transform: 'rotateY(180deg)', opacity: 0, transition: 'transform 0.6s ease, opacity 0.6s ease' } : { transition: 'transform 0.6s ease, opacity 0.6s ease' }}
    >
      
      {/* Background massive BALLOT watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
        <span className="font-muse text-[clamp(10rem,22vw,30rem)] leading-[0.8] text-[var(--on-surface)]/[0.07] whitespace-nowrap uppercase tracking-tighter">
          BALLOT
        </span>
      </div>

      {/* Decorative Paper Fold Bottom Right */}
      <div className="absolute bottom-0 right-0 w-64 h-64 md:w-96 md:h-96 pointer-events-none z-0 overflow-hidden floating-paper">
        <div className="absolute inset-0 bg-gradient-to-tl from-black/10 via-black/5 to-transparent transform rotate-12 scale-150 translate-x-1/4 translate-y-1/4 shadow-2xl skew-x-12 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-transparent shadow-inner" />
        {/* Soft diagonal highlight lines to mimic fold */}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.8)_45%,rgba(0,0,0,0.05)_50%,transparent_55%)] blur-[2px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_60%,rgba(255,255,255,0.6)_62%,rgba(0,0,0,0.03)_65%,transparent_70%)] blur-[3px]" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center mt-12">
        <div className="text-center mb-8">
          <p className="label-md text-[var(--on-surface)] opacity-60 mb-2 tracking-[0.2em] font-bold text-[0.65rem]">VERIFICATION PHASE</p>
          <h2 className="font-muse text-[2.5rem] md:text-5xl text-[var(--on-surface)]">Identity Archive</h2>
        </div>

        <div
          className="bg-[var(--surface-container-lowest)]/35 backdrop-blur-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-white/40 w-full max-w-xl p-10 md:p-14 flex flex-col items-center relative"
          style={isShaking ? { transform: 'translateX(-4px)', transition: 'transform 0.4s ease' } : {}}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-black/5 to-transparent"></div>
          
          <div className="w-full mb-8 relative z-20">
            <div className="flex items-center gap-6 mb-4">
              <button
                type="button"
                onClick={() => {
                  setEntryMode('voter');
                  setError('');
                }}
                className={`uppercase text-[0.65rem] tracking-[0.2em] pb-1 border-b-2 transition-all duration-300 ${entryMode === 'voter' ? 'text-[var(--on-surface)] border-[var(--on-surface)] font-bold' : 'text-[var(--on-surface)] opacity-50 border-transparent hover:text-[var(--on-surface)] opacity-80'}`}
                disabled={isSubmitting}
              >
                Voter Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode('admin');
                  setError('');
                }}
                className={`uppercase text-[0.65rem] tracking-[0.2em] pb-1 border-b-2 transition-all duration-300 ${entryMode === 'admin' ? 'text-[var(--on-surface)] border-[var(--on-surface)] font-bold' : 'text-[var(--on-surface)] opacity-50 border-transparent hover:text-[var(--on-surface)] opacity-80'}`}
                disabled={isSubmitting}
              >
                Admin Entry
              </button>
            </div>
          </div>

          {entryMode === 'voter' ? (
            <>
              <div className="w-full mb-8 overflow-hidden relative z-20">
                <div
                  className="flex"
                  style={{ transform: `translateX(-${stepIndex * 100}%)`, transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
                >
                  {steps.map((step) => (
                    <div key={step.label} className="w-full shrink-0 px-1">
                      <label className="uppercase text-[0.6rem] tracking-[0.2em] text-[var(--on-surface)] opacity-50 mb-3 block">{step.label}</label>
                      <input
                        type={step.type}
                        placeholder={step.placeholder}
                        className={`w-full p-4 md:p-5 text-lg md:text-xl tracking-widest font-muse ${step.type === 'date' ? '' : 'uppercase'} bg-[var(--surface-container)] text-[var(--on-surface)] placeholder-[var(--on-surface)]/50 focus:outline-none focus:bg-[var(--surface-container-high)] transition-colors border-none`}
                        value={step.value}
                        onChange={(e) => step.onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSubmitting}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full flex items-center justify-between mb-6 h-4 relative z-20">
                <p className="uppercase text-[0.6rem] tracking-[0.2em] text-[var(--on-surface)] opacity-50">STEP {stepIndex + 1}</p>
                {error ? <p className="uppercase text-[0.6rem] tracking-[0.1em] text-red-600 absolute right-0 bg-[var(--surface-container-lowest)]/90 pl-2">{error}</p> : null}
              </div>

              <div className="w-full flex items-center justify-end relative z-20">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={isSubmitting}
                    className="mr-auto text-[0.65rem] uppercase tracking-[0.2em] text-[var(--on-surface)] opacity-50 hover:text-[var(--on-surface)] transition-colors"
                  >
                    Previous
                  </button>
                )}

                <button
                  onClick={handleAdvance}
                  disabled={isSubmitting}
                  className="group bg-[var(--primary)] text-[var(--on-primary)] px-6 py-4 flex items-center gap-4 transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                >
                  <span className="text-[0.65rem] uppercase tracking-[0.2em]">
                    {isSubmitting ? 'VERIFYING' : stepIndex < steps.length - 1 ? 'NEXT SEQUENCE' : 'ENTER CHAMBER'}
                  </span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-full mb-6 relative z-20">
                <label className="uppercase text-[0.6rem] tracking-[0.2em] text-[var(--on-surface)] opacity-50 mb-3 block">ADMIN MASTER KEY</label>
                <input
                  type="password"
                  placeholder=""
                  className="w-full p-4 text-xl tracking-widest font-muse uppercase bg-[var(--surface-container)] text-[var(--on-surface)] placeholder-[var(--on-surface)]/50 focus:outline-none focus:bg-[var(--surface-container-high)] transition-colors border-none"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSubmitting}
                />
              </div>

              <div className="w-full flex justify-end h-4 mb-6 relative z-20">
                {error ? <p className="uppercase text-[0.6rem] tracking-[0.1em] text-red-600">{error}</p> : null}
              </div>

              <div className="w-full flex justify-end relative z-20">
                <button
                  type="button"
                  onClick={handleAdminAccess}
                  disabled={isSubmitting}
                  className="group bg-[var(--primary)] text-[var(--on-primary)] px-6 py-4 flex items-center gap-4 transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                >
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--on-primary)]">
                    {isSubmitting ? 'VERIFYING' : 'ENTER CHAMBER'}
                  </span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer Meta */}
        <div className="w-full max-w-xl flex justify-between items-center mt-6 text-[var(--on-surface)] opacity-50 z-10 pl-2">
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-[var(--on-surface)] opacity-50" />
            <span className="text-[0.55rem] uppercase tracking-[0.2em]">PROTOCOL SECURED</span>    
          </div>
          <span className="text-[0.55rem] uppercase tracking-[0.2em]">SERIAL: A-2949-V01</span>    
        </div>
      </div>
    </div>
  );
}

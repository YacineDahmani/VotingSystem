import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck,
  KeyRound,
  Lock,
  ShieldCheck,
  Vote,
  X,
} from 'lucide-react';
import { adminLogin, getAdminSetupStatus, setupInitialAdmin, submitIdentity, validateElectionCode } from '../../lib/api';
import { clearSession, getSession, getVoterPhase, isAdminSession, isVoterSession, setSession } from '../../store/session';
import { useToast } from '../../components/ui/useToast';

const evaluatePasswordStrength = (password) => {
  const checks = {
    length: (password || '').length >= 8,
    hasUpper: /[A-Z]/.test(password || ''),
    hasLower: /[a-z]/.test(password || ''),
    hasNumber: /[0-9]/.test(password || ''),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password || ''),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;
  let label = 'EMPTY';
  let color = 'bg-transparent';
  let textColor = 'text-[var(--on-surface)]/40';

  if (password) {
    if (passedCount <= 2) {
      label = 'WEAK';
      color = 'bg-red-500';
      textColor = 'text-red-600';
    } else if (passedCount === 3) {
      label = 'FAIR';
      color = 'bg-amber-500';
      textColor = 'text-amber-600';
    } else if (passedCount === 4) {
      label = 'GOOD';
      color = 'bg-blue-500';
      textColor = 'text-blue-600';
    } else if (passedCount === 5) {
      label = 'STRONG';
      color = 'bg-[var(--secondary)]';
      textColor = 'text-[var(--secondary)]';
    }
  }

  return {
    checks,
    passedCount,
    label,
    color,
    textColor,
    isStrong: passedCount === 5,
  };
};

const SESSION_STATUS_COPY = {
  open: {
    label: 'OPEN',
    detail: 'Voting session is active and open.',
    badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40',
    boxBorder: 'border-t-[3px] border-t-emerald-600 dark:border-t-emerald-400 border-emerald-600/30 dark:border-emerald-400/30',
  },
  waiting: {
    label: 'DRAFT',
    detail: 'Voting has not started yet.',
    badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40',
    boxBorder: 'border-t-[3px] border-t-amber-600 dark:border-t-amber-400 border-amber-600/30 dark:border-amber-400/30',
  },
  closed: {
    label: 'CLOSED',
    detail: 'Voting window has ended.',
    badgeClass: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/40',
    boxBorder: 'border-t-[3px] border-t-rose-600 dark:border-t-rose-400 border-rose-600/30 dark:border-rose-500/30',
  },
  invalid: {
    label: 'INVALID',
    detail: 'Session code not found in directory.',
    badgeClass: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/40',
    boxBorder: 'border-t-[3px] border-t-rose-600 dark:border-t-rose-400 border-rose-600/30 dark:border-rose-500/30',
  },
};

export default function SignInView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialUrlCode = useMemo(() => (searchParams.get('code') || searchParams.get('session') || '').trim().toUpperCase(), [searchParams]);

  const [entryMode, setEntryMode] = useState('voter');
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [voterIdCode, setVoterIdCode] = useState('');
  const [sessionCode, setSessionCode] = useState(initialUrlCode);
  
  // Admin Authentication State
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [setupUsername, setSetupUsername] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);

  const passwordStrength = useMemo(() => evaluatePasswordStrength(setupPassword), [setupPassword]);
  const { pushToast } = useToast();

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [sessionStatus, setSessionStatus] = useState({
    state: 'waiting',
    electionTitle: null,
    electionCode: null,
    message: '',
    isLoaded: false,
  });

  useEffect(() => {
    const isTestingVoter = !!(initialUrlCode || searchParams.get('test') === 'voter' || searchParams.get('mode') === 'voter');

    if (isTestingVoter) {
      try {
        sessionStorage.removeItem('analog-voting-session');
      } catch {
        /* ignore storage access restriction */
      }
      setEntryMode('voter');
      if (initialUrlCode) {
        setSessionCode(initialUrlCode);
      }
      return;
    }

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

    navigate('/vote', { replace: true });
  }, [navigate, initialUrlCode, searchParams]);

  const statusMeta = SESSION_STATUS_COPY[sessionStatus.state] || SESSION_STATUS_COPY.waiting;

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

    if (!value) {
      setError('');
      return;
    }

    const years = calculateAge(value);
    if (years !== null && years < 18) {
      setError('You must be at least 18 years of age to vote.');
      return;
    }

    setError('');
  }, [calculateAge]);

  const showValidationError = useCallback((message) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 420);
    pushToast({
      type: 'error',
      title: 'Validation Error',
      message,
    });
  }, [pushToast]);

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

  const clearSessionStatus = useCallback(() => {
    setSessionStatus({
      state: 'waiting',
      electionTitle: null,
      electionCode: null,
      message: '',
      isLoaded: false,
    });
  }, []);

  const applySessionStatusFromCode = useCallback((state, election, message = '') => {
    const normalizedState = SESSION_STATUS_COPY[state] ? state : 'invalid';
    setSessionStatus({
      state: normalizedState,
      electionTitle: election?.title || null,
      electionCode: election?.code || sessionCode.trim().toUpperCase() || null,
      message,
      isLoaded: true,
    });
  }, [sessionCode]);

  const checkSessionCodeStatus = useCallback(async ({ routeClosedToResults = false } = {}) => {
    const normalizedCode = sessionCode.trim().toUpperCase();

    if (normalizedCode.length !== 8) {
      setError('Session code must be exactly 8 characters.');
      setSessionStatus({
        state: 'invalid',
        electionTitle: null,
        electionCode: normalizedCode || null,
        message: 'Session code must be exactly 8 characters.',
        isLoaded: true,
      });
      return { ok: false, state: 'invalid' };
    }

    try {
      const response = await validateElectionCode(normalizedCode);
      applySessionStatusFromCode('open', response?.election, 'This session is open. You can proceed.');
      setError('');
      return { ok: true, state: 'open', election: response?.election || null };
    } catch (err) {
      const reason = err?.data?.reason;
      const election = err?.data?.election;

      if (reason === 'draft') {
        const msg = err?.message || 'This session has not started yet.';
        applySessionStatusFromCode('waiting', election, msg);
        setError(msg);
        return { ok: false, state: 'waiting', election };
      }

      if (reason === 'ended' || reason === 'closed') {
        const message = err?.message || 'This voting session has already ended.';
        applySessionStatusFromCode('closed', election, message);

        if (routeClosedToResults && election?.id) {
          routeClosedSessionToResults(election, message);
        } else {
          setError(message);
        }

        return { ok: false, state: 'closed', election };
      }

      const msg = err?.message || 'Session code not found in directory.';
      applySessionStatusFromCode('invalid', election, msg);
      setError(msg);
      return { ok: false, state: 'invalid', election };
    }
  }, [applySessionStatusFromCode, routeClosedSessionToResults, sessionCode]);

  const ensureSessionCodeIsOpen = useCallback(async () => {
    const check = await checkSessionCodeStatus({ routeClosedToResults: true });
    return check.ok;
  }, [checkSessionCodeStatus]);

  const validateAllVoterFields = () => {
    if (sessionCode.trim().length !== 8) {
      showValidationError('Session code must be exactly 8 characters.');
      return false;
    }

    if (name.trim().length < 2) {
      showValidationError('Full name must include at least 2 characters.');
      return false;
    }

    const years = calculateAge(birthdate);
    if (years === null) {
      showValidationError('A valid birthdate is required.');
      return false;
    }

    if (years < 18) {
      showValidationError('You must be at least 18 years old to vote.');
      return false;
    }

    if (voterIdCode.trim().length < 3) {
      showValidationError('Voter ID code is required.');
      return false;
    }

    setError('');
    return true;
  };

  const handleAdvance = async () => {
    if (isSubmitting) return;

    if (!validateAllVoterFields()) return;

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
        phase: result.phase || 'vote',
        resultsElectionId: null,
        resultsNotice: null,
      });
      const phase = result.phase || 'vote';
      if (phase === 'results') {
        navigate('/results');
      } else if (phase === 'waiting' || result.hasVoted) {
        navigate('/waiting');
      } else {
        navigate('/vote');
      }
    } catch (err) {
      const reason = err?.data?.reason;
      const election = err?.data?.election;
      if ((reason === 'ended' || reason === 'closed') && election?.id) {
        const message = err?.message || 'This voting session has already ended. Redirecting to results.';
        showValidationError(message);
        routeClosedSessionToResults(election, message);
        return;
      }

      showValidationError(err.message || 'Unable to verify identity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await getAdminSetupStatus();
        setIsSetupMode(!res.isInitialized);
      } catch {
        // Fallback: keep existing setup mode state
      }
    };
    checkSetup();
  }, []);

  const handleAdminAccess = async () => {
    if (isSubmitting) return;

    if (isSetupMode) {
      const u = setupUsername.trim();
      const e = setupEmail.trim();
      const p = setupPassword;
      const cp = setupConfirmPassword;

      if (!u || u.length < 3) {
        showValidationError('Username must be at least 3 characters.');
        return;
      }
      if (!e || !e.includes('@')) {
        showValidationError('A valid email address is required.');
        return;
      }
      if (!p || p.length < 8) {
        showValidationError('Password must be at least 8 characters long.');
        return;
      }
      if (!passwordStrength.isStrong) {
        if (!passwordStrength.checks.hasUpper) {
          showValidationError('Password must include at least one uppercase letter.');
        } else if (!passwordStrength.checks.hasLower) {
          showValidationError('Password must include at least one lowercase letter.');
        } else if (!passwordStrength.checks.hasNumber) {
          showValidationError('Password must include at least one number.');
        } else if (!passwordStrength.checks.hasSpecial) {
          showValidationError('Password must include at least one special character.');
        } else {
          showValidationError('Password does not meet the security requirements.');
        }
        return;
      }
      if (p !== cp) {
        showValidationError('Passwords do not match.');
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await setupInitialAdmin({ username: u, email: e, password: p });
        clearSession();
        setSession({
          role: 'admin',
          token: result.token,
          adminId: result.admin?.id,
          adminUsername: result.admin?.username,
          adminEmail: result.admin?.email,
          adminRole: result.admin?.role,
        });
        setIsFlipping(true);
        setTimeout(() => navigate('/admin'), 600);
      } catch (err) {
        showValidationError(err.message || 'Failed to initialize administrator account.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const idVal = adminIdentifier.trim();
    const passVal = adminPassword;

    if (!idVal && !passVal) {
      showValidationError('Admin username and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await adminLogin({ identifier: idVal, password: passVal });

      if (!result.token) {
        throw new Error('Admin authentication failed.');
      }

      clearSession();
      setSession({
        role: 'admin',
        token: result.token,
        adminId: result.admin?.id,
        adminUsername: result.admin?.username,
        adminEmail: result.admin?.email,
        adminRole: result.admin?.role,
      });
      setIsFlipping(true);
      setTimeout(() => navigate('/admin'), 600);
    } catch (err) {
      showValidationError(err.message || 'Invalid admin credentials.');
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
      className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 selection:bg-[var(--primary)] selection:text-[var(--on-primary)]"
      style={isFlipping ? { transform: 'rotateY(180deg)', opacity: 0, transition: 'transform 0.6s ease, opacity 0.6s ease' } : { transition: 'transform 0.6s ease, opacity 0.6s ease' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        
        {/* Left Panel: Information & Principles */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest font-mono font-bold text-[var(--secondary)] mb-2">
              Election Portal
            </p>
            <h1 className="font-muse text-4xl sm:text-5xl text-[var(--on-surface)] font-bold tracking-tight leading-[1.1]">
              Voting System
            </h1>
            <p className="mt-3 text-sm text-[var(--on-surface)]/75 leading-relaxed font-sans">
                Cast your vote using your election session code, or sign in to manage elections.
              </p>

              {/* Core Principles */}
              <div className="mt-8 space-y-4 border-t border-[var(--on-surface)]/15 pt-6">
                <div>
                  <h2 className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)] font-sans">
                    vote Privacy
                  </h2>
                  <p className="text-xs text-[var(--on-surface)]/70 mt-0.5 leading-relaxed font-sans">
                    Votes are mathematically decoupled from voter identity before storage.
                  </p>
                </div>

                <div>
                  <h2 className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)] font-sans">
                    Verified Eligibility
                  </h2>
                  <p className="text-xs text-[var(--on-surface)]/70 mt-0.5 leading-relaxed font-sans">
                    One vote per registered citizen per active election session.
                  </p>
                </div>

                <div>
                  <h2 className="text-xs uppercase tracking-wider font-bold text-[var(--on-surface)] font-sans">
                    Certified Results
                  </h2>
                  <p className="text-xs text-[var(--on-surface)]/70 mt-0.5 leading-relaxed font-sans">
                    Public verifiable tallies available immediately once voting closes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Form Slate */}
          <div className="lg:col-span-7">
            <div
              className="relative bg-[var(--surface-container-lowest)] border border-[var(--on-surface)]/20 dark:border-[var(--on-surface)]/30 shadow-2xl p-6 sm:p-10 transition-transform"
              style={isShaking ? { transform: 'translateX(-4px)', transition: 'transform 0.4s ease' } : {}}
            >
              {/* Corner crosshairs */}
              <span className="absolute top-2 left-2.5 font-mono text-[10px] text-[var(--on-surface)]/25 select-none pointer-events-none">+</span>
              <span className="absolute top-2 right-2.5 font-mono text-[10px] text-[var(--on-surface)]/25 select-none pointer-events-none">+</span>
              <span className="absolute bottom-2 left-2.5 font-mono text-[10px] text-[var(--on-surface)]/25 select-none pointer-events-none">+</span>
              <span className="absolute bottom-2 right-2.5 font-mono text-[10px] text-[var(--on-surface)]/25 select-none pointer-events-none">+</span>

              {/* Form Header & Mode Switcher */}
              <div className="border-b border-[var(--on-surface)]/15 pb-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-muse text-2xl sm:text-3xl text-[var(--on-surface)] font-bold">
                      {entryMode === 'voter'
                        ? 'Voter Sign In'
                        : isSetupMode
                          ? 'Admin Setup'
                          : 'Admin Sign In'}
                    </h2>
                  </div>

                  {/* Mode Switcher */}
                  <div className="inline-flex p-1 bg-[var(--surface-container)] border border-[var(--on-surface)]/15 gap-1 shrink-0 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setEntryMode('voter');
                        setError('');
                      }}
                      className={`px-3.5 py-1.5 text-xs uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 ${
                        entryMode === 'voter'
                          ? 'bg-[var(--primary)] text-[var(--on-primary)] shadow-xs'
                          : 'text-[var(--on-surface)]/70 hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]'
                      }`}
                      disabled={isSubmitting}
                    >
                      <Vote size={13} />
                      <span>Voter</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEntryMode('admin');
                        setError('');
                      }}
                      className={`px-3.5 py-1.5 text-xs uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 ${
                        entryMode === 'admin'
                          ? 'bg-[var(--primary)] text-[var(--on-primary)] shadow-xs'
                          : 'text-[var(--on-surface)]/70 hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]'
                      }`}
                      disabled={isSubmitting}
                    >
                      <KeyRound size={13} />
                      <span>Admin</span>
                    </button>
                  </div>
                </div>

                {/* Session Status Banner */}
                {entryMode === 'voter' && sessionStatus.isLoaded ? (
                  <div className={`mt-5 w-full bg-[var(--surface)] border ${statusMeta.boxBorder} p-3.5 shadow-xs relative`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="uppercase font-mono text-xs tracking-wider text-[var(--on-surface)] opacity-70 font-semibold">
                        Session Status
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                        <button
                          type="button"
                          onClick={clearSessionStatus}
                          className="p-1 text-[var(--on-surface)]/50 hover:text-[var(--on-surface)] hover:bg-[var(--on-surface)]/10 transition-colors rounded"
                          aria-label="Dismiss session status"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--on-surface)] opacity-85 leading-relaxed font-sans pr-6">
                      {sessionStatus.message || statusMeta.detail}
                    </p>
                    {sessionStatus.electionTitle ? (
                      <p className="mt-1.5 text-xs text-[var(--on-surface)] font-mono font-bold">
                        {sessionStatus.electionTitle}
                        {sessionStatus.electionCode ? ` [Code: ${sessionStatus.electionCode}]` : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {entryMode === 'voter' ? (
                <div className="w-full space-y-5">
                  {/* Session Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="voter-session-code" className="text-xs uppercase font-mono tracking-wider font-bold text-[var(--on-surface)]">
                        Session Code <span className="text-rose-600 dark:text-rose-400" aria-hidden="true">*</span>
                      </label>
                      <span className="font-mono text-[0.65rem] tracking-wider uppercase text-[var(--on-surface)]/50">
                        8 characters
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="voter-session-code"
                        name="sessionCode"
                        type="text"
                        placeholder="8-CHARACTER CODE"
                        aria-required="true"
                        aria-invalid={error && error.toLowerCase().includes('session') ? 'true' : 'false'}
                        className="w-full p-3.5 text-base sm:text-lg font-mono tracking-[0.25em] uppercase bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                        value={sessionCode}
                        onChange={(e) => {
                          setSessionCode(e.target.value.toUpperCase());
                          if (sessionStatus.isLoaded) {
                            clearSessionStatus();
                          }
                          if (error && (error.toLowerCase().includes('session') || error.toLowerCase().includes('election') || error.toLowerCase().includes('code'))) {
                            setError('');
                          }
                        }}
                        onKeyDown={handleKeyDown}
                        maxLength={8}
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={() => checkSessionCodeStatus({ routeClosedToResults: true })}
                        disabled={sessionCode.trim().length !== 8 || isSubmitting}
                        className="px-5 py-3 text-xs uppercase tracking-wider font-bold border border-[var(--on-surface)]/20 bg-[var(--surface-container-high)] text-[var(--on-surface)] hover:bg-[var(--on-surface)] hover:text-[var(--surface)] disabled:opacity-40 disabled:hover:bg-[var(--surface-container-high)] disabled:hover:text-[var(--on-surface)] transition-all shrink-0 active:scale-[0.98]"
                      >
                        Verify
                      </button>
                    </div>
                  </div>

                  {/* Full Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="voter-name" className="text-xs uppercase font-mono tracking-wider font-bold text-[var(--on-surface)]">
                        Full Name <span className="text-rose-600 dark:text-rose-400" aria-hidden="true">*</span>
                      </label>
                    </div>
                    <input
                      id="voter-name"
                      name="name"
                      type="text"
                      placeholder="Enter your full name"
                      autoComplete="name"
                      aria-required="true"
                      aria-invalid={error && error.toLowerCase().includes('name') ? 'true' : 'false'}
                      className="w-full p-3.5 text-base bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={100}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Birthdate & Voter ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="voter-birthdate" className="text-xs uppercase font-mono tracking-wider font-bold text-[var(--on-surface)]">
                          Date of Birth <span className="text-rose-600 dark:text-rose-400" aria-hidden="true">*</span>
                        </label>
                        <span className="font-mono text-[0.65rem] tracking-wider uppercase text-[var(--secondary)] font-bold">
                          Age ≥ 18
                        </span>
                      </div>
                      <input
                        id="voter-birthdate"
                        name="birthdate"
                        type="date"
                        autoComplete="bday"
                        aria-required="true"
                        aria-invalid={error && (error.toLowerCase().includes('birth') || error.toLowerCase().includes('18')) ? 'true' : 'false'}
                        className="w-full p-3.5 text-base bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                        value={birthdate}
                        onChange={(e) => handleBirthdateChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="voter-id" className="text-xs uppercase font-mono tracking-wider font-bold text-[var(--on-surface)]">
                          Voter ID <span className="text-rose-600 dark:text-rose-400" aria-hidden="true">*</span>
                        </label>
                      </div>
                      <input
                        id="voter-id"
                        name="voterId"
                        type="text"
                        placeholder="e.g. VOTE-10101"
                        autoComplete="off"
                        aria-required="true"
                        aria-invalid={error && error.toLowerCase().includes('voter id') ? 'true' : 'false'}
                        className="w-full p-3.5 text-base bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all font-mono"
                        value={voterIdCode}
                        onChange={(e) => setVoterIdCode(e.target.value)}
                        onKeyDown={handleKeyDown}
                        maxLength={20}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Error Alert */}
                  {error ? (
                    <div role="alert" className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
                      <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                      <span className="leading-relaxed font-sans font-medium">{error}</span>
                    </div>
                  ) : null}

                  {/* Privacy note */}
                  <p className="text-xs text-[var(--on-surface)]/60 leading-relaxed border-t border-[var(--on-surface)]/10 pt-3 font-sans">
                    Your vote is anonymous and unlinked from your voter credentials upon submission.
                  </p>

                  {/* Submit Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3.5 flex items-center justify-center gap-3 text-xs uppercase tracking-wider font-bold transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md disabled:opacity-50 active:scale-[0.98]"
                    >
                      <span>{isSubmitting ? 'Verifying...' : 'Continue to vote'}</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ) : isSetupMode ? (
                <div className="w-full space-y-4">
                  <div className="bg-[var(--surface-container)] p-3 border border-[var(--outline-variant)]/40 flex items-center gap-2 mb-2">
                    <ShieldCheck size={16} className="text-[var(--secondary)] shrink-0" />
                    <span className="text-xs text-[var(--on-surface)]/80 font-sans">
                      First-time setup: create the administrator account.
                    </span>
                  </div>

                  <div>
                    <label htmlFor="setup-username" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                      Username *
                    </label>
                    <input
                      id="setup-username"
                      name="username"
                      type="text"
                      placeholder="Admin username"
                      autoComplete="username"
                      className="w-full p-3 text-sm bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                      value={setupUsername}
                      onChange={(e) => setSetupUsername(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="setup-email" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                      Email Address *
                    </label>
                    <input
                      id="setup-email"
                      name="email"
                      type="email"
                      placeholder="admin@example.com"
                      autoComplete="email"
                      className="w-full p-3 text-sm bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="setup-password" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                        Password *
                      </label>
                      <div className="relative">
                        <input
                          id="setup-password"
                          name="password"
                          type={showSetupPassword ? 'text' : 'password'}
                          placeholder="Min. 8 characters"
                          autoComplete="new-password"
                          className="w-full p-3 pr-10 text-sm bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                          value={setupPassword}
                          onChange={(e) => setSetupPassword(e.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSetupPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface)] opacity-50 hover:opacity-90 transition-opacity p-1"
                          title={showSetupPassword ? 'Hide password' : 'Show password'}
                          tabIndex={-1}
                        >
                          {showSetupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="setup-confirm-password" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                        Confirm Password *
                      </label>
                      <div className="relative">
                        <input
                          id="setup-confirm-password"
                          name="confirmPassword"
                          type={showSetupConfirmPassword ? 'text' : 'password'}
                          placeholder="Repeat password"
                          autoComplete="new-password"
                          className="w-full p-3 pr-10 text-sm bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                          value={setupConfirmPassword}
                          onChange={(e) => setSetupConfirmPassword(e.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSetupConfirmPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface)] opacity-50 hover:opacity-90 transition-opacity p-1"
                          title={showSetupConfirmPassword ? 'Hide password' : 'Show password'}
                          tabIndex={-1}
                        >
                          {showSetupConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {setupPassword ? (
                    <div className="bg-[var(--surface-container)] p-3 border border-[var(--outline-variant)]/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="uppercase text-xs font-mono font-bold tracking-wider text-[var(--on-surface)] opacity-80">
                          Password Strength: {passwordStrength.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 h-1.5 w-full">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-full transition-all duration-300 ${
                              level <= passwordStrength.passedCount
                                ? passwordStrength.color
                                : 'bg-[var(--on-surface)]/10'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {error ? (
                    <div role="alert" className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
                      <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                      <span className="leading-relaxed font-sans font-medium">{error}</span>
                    </div>
                  ) : null}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAdminAccess}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3.5 flex items-center justify-center gap-3 text-xs uppercase tracking-wider font-bold transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md disabled:opacity-50 active:scale-[0.98]"
                    >
                      <span>{isSubmitting ? 'Creating account...' : 'Create Admin Account'}</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="bg-[var(--surface-container)] p-3 border border-[var(--outline-variant)]/40 flex items-center gap-2 mb-2">
                    <Lock size={15} className="text-[var(--blueprint)] shrink-0" />
                    <span className="text-xs text-[var(--on-surface)]/80 font-sans">
                      Admin access for configuring elections and viewing audits.
                    </span>
                  </div>

                  <div>
                    <label htmlFor="admin-identifier" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                      Username or Email *
                    </label>
                    <input
                      id="admin-identifier"
                      name="identifier"
                      type="text"
                      placeholder="Enter username or email"
                      autoComplete="username"
                      className="w-full p-3.5 text-base bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                      value={adminIdentifier}
                      onChange={(e) => setAdminIdentifier(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-password" className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--on-surface)] opacity-80 mb-1.5 block">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        id="admin-password"
                        name="password"
                        type={showAdminPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        autoComplete="current-password"
                        className="w-full p-3.5 pr-10 text-base bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:bg-[var(--surface-container-high)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface)] opacity-50 hover:opacity-90 transition-opacity p-1"
                        title={showAdminPassword ? 'Hide password' : 'Show password'}
                        tabIndex={-1}
                      >
                        {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <div role="alert" className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
                      <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                      <span className="leading-relaxed font-sans font-medium">{error}</span>
                    </div>
                  ) : null}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAdminAccess}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-[var(--primary)] text-[var(--on-primary)] px-8 py-3.5 flex items-center justify-center gap-3 text-xs uppercase tracking-wider font-bold transition-all duration-200 hover:bg-[var(--primary)]/90 hover:shadow-md disabled:opacity-50 active:scale-[0.98]"
                    >
                      <span>{isSubmitting ? 'Signing in...' : 'Sign In'}</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}


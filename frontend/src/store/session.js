import { useEffect, useState } from 'react';

const SESSION_KEY = 'analog-voting-session';
const VOTER_PHASES = {
  BALLOT: 'ballot',
  WAITING: 'waiting',
  RESULTS: 'results',
};

function hasElectionEnded(session) {
  if (!session) {
    return false;
  }

  if (session.electionStatus === 'closed') {
    return true;
  }

  if (!session.electionEndAt) {
    return false;
  }

  const endDate = new Date(session.electionEndAt);
  if (Number.isNaN(endDate.getTime())) {
    return false;
  }

  return Date.now() >= endDate.getTime();
}

function readSession() {
  try {
    const rawSession = sessionStorage.getItem(SESSION_KEY);
    if (rawSession) {
      return JSON.parse(rawSession);
    }
    const rawLocal = localStorage.getItem(SESSION_KEY);
    return rawLocal ? JSON.parse(rawLocal) : {};
  } catch {
    return {};
  }
}

function notifySessionChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('session-update'));
  }
}

function writeSession(next) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    if (next?.role === 'admin') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    }
    notifySessionChange();
  } catch {}
}

export function getSession() {
  return readSession();
}

export function setSession(partial) {
  const current = readSession();
  const next = { ...current, ...partial };
  writeSession(next);
  return next;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    notifySessionChange();
  } catch {}
}

export function isAdminSession(session = readSession()) {
  return session?.role === 'admin' && !!session?.token;
}

export function isVoterSession(session = readSession()) {
  return session?.role === 'voter' && !!session?.token && !!session?.voterId && !!session?.electionId;
}

export function getVoterPhase(session = readSession()) {
  if (!isVoterSession(session)) {
    return null;
  }

  if (hasElectionEnded(session)) {
    return VOTER_PHASES.RESULTS;
  }

  if (session.phase) {
    return session.phase;
  }

  return session.hasVoted ? VOTER_PHASES.WAITING : VOTER_PHASES.BALLOT;
}

export function setVoterPhase(phase) {
  if (!Object.values(VOTER_PHASES).includes(phase)) {
    return readSession();
  }

  return setSession({ phase });
}

export function markVoteSubmitted(candidateId, metadata = {}) {
  return setSession({
    selectedCandidateId: candidateId,
    votedCandidateName: metadata.candidateName || null,
    ballotReceiptCode: metadata.receiptCode || null,
    hasVoted: true,
    phase: VOTER_PHASES.WAITING,
    waitingDismissedAt: null,
    votedAt: metadata.votedAt || new Date().toISOString(),
  });
}

export function markWaitingDismissed() {
  return setSession({
    waitingDismissedAt: new Date().toISOString(),
  });
}

export function useSession() {
  const [session, setSessionState] = useState(() => readSession());

  useEffect(() => {
    const handleUpdate = () => {
      setSessionState(readSession());
    };

    window.addEventListener('session-update', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('session-update', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return session;
}

export { VOTER_PHASES };

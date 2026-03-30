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
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSession(next) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
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
  localStorage.removeItem(SESSION_KEY);
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

export function markVoteSubmitted(candidateId) {
  return setSession({
    selectedCandidateId: candidateId,
    hasVoted: true,
    phase: VOTER_PHASES.WAITING,
    waitingDismissedAt: null,
    votedAt: new Date().toISOString(),
  });
}

export function markWaitingDismissed() {
  return setSession({
    waitingDismissedAt: new Date().toISOString(),
  });
}

export { VOTER_PHASES };

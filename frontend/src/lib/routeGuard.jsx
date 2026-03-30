import { Navigate } from 'react-router-dom';
import { VOTER_PHASES, getSession, getVoterPhase, isAdminSession, isVoterSession } from '../store/session';

export function VoterRoute({ children }) {
  const session = getSession();
  if (!isVoterSession(session)) {
    return <Navigate to="/" replace />;
  }

  const phase = getVoterPhase(session);
  if (session.hasVoted && phase === VOTER_PHASES.WAITING) {
    return <Navigate to="/waiting" replace />;
  }
  if (phase === VOTER_PHASES.RESULTS) {
    return <Navigate to="/results" replace />;
  }

  return children;
}

export function WaitingRoute({ children }) {
  const session = getSession();
  if (!isVoterSession(session)) {
    return <Navigate to="/" replace />;
  }

  if (!session.hasVoted) {
    return <Navigate to="/ballot" replace />;
  }

  const phase = getVoterPhase(session);
  if (phase === VOTER_PHASES.BALLOT) {
    return <Navigate to="/ballot" replace />;
  }
  if (phase === VOTER_PHASES.RESULTS) {
    return <Navigate to="/results" replace />;
  }

  return children;
}

export function AdminRoute({ children }) {
  const session = getSession();
  if (!isAdminSession(session)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export function ResultsRoute({ children }) {
  const session = getSession();

  if (isAdminSession(session)) {
    return children;
  }

  if (session?.resultsElectionId) {
    return children;
  }

  if (!isVoterSession(session)) {
    return <Navigate to="/" replace />;
  }

  const phase = getVoterPhase(session);
  if (session.hasVoted && phase === VOTER_PHASES.WAITING) {
    return <Navigate to="/waiting" replace />;
  }

  if (phase !== VOTER_PHASES.RESULTS) {
    return <Navigate to="/ballot" replace />;
  }

  return children;
}

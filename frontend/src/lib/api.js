const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const REQUEST_TIMEOUT_MS = 15000;

function getAuthToken() {
  try {
    const raw = localStorage.getItem('analog-voting-session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. Please make sure the backend server is running.');
    }

    throw new Error('Unable to reach the server. Please check your connection and backend status.');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function getActiveElection() {
  return request('/api/elections/active');
}

export function getElectionSessionStatus() {
  return request('/api/elections/session-status');
}

export function submitIdentity(payload) {
  return request('/api/session/identity', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function validateElectionCode(code) {
  return request('/api/elections/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function getCandidates(electionId) {
  return request(`/api/elections/${electionId}/candidates`);
}

export function castVote(electionId, payload) {
  return request(`/api/elections/${electionId}/vote`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getResults(electionId) {
  return request(`/api/elections/${electionId}/results`);
}

export function getAdminElections() {
  return request('/api/admin/elections');
}

export function createElection(payload) {
  return request('/api/admin/elections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateElectionDetails(electionId, payload) {
  return request(`/api/admin/elections/${electionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteElection(electionId) {
  return request(`/api/admin/elections/${electionId}`, {
    method: 'DELETE',
  });
}

export function addCandidate(electionId, payload) {
  return request(`/api/admin/elections/${electionId}/candidates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteCandidate(candidateId) {
  return request(`/api/admin/candidates/${candidateId}`, {
    method: 'DELETE',
  });
}

export function importVoters(electionId, payload) {
  return request(`/api/admin/elections/${electionId}/import-voters`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function importCandidates(electionId, payload) {
  return request(`/api/admin/elections/${electionId}/import-candidates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function regenerateElectionCode(electionId) {
  return request(`/api/admin/elections/${electionId}/regenerate-code`, {
    method: 'POST',
  });
}

export function injectFakeVotes(electionId, payload) {
  return request(`/api/admin/elections/${electionId}/fake-votes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function detectFraud(electionId) {
  return request(`/api/admin/elections/${electionId}/fraud`);
}

export function getIntegrityReport(electionId) {
  return request(`/api/admin/elections/${electionId}/integrity-report`);
}

export function getFakeVoters(electionId) {
  return request(`/api/admin/elections/${electionId}/fake-voters`);
}

export function updateElectionStatus(electionId, status) {
  return request(`/api/admin/elections/${electionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

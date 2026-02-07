import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Configure Axios
const api = axios.create({
    baseURL: '/api',
});

// --- Query Keys ---
export const KEYS = {
    ELECTIONS: 'elections',
    ELECTION: (id) => ['election', id],
    CANDIDATES: (id) => ['candidates', id],
    RESULTS: (id) => ['results', id],
    VOTER_SESSION: 'voter-session',
    SYSTEM_STATUS: 'system-status'
};

// --- API Functions ---
const fetchElections = async () => (await api.get('/admin/elections')).data.elections;
const fetchStatus = async () => (await api.get('/status')).data;
const fetchElection = async (id) => (await api.get(`/elections/${id}/results`)).data; // Using results endpoint as it returns election + candidates
const fetchCandidates = async (id) => (await api.get(`/elections/${id}/candidates`)).data.candidates;
const adminLogin = async (password) => (await api.post('/admin/login', { password })).data;

// --- Hooks ---

// System Status
export const useSystemStatus = () => useQuery({
    queryKey: [KEYS.SYSTEM_STATUS],
    queryFn: fetchStatus,
    refetchInterval: 30000 // Check every 30s
});

// Admin: All Elections
export const useAdminElections = () => useQuery({
    queryKey: [KEYS.ELECTIONS],
    queryFn: fetchElections
});

// Admin: Login
export const useAdminLogin = () => useMutation({
    mutationFn: adminLogin
});

// Admin: Create Election
export const useCreateElection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.post('/admin/elections', data).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEYS.ELECTIONS] });
        }
    });
};

// Admin: Update Status
export const useUpdateElectionStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }) => api.patch(`/admin/elections/${id}/status`, { status }).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEYS.ELECTIONS] });
        }
    });
}

// Admin: Regenerate Code
export const useRegenerateCode = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => api.post(`/admin/elections/${id}/regenerate-code`).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEYS.ELECTIONS] });
        }
    });
}

// Candidates
export const useAddCandidate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ electionId, name }) => api.post(`/admin/elections/${electionId}/candidates`, { name }).then(res => res.data),
        onSuccess: (_, { electionId }) => {
            queryClient.invalidateQueries({ queryKey: KEYS.CANDIDATES(electionId) });
            queryClient.invalidateQueries({ queryKey: KEYS.ELECTION(electionId) }); // Refresh results too
        }
    });
}

export const useDeleteCandidate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => api.delete(`/admin/candidates/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEYS.ELECTIONS] });
            queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }
    });
}

// Dev: Fake Votes
export const useAddFakeVotes = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ electionId, candidateId, count }) => api.post(`/admin/elections/${electionId}/fake-votes`, { candidateId, count }).then(res => res.data),
        onSuccess: (_, { electionId }) => {
            queryClient.invalidateQueries({ queryKey: KEYS.ELECTION(electionId) });
        }
    });
}

// Fraud Detection
export const useFraudDetection = (electionId) => useQuery({
    queryKey: ['fraud', electionId],
    queryFn: () => api.get(`/admin/elections/${electionId}/fraud`).then(res => res.data),
    enabled: !!electionId
});

// Election Data (Public/Voter)
export const useElection = (id) => useQuery({
    queryKey: KEYS.ELECTION(id),
    queryFn: () => fetchElection(id),
    enabled: !!id,
    refetchInterval: 5000 // Poll results every 5s
});

// Join Election
export const useJoinElection = () => useMutation({
    mutationFn: (code) => api.post('/elections/join', { code }).then(res => res.data)
});

// Register Voter
export const useRegisterVoter = () => useMutation({
    mutationFn: ({ electionId, ...data }) => api.post(`/elections/${electionId}/register`, data).then(res => res.data)
});

// Cast Vote
export const useCastVote = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ electionId, candidateId, voterId }) =>
            api.post(`/elections/${electionId}/vote`, { candidateId, voterId }).then(res => res.data),
        onSuccess: (_, { electionId }) => {
            queryClient.invalidateQueries({ queryKey: KEYS.ELECTION(electionId) });
        }
    });
}

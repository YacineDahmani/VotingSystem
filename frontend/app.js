const state = {
    currentView: 'entry',
    election: null, // Active election object
    voter: null,    // Authenticated voter for current election
    isAdmin: false,
    pollInterval: null,
    charts: {
        results: null
    },
    // Admin state
    adminElections: [],
    managingElection: null
};

// ==================== DOM ELEMENTS ====================

const elements = {
    // Views
    entryView: document.getElementById('election-entry-view'),
    voterView: document.getElementById('voter-view'),

    // Nav
    navTitle: document.getElementById('nav-title'),
    btnHome: document.getElementById('btn-home'),

    // Entry
    electionCodeForm: document.getElementById('election-code-form'),
    electionCodeInput: document.getElementById('election-code'),
    btnAdminLogin: document.getElementById('btn-admin-login'),

    // Voter Flow
    registrationSection: document.getElementById('voter-registration-section'),
    registrationForm: document.getElementById('voter-registration-form'),
    voterName: document.getElementById('voter-name'),
    voterAge: document.getElementById('voter-age'),
    electionNameDisplay: document.getElementById('election-name-display'),

    votingSection: document.getElementById('voting-section'),
    electionTitleHeader: document.getElementById('election-title-header'),
    voterGreeting: document.getElementById('voter-greeting'),
    candidateGrid: document.getElementById('candidate-grid'),
    noCandidates: document.getElementById('no-candidates'),

    // Analytics
    analyticsSection: document.getElementById('analytics-section'),
    resultsBanner: document.getElementById('results-banner'),
    resultsChart: document.getElementById('results-chart'),
    resultsList: document.getElementById('results-list'),
    btnRefreshResults: document.getElementById('btn-refresh-results'),

    // Admin Login Modal
    adminModal: document.getElementById('admin-modal'),
    adminModalBackdrop: document.getElementById('admin-modal-backdrop'),
    adminLogin: document.getElementById('admin-login'),
    adminLoginForm: document.getElementById('admin-login-form'),
    adminPassword: document.getElementById('admin-password'),
    adminModalClose: document.getElementById('admin-modal-close'),

    // Admin Dashboard
    adminPanel: document.getElementById('admin-panel'),
    adminPanelClose: document.getElementById('admin-panel-close'),
    adminElectionsList: document.getElementById('admin-elections-list'),
    btnCreateElectionModal: document.getElementById('btn-create-election-modal'),

    // Create Election Modal
    electionFormModal: document.getElementById('election-form-modal'),
    createElectionForm: document.getElementById('create-election-form'),
    newElectionTitle: document.getElementById('new-election-title'),
    newElectionDesc: document.getElementById('new-election-desc'),
    newElectionCandidates: document.getElementById('new-election-candidates'),
    btnCancelCreate: document.getElementById('btn-cancel-create'),

    // Manage Election Modal
    manageElectionModal: document.getElementById('manage-election-modal'),
    btnCloseManage: document.getElementById('btn-close-manage'),
    manageTitle: document.getElementById('manage-title'),
    manageCode: document.getElementById('manage-code'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    btnRegenCode: document.getElementById('btn-regen-code'),

    manageCandidatesList: document.getElementById('manage-candidates-list'),
    addCandidateForm: document.getElementById('add-candidate-form'),
    addCandidateName: document.getElementById('add-candidate-name'),

    manageTotalVotes: document.getElementById('manage-total-votes'),
    manageRealVoters: document.getElementById('manage-real-voters'),
    btnCheckFraud: document.getElementById('btn-check-fraud'),
    fraudAlertContainer: document.getElementById('fraud-alert-container'),

    btnToggleStatus: document.getElementById('btn-toggle-status'),
    btnDeleteElection: document.getElementById('btn-delete-election'),

    toastContainer: document.getElementById('toast-container')
};

// ==================== UTILS ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
        error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
        warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
        info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    toast.innerHTML = `${icons[type]}<span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API Error');
        return data;
    } catch (error) {
        throw error;
    }
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function switchView(view) {
    state.currentView = view;

    // Toggle main sections
    elements.entryView.classList.toggle('active', view === 'entry');
    elements.entryView.classList.toggle('hidden', view !== 'entry');

    elements.voterView.classList.toggle('active', view === 'voter');
    elements.voterView.classList.toggle('hidden', view !== 'voter');

    // Toggle nav elements
    elements.btnHome.classList.toggle('hidden', view === 'entry');

    if (view === 'entry') {
        if (state.election) {
            sessionStorage.removeItem(`voter_${state.election.id}`);
        }
        state.election = null;

        state.voter = null;
        elements.electionCodeInput.value = '';
        stopPolling();
    }
}

// ==================== VOTER FLOW ====================

async function handleCodeSubmit(e) {
    e.preventDefault();
    const code = elements.electionCodeInput.value.trim().toUpperCase();

    if (!code) return;

    try {
        const data = await apiCall('/api/elections/join', {
            method: 'POST',
            body: JSON.stringify({ code })
        });

        state.election = data.election;

        // Check local storage for previous session
        const storedVoter = sessionStorage.getItem(`voter_${state.election.id}`);

        switchView('voter');
        elements.electionNameDisplay.textContent = state.election.title;
        elements.electionTitleHeader.textContent = state.election.title;

        if (storedVoter) {
            state.voter = JSON.parse(storedVoter);
            showVotingSection();
        } else {
            showRegistrationSection();
        }

    } catch (error) {
        showToast(error.message, 'error');
        elements.electionCodeInput.classList.add('shake');
        setTimeout(() => elements.electionCodeInput.classList.remove('shake'), 500);
    }
}

function showRegistrationSection() {
    elements.registrationSection.classList.remove('hidden');
    elements.votingSection.classList.add('hidden');
    elements.analyticsSection.classList.add('hidden');
    elements.registrationForm.reset();
}

function showVotingSection() {
    elements.registrationSection.classList.add('hidden');
    elements.votingSection.classList.remove('hidden');
    elements.voterGreeting.textContent = `Welcome, ${state.voter.name}`;

    fetchElectionCandidates();
    startPolling(); // Auto-refresh results
}

async function handleVoterRegistration(e) {
    e.preventDefault();

    const name = elements.voterName.value.trim();
    const age = parseInt(elements.voterAge.value);

    try {
        const data = await apiCall(`/api/elections/${state.election.id}/register`, {
            method: 'POST',
            body: JSON.stringify({ name, age })
        });

        state.voter = data.voter;
        sessionStorage.setItem(`voter_${state.election.id}`, JSON.stringify(data.voter));

        showVotingSection();
        showToast('Registration successful', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function fetchElectionCandidates() {
    try {
        const data = await apiCall(`/api/elections/${state.election.id}/candidates`);
        renderCandidateGrid(data.candidates);

        // Also fetch results if available (e.g. current status)
        fetchResults();
    } catch (error) {
        console.error(error);
        showToast('Failed to load candidates', 'error');
    }
}

function renderCandidateGrid(candidates) {
    if (candidates.length === 0) {
        elements.candidateGrid.innerHTML = '';
        elements.noCandidates.classList.remove('hidden');
        return;
    }

    elements.noCandidates.classList.add('hidden');
    elements.candidateGrid.innerHTML = candidates.map(c => `
        <div class="glass-card p-6 hover:translate-y-[-4px] transition-transform">
            <div class="flex items-center gap-4 mb-4">
                <div class="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg" 
                     style="background: ${c.color_code}">
                    ${getInitials(c.name)}
                </div>
                <div>
                    <h3 class="text-xl font-bold text-white">${c.name}</h3>
                    <p class="text-white/50 text-sm">Targeting Excellence</p>
                </div>
            </div>
            <button onclick="castVote(${c.id})" 
                    class="w-full py-3 bg-gradient-to-r from-primary-500 to-accent-600 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-primary-500/30 transition-all flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Vote
            </button>
        </div>
    `).join('');
}

async function castVote(candidateId) {
    if (!state.voter) return;

    try {
        const data = await apiCall(`/api/elections/${state.election.id}/vote`, {
            method: 'POST',
            body: JSON.stringify({
                candidateId,
                voterId: state.voter.id
            })
        });

        showToast('Vote cast successfully!', 'success');

        elements.analyticsSection.classList.remove('hidden');
        elements.votingSection.classList.add('hidden');
        fetchResults();

    } catch (error) {
        showToast(error.message, 'error');
        if (error.message.includes('already voted')) {
            elements.analyticsSection.classList.remove('hidden');
            elements.votingSection.classList.add('hidden');
            fetchResults();
        }
    }
}

async function fetchResults() {
    if (!state.election) return;
    try {
        const data = await apiCall(`/api/elections/${state.election.id}/results`);
        renderResults(data);
    } catch (error) {
        console.error('Failed to fetch results', error);
    }
}

function renderResults(data) {
    if (data.isTie) {
        elements.resultsBanner.innerHTML = `
            <div class="p-4 bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center gap-3">
                <svg class="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span class="text-white font-medium">Tie detected! Runoff vote recommended.</span>
            </div>`;
    } else if (data.leader) {
        elements.resultsBanner.innerHTML = `
            <div class="p-4 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center gap-3">
                <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>
                <span class="text-white font-medium">Current Leader: ${data.leader.name} (${data.leader.percentage}%)</span>
            </div>`;
    } else {
        elements.resultsBanner.innerHTML = '';
    }

    elements.resultsList.innerHTML = data.candidates.map(c => `
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div class="flex items-center gap-3">
                <div class="w-2 h-8 rounded-full" style="background: ${c.color_code}"></div>
                <span class="text-white font-medium">${c.name}</span>
            </div>
            <div class="text-right">
                <span class="text-white font-bold block">${c.votes}</span>
                <span class="text-white/50 text-xs">${c.percentage}%</span>
            </div>
        </div>
    `).join('');

    const ctx = elements.resultsChart.getContext('2d');
    const labels = data.candidates.map(c => c.name);
    const votes = data.candidates.map(c => c.votes);
    const colors = data.candidates.map(c => c.color_code);

    if (state.charts.results) {
        state.charts.results.data.labels = labels;
        state.charts.results.data.datasets[0].data = votes;
        state.charts.results.data.datasets[0].backgroundColor = colors;
        state.charts.results.update();
    } else {
        state.charts.results = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: votes,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}

function startPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(fetchResults, 5000);
}

function stopPolling() {
    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }
}

// ==================== ADMIN DASHBOARD ====================

function openAdminModal() {
    elements.adminModal.classList.remove('hidden');
    elements.adminLogin.classList.remove('hidden');
    elements.adminPanel.classList.add('hidden');
    elements.adminPassword.value = '';
    elements.adminPassword.focus();
}

function closeAdminModal() {
    elements.adminModal.classList.add('hidden');
    elements.manageElectionModal.classList.add('hidden');
    elements.electionFormModal.classList.add('hidden');
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const password = elements.adminPassword.value;

    try {
        await apiCall('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });

        state.isAdmin = true;
        elements.adminLogin.classList.add('hidden');
        elements.adminPanel.classList.remove('hidden');

        loadAdminElections();
        showToast('Welcome back, Admin', 'success');
    } catch (error) {
        showToast('Invalid password', 'error');
        elements.adminPassword.value = '';
    }
}

async function loadAdminElections() {
    try {
        const data = await apiCall('/api/admin/elections');
        state.adminElections = data.elections;
        renderAdminElections();
    } catch (error) {
        showToast('Failed to load elections', 'error');
    }
}

function renderAdminElections() {
    elements.adminElectionsList.innerHTML = state.adminElections.map(e => {
        const statusColors = {
            'draft': 'bg-gray-500/20 text-gray-400',
            'open': 'bg-green-500/20 text-green-400',
            'closed': 'bg-red-500/20 text-red-400'
        };

        return `
            <div class="glass-card p-4 hover:bg-white/5 transition-colors cursor-pointer" onclick="manageElection(${e.id})">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-white text-lg">${e.title}</h4>
                    <span class="px-2 py-1 rounded text-xs font-bold uppercase ${statusColors[e.status]}">${e.status}</span>
                </div>
                <div class="flex items-center gap-4 text-sm text-white/50">
                    <span class="font-mono bg-white/10 px-2 rounded">${e.code}</span>
                    <span>${e.total_votes || 0} Votes</span>
                    <span>${e.candidate_count || 0} Candidates</span>
                </div>
            </div>
        `;
    }).join('');
}

function openCreateElectionModal() {
    elements.electionFormModal.classList.remove('hidden');
    elements.createElectionForm.reset();
}

async function handleCreateElection(e) {
    e.preventDefault();
    console.log('handleCreateElection called'); 

    const title = elements.newElectionTitle.value.trim();
    const description = elements.newElectionDesc.value.trim();
    const candidatesText = elements.newElectionCandidates.value.trim();
    const candidates = candidatesText ? candidatesText.split('\n').map(s => s.trim()).filter(s => s) : [];

    console.log('Form Data:', { title, description, candidates }); // DEBUG

    try {
        console.log('Sending API call...'); 
        await apiCall('/api/admin/elections', {
            method: 'POST',
            body: JSON.stringify({ title, description, candidates })
        });
        console.log('API call successful'); 

        showToast('Election created successfully', 'success');
        elements.electionFormModal.classList.add('hidden');
        loadAdminElections();
    } catch (error) {
        console.error('Create failed:', error); 
        showToast(error.message, 'error');
    }
}

async function manageElection(id) {
    try {
        const electionList = await apiCall('/api/admin/elections');
        const election = electionList.elections.find(e => e.id === id);
        if (!election) return;

        state.managingElection = election;

        elements.manageTitle.textContent = election.title;
        elements.manageCode.textContent = election.code;
        elements.manageTotalVotes.textContent = election.total_votes || 0;
        elements.manageRealVoters.textContent = election.voter_count || 0;

        updateStatusButton(election.status);

        loadManageCandidates(id);

        elements.manageElectionModal.classList.remove('hidden');

    } catch (error) {
        showToast(error.message, 'error');
    }
}

function updateStatusButton(status) {
    const btn = elements.btnToggleStatus;
    if (status === 'draft') {
        btn.textContent = 'Start Election';
        btn.className = 'w-full py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-colors';
        btn.onclick = () => updateElectionStatus('open');
    } else if (status === 'open') {
        btn.textContent = 'Close Election';
        btn.className = 'w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors';
        btn.onclick = () => updateElectionStatus('closed');
    } else {
        btn.textContent = 'Re-open Election';
        btn.className = 'w-full py-2 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors';
        btn.onclick = () => updateElectionStatus('open');
    }
}

async function updateElectionStatus(status) {
    if (!state.managingElection) return;
    try {
        await apiCall(`/api/admin/elections/${state.managingElection.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        showToast(`Election is now ${status}`, 'success');
        manageElection(state.managingElection.id);
        loadAdminElections();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadManageCandidates(electionId) {
    try {
        const data = await apiCall(`/api/elections/${electionId}/candidates`);
        elements.manageCandidatesList.innerHTML = data.candidates.map(c => `
             <div class="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-8 rounded-full" style="background: ${c.color_code}"></div>
                    <span class="text-white">${c.name}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-white/50 text-sm">${c.votes} votes</span>
                    <button onclick="adminSimulateVotes(${c.id})" class="text-primary-400 hover:text-primary-300" title="Simulate Votes">
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    </button>
                    <button onclick="adminDeleteCandidate(${c.id})" class="text-red-400 hover:text-red-300" title="Delete Candidate">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function handleAddCandidate(e) {
    e.preventDefault();
    if (!state.managingElection) return;

    const name = elements.addCandidateName.value.trim();
    if (!name) return;

    try {
        await apiCall(`/api/admin/elections/${state.managingElection.id}/candidates`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        elements.addCandidateName.value = '';
        loadManageCandidates(state.managingElection.id);
        showToast('Candidate added', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function adminDeleteCandidate(id) {
    if (!confirm('Delete this candidate and all their votes?')) return;
    try {
        await apiCall(`/api/admin/candidates/${id}`, { method: 'DELETE' });
        loadManageCandidates(state.managingElection.id);
        showToast('Candidate deleted', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteCurrentElection() {
    if (!state.managingElection) return;
    const confirmCode = state.managingElection.code.substring(0, 4);
    const input = prompt(`To delete "${state.managingElection.title}", type the first 4 chars of its code: ${confirmCode}`);

    if (input !== confirmCode) {
        showToast('Confirmation failed', 'error');
        return;
    }

    try {
        await apiCall(`/api/admin/elections/${state.managingElection.id}`, { method: 'DELETE' });
        showToast('Election deleted', 'success');
        elements.manageElectionModal.classList.add('hidden');
        loadAdminElections();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

window.runFraudDetection = async () => {
    if (!state.managingElection) return;
    try {
        const data = await apiCall(`/api/admin/elections/${state.managingElection.id}/fraud`);
        const susCandidates = data.candidates.filter(c => c.fraud_suspected);

        if (susCandidates.length > 0) {
            elements.fraudAlertContainer.innerHTML = `
                <div class="mt-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                    <p class="text-red-400 font-bold mb-1">Suspicious Activity Detected</p>
                    <ul class="text-sm text-white/70 list-disc list-inside">
                        ${susCandidates.map(c => `<li>${c.name} has more votes than real voters</li>`).join('')}
                    </ul>
                </div>
           `;
        } else {
            elements.fraudAlertContainer.innerHTML = `
                <div class="mt-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                    No fraud detected.
                </div>
           `;
            setTimeout(() => elements.fraudAlertContainer.innerHTML = '', 3000);
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
};

elements.electionCodeForm.addEventListener('submit', handleCodeSubmit);
elements.registrationForm.addEventListener('submit', handleVoterRegistration);
elements.btnHome.addEventListener('click', () => switchView('entry'));
elements.btnRefreshResults.addEventListener('click', fetchResults);

elements.btnAdminLogin.addEventListener('click', openAdminModal);
elements.adminModalClose.addEventListener('click', closeAdminModal);
elements.adminPanelClose.addEventListener('click', closeAdminModal);
elements.adminLoginForm.addEventListener('submit', handleAdminLogin);

elements.btnCreateElectionModal.addEventListener('click', openCreateElectionModal);
elements.btnCancelCreate.addEventListener('click', () => elements.electionFormModal.classList.add('hidden'));
elements.createElectionForm.addEventListener('submit', handleCreateElection);

elements.btnCloseManage.addEventListener('click', () => elements.manageElectionModal.classList.add('hidden'));
elements.addCandidateForm.addEventListener('submit', handleAddCandidate);
elements.btnCheckFraud.addEventListener('click', window.runFraudDetection);
elements.btnDeleteElection.addEventListener('click', deleteCurrentElection);

elements.btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.manageCode.textContent);
    showToast('Code copied to clipboard', 'info');
});

elements.btnRegenCode.addEventListener('click', async () => {
    if (!state.managingElection || !confirm('Regenerate code? The old code will stop working.')) return;
    try {
        const data = await apiCall(`/api/admin/elections/${state.managingElection.id}/regenerate-code`, { method: 'POST' });
        elements.manageCode.textContent = data.code;
        showToast('New code generated', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Init
window.castVote = castVote;
window.adminDeleteCandidate = adminDeleteCandidate;
window.adminSimulateVotes = async (candidateId) => {
    const count = parseInt(prompt('How many fake votes to add? (1-1000)', '10'));
    if (!count || isNaN(count)) return;

    try {
        await apiCall(`/api/admin/elections/${state.managingElection.id}/fake-votes`, {
            method: 'POST',
            body: JSON.stringify({ candidateId, count })
        });
        showToast(`Added ${count} fake votes`, 'success');
        manageElection(state.managingElection.id); // Refresh
    } catch (error) {
        showToast(error.message, 'error');
    }
};

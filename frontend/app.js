const state = {
    currentView: 'voter',
    voter: null,
    hasVoted: false,
    isAdmin: false,
    candidates: [],
    results: null,
    version: null,
    pollInterval: null,
    charts: {
        doughnut: null,
        bar: null
    }
};

const elements = {
    voterView: document.getElementById('voter-view'),
    analyticsView: document.getElementById('analytics-view'),

    btnVoterView: document.getElementById('btn-voter-view'),
    btnAnalyticsView: document.getElementById('btn-analytics-view'),
    btnAdmin: document.getElementById('btn-admin'),

    registrationSection: document.getElementById('registration-section'),
    votingSection: document.getElementById('voting-section'),
    registrationForm: document.getElementById('registration-form'),
    voterName: document.getElementById('voter-name'),
    voterAge: document.getElementById('voter-age'),
    voterGreeting: document.getElementById('voter-greeting'),

    candidateGrid: document.getElementById('candidate-grid'),
    noCandidates: document.getElementById('no-candidates'),

    statusBanner: document.getElementById('status-banner'),
    doughnutChart: document.getElementById('doughnut-chart'),
    barChart: document.getElementById('bar-chart'),
    totalVotesCenter: document.getElementById('total-votes-center'),
    leaderboardBody: document.getElementById('leaderboard-body'),

    adminModal: document.getElementById('admin-modal'),
    adminModalBackdrop: document.getElementById('admin-modal-backdrop'),
    adminModalClose: document.getElementById('admin-modal-close'),
    adminLogin: document.getElementById('admin-login'),
    adminPanel: document.getElementById('admin-panel'),
    adminLoginForm: document.getElementById('admin-login-form'),
    adminPassword: document.getElementById('admin-password'),
    adminPanelClose: document.getElementById('admin-panel-close'),

    btnNewElection: document.getElementById('btn-new-election'),
    btnEndElection: document.getElementById('btn-end-election'),
    btnReset: document.getElementById('btn-reset'),
    btnDetectFraud: document.getElementById('btn-detect-fraud'),
    newElectionForm: document.getElementById('new-election-form'),
    newElectionName: document.getElementById('new-election-name'),
    newElectionCandidates: document.getElementById('new-election-candidates'),
    btnCreateElection: document.getElementById('btn-create-election'),
    btnCancelElection: document.getElementById('btn-cancel-election'),

    fakeVoteCandidate: document.getElementById('fake-vote-candidate'),
    fakeVoteCount: document.getElementById('fake-vote-count'),
    fakeVoteCountDisplay: document.getElementById('fake-vote-count-display'),
    btnInjectVotes: document.getElementById('btn-inject-votes'),

    fraudTableSection: document.getElementById('fraud-table-section'),
    fraudTableBody: document.getElementById('fraud-table-body'),
    noFraudData: document.getElementById('no-fraud-data'),

    toastContainer: document.getElementById('toast-container'),

    electionTitle: document.getElementById('election-title'),

    // Admin Tabs
    adminTabs: document.querySelectorAll('.admin-tab'),
    tabElection: document.getElementById('tab-election'),
    tabCandidates: document.getElementById('tab-candidates'),
    tabMonitoring: document.getElementById('tab-monitoring'),
    tabTesting: document.getElementById('tab-testing'),
    testingTabBtn: document.getElementById('testing-tab-btn'),

    // Quick Stats
    statTotalVotes: document.getElementById('stat-total-votes'),
    statTotalVoters: document.getElementById('stat-total-voters'),
    statLeader: document.getElementById('stat-leader'),
    statStatus: document.getElementById('stat-status'),

    // Candidate Management
    candidatesList: document.getElementById('candidates-list'),
    btnAddCandidate: document.getElementById('btn-add-candidate'),
    addCandidateForm: document.getElementById('add-candidate-form'),
    newCandidateName: document.getElementById('new-candidate-name'),
    btnConfirmAddCandidate: document.getElementById('btn-confirm-add-candidate'),
    btnCancelAddCandidate: document.getElementById('btn-cancel-add-candidate')
};

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

        if (!response.ok) {
            throw new Error(data.error || 'API Error');
        }

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

    elements.btnVoterView.classList.toggle('active', view === 'voter');
    elements.btnAnalyticsView.classList.toggle('active', view === 'analytics');

    elements.voterView.classList.toggle('active', view === 'voter');
    elements.voterView.classList.toggle('hidden', view !== 'voter');
    elements.analyticsView.classList.toggle('active', view === 'analytics');
    elements.analyticsView.classList.toggle('hidden', view !== 'analytics');

    if (view === 'analytics') {
        fetchResults();
    }
}

async function handleRegistration(e) {
    e.preventDefault();

    const name = elements.voterName.value.trim();
    const age = parseInt(elements.voterAge.value);

    try {
        const data = await apiCall('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, age })
        });

        state.voter = data.voter;
        sessionStorage.setItem('voter', JSON.stringify(data.voter));

        showToast(data.message, 'success');
        showVotingSection();
        fetchCandidates();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showVotingSection() {
    elements.registrationSection.classList.add('hidden');
    elements.votingSection.classList.remove('hidden');
    elements.voterGreeting.textContent = `Welcome, ${state.voter.name}! Select a candidate to cast your vote.`;
}

function showRegistrationSection() {
    elements.registrationSection.classList.remove('hidden');
    elements.votingSection.classList.add('hidden');
    elements.registrationForm.reset();
    state.voter = null;
    state.hasVoted = false;
    sessionStorage.removeItem('voter');
    sessionStorage.removeItem('hasVoted');
}

async function fetchCandidates() {
    try {
        const data = await apiCall('/api/candidates');
        state.candidates = data.candidates;
        renderCandidates();
        updateFakeVoteCandidateSelect();
    } catch (error) {
        showToast('Failed to load candidates', 'error');
    }
}

function renderCandidates() {
    if (state.candidates.length === 0) {
        elements.candidateGrid.innerHTML = '';
        elements.noCandidates.classList.remove('hidden');
        return;
    }

    elements.noCandidates.classList.add('hidden');

    elements.candidateGrid.innerHTML = state.candidates.map(candidate => `
        <div class="candidate-card glass-card p-6">
            <div class="flex items-center gap-4 mb-4">
                <div class="candidate-avatar" style="background: ${candidate.color_code}">
                    ${getInitials(candidate.name)}
                </div>
                <div>
                    <h3 class="text-xl font-bold text-white">${candidate.name}</h3>
                    <p class="text-white/50 text-sm">Candidate #${candidate.id}</p>
                </div>
            </div>
            
            <p class="text-white/60 text-sm mb-6 line-clamp-3">
                Committed to bringing positive change and representing the voice of the people with integrity and dedication.
            </p>
            
            <button 
                class="vote-btn bg-gradient-to-r from-primary-500 to-accent-600 text-white hover:shadow-lg hover:shadow-primary-500/30"
                onclick="castVote(${candidate.id})"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Vote for ${candidate.name}
            </button>
        </div>
    `).join('');
}

async function castVote(candidateId) {
    const button = event.currentTarget;
    const originalContent = button.innerHTML;

    button.disabled = true;
    button.innerHTML = '<div class="spinner"></div><span>Casting Vote...</span>';

    try {
        const data = await apiCall('/api/vote', {
            method: 'POST',
            body: JSON.stringify({
                candidateId,
                voterId: state.voter?.id
            })
        });

        showToast(`Vote cast for ${data.candidate.name}!`, 'success');

        if (data.isTie) {
            showToast('Election status: Deadlock detected!', 'warning');
        }

        // Clear voter session and prompt for new voter after successful vote
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = originalContent;
            showRegistrationSection();
            showToast('Please enter new voter information', 'info');
        }, 1000);

    } catch (error) {
        button.disabled = false;
        button.innerHTML = originalContent;
        showToast(error.message, 'error');
    }
}

async function fetchResults() {
    try {
        const data = await apiCall('/api/results');

        if (state.version !== null && data.version !== state.version) {
            showToast('Election has been reset. Reloading...', 'info');
            setTimeout(() => {
                sessionStorage.clear();
                location.reload();
            }, 1500);
            return;
        }

        state.version = data.version;
        state.results = data;

        renderStatusBanner(data);
        renderCharts(data);
        renderLeaderboard(data);
    } catch (error) {
        console.error('Failed to fetch results:', error);
    }
}

function renderStatusBanner(data) {
    if (data.totalVotes === 0) {
        elements.statusBanner.innerHTML = `
            <div class="status-banner bg-white/5 border border-white/10">
                <svg class="w-8 h-8 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div>
                    <h3 class="text-lg font-semibold text-white">Waiting for Votes</h3>
                    <p class="text-white/50 text-sm">No votes have been cast yet</p>
                </div>
            </div>
        `;
        return;
    }

    if (data.isTie) {
        const tiedNames = data.tiedCandidates.map(c => c.name).join(' & ');
        elements.statusBanner.innerHTML = `
            <div class="status-banner status-banner-tie">
                <svg class="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <div>
                    <h3 class="text-lg font-semibold text-amber-400">âš¡ Deadlock / Runoff Required</h3>
                    <p class="text-white/70 text-sm">${tiedNames} are tied with ${data.tiedCandidates[0].votes} votes each</p>
                </div>
            </div>
        `;
    } else if (data.leader) {
        elements.statusBanner.innerHTML = `
            <div class="status-banner status-banner-winner">
                <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                <div>
                    <h3 class="text-lg font-semibold text-green-400">ðŸ† Current Leader: ${data.leader.name}</h3>
                    <p class="text-white/70 text-sm">${data.leader.votes} votes (${data.leader.percentage}%)</p>
                </div>
            </div>
        `;
    }
}

function renderCharts(data) {
    const labels = data.candidates.map(c => c.name);
    const votes = data.candidates.map(c => c.votes);
    const colors = data.candidates.map(c => c.color_code);

    elements.totalVotesCenter.innerHTML = `
        <span class="text-4xl font-bold text-white">${data.totalVotes}</span>
        <span class="text-white/60 text-sm">Total Votes</span>
    `;

    if (state.charts.doughnut) {
        state.charts.doughnut.data.labels = labels;
        state.charts.doughnut.data.datasets[0].data = votes;
        state.charts.doughnut.data.datasets[0].backgroundColor = colors;
        state.charts.doughnut.update('active');
    } else {
        state.charts.doughnut = new Chart(elements.doughnutChart, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: votes,
                    backgroundColor: colors,
                    borderColor: 'rgba(15, 23, 42, 0.8)',
                    borderWidth: 3,
                    hoverBorderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: 'rgba(255, 255, 255, 0.7)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                                return ` ${context.raw} votes (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true
                }
            }
        });
    }

    if (state.charts.bar) {
        state.charts.bar.data.labels = labels;
        state.charts.bar.data.datasets[0].data = votes;
        state.charts.bar.data.datasets[0].backgroundColor = colors;
        state.charts.bar.update('active');
    } else {
        state.charts.bar = new Chart(elements.barChart, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Votes',
                    data: votes,
                    backgroundColor: colors,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: 'rgba(255, 255, 255, 0.7)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            stepSize: 1
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                weight: '500'
                            }
                        }
                    }
                },
                animation: {
                    duration: 500
                }
            }
        });
    }
}

function renderLeaderboard(data) {
    if (data.candidates.length === 0) {
        elements.leaderboardBody.innerHTML = `
            <tr>
                <td colspan="4" class="py-8 text-center text-white/50">No candidates registered</td>
            </tr>
        `;
        return;
    }

    elements.leaderboardBody.innerHTML = data.candidates.map((candidate, index) => `
        <tr class="leaderboard-row ${index === 0 ? 'top-1' : ''} ${candidate.fraud_suspected ? 'fraud' : ''}">
            <td class="py-4 pr-4">
                <div class="rank-badge">${index + 1}</div>
            </td>
            <td class="py-4 pr-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style="background: ${candidate.color_code}">
                        ${getInitials(candidate.name)}
                    </div>
                    <span class="text-white font-medium">${candidate.name}</span>
                    ${candidate.fraud_suspected ? '<span class="fraud-indicator"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>Fraud</span>' : ''}
                </div>
            </td>
            <td class="py-4 pr-4 text-right">
                <span class="text-white font-semibold">${candidate.votes}</span>
            </td>
            <td class="py-4 text-right">
                <span class="text-white/70">${candidate.percentage}%</span>
            </td>
        </tr>
    `).join('');
}

function startPolling() {
    if (state.pollInterval) return;

    state.pollInterval = setInterval(() => {
        if (state.currentView === 'analytics') {
            fetchResults();
        }
        fetchStatus();
    }, 3000);
}

function stopPolling() {
    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }
}

async function fetchStatus() {
    try {
        const data = await apiCall('/api/status');
        elements.electionTitle.textContent = data.electionName || 'Voting System';

        if (state.version !== null && data.version !== state.version) {
            showToast('Election has been reset. Reloading...', 'info');
            setTimeout(() => {
                sessionStorage.clear();
                location.reload();
            }, 1500);
        }
    } catch (error) {
        console.error('Failed to fetch status:', error);
    }
}

function openAdminModal() {
    elements.adminModal.classList.remove('hidden');
    elements.adminLogin.classList.remove('hidden');
    elements.adminPanel.classList.add('hidden');
    elements.adminPassword.value = '';
    elements.adminPassword.focus();
}

function closeAdminModal() {
    elements.adminModal.classList.add('hidden');
    state.isAdmin = false;
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

        fetchCandidates();
        updateQuickStats();
        showToast('Admin access granted', 'success');
    } catch (error) {
        showToast(error.message, 'error');
        elements.adminPassword.value = '';
    }
}

function toggleNewElectionForm(show) {
    elements.newElectionForm.classList.toggle('hidden', !show);
}

async function createNewElection() {
    const electionName = elements.newElectionName.value.trim();
    const candidatesText = elements.newElectionCandidates.value.trim();

    if (!electionName) {
        showToast('Please enter an election name', 'error');
        return;
    }

    const candidates = candidatesText.split('\n').map(c => c.trim()).filter(c => c);

    if (candidates.length < 2) {
        showToast('Please add at least 2 candidates', 'error');
        return;
    }

    try {
        await apiCall('/api/admin/reset', {
            method: 'POST',
            body: JSON.stringify({ electionName, candidates })
        });

        showToast('New election created!', 'success');
        toggleNewElectionForm(false);
        elements.newElectionName.value = '';
        elements.newElectionCandidates.value = '';
        fetchCandidates();
        fetchStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function resetElection() {
    if (!confirm('Are you sure you want to reset the election? This will delete all votes and candidates.')) {
        return;
    }

    try {
        await apiCall('/api/admin/reset', {
            method: 'POST',
            body: JSON.stringify({})
        });

        showToast('Election reset successfully', 'success');
        fetchCandidates();
        fetchStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function detectFraud() {
    try {
        const data = await apiCall('/api/admin/fraud');

        elements.fraudTableSection.classList.remove('hidden');

        elements.fraudTableBody.innerHTML = data.candidates.map(candidate => `
            <tr class="${candidate.fraud_suspected ? 'bg-red-500/10' : ''}">
                <td class="py-3 pr-4">
                    <div class="flex items-center gap-2">
                        <span class="text-white">${candidate.name}</span>
                        ${candidate.fraud_suspected ? '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' : ''}
                    </div>
                </td>
                <td class="py-3 pr-4 text-right text-white">${candidate.votes}</td>
                <td class="py-3 pr-4 text-right text-white">${data.realVoterCount}</td>
                <td class="py-3 pr-4 text-right">
                    ${candidate.fraud_suspected ?
                '<span class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm">Fraudulent</span>' :
                '<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">Clean</span>'
            }
                </td>
                <td class="py-3 text-right">
                    ${candidate.fraud_suspected ?
                `<button onclick="banCandidate(${candidate.id})" class="px-3 py-1 bg-red-500 hover:bg-red-400 text-white text-sm rounded transition-colors">Ban</button>` :
                '-'
            }
                </td>
            </tr>
        `).join('');

        showToast(`Fraud check complete. ${data.candidates.filter(c => c.fraud_suspected).length} suspicious candidates found.`, data.candidates.some(c => c.fraud_suspected) ? 'warning' : 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function banCandidate(id) {
    if (!confirm('Are you sure you want to ban this candidate?')) {
        return;
    }

    try {
        await apiCall(`/api/admin/ban/${id}`, {
            method: 'DELETE'
        });

        showToast('Candidate banned successfully', 'success');
        fetchCandidates();
        detectFraud();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function updateFakeVoteCandidateSelect() {
    elements.fakeVoteCandidate.innerHTML = state.candidates.length === 0 ?
        '<option value="">No candidates</option>' :
        state.candidates.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function injectFakeVotes() {
    const candidateId = parseInt(elements.fakeVoteCandidate.value);
    const count = parseInt(elements.fakeVoteCount.value);

    if (!candidateId) {
        showToast('Please select a candidate', 'error');
        return;
    }

    try {
        const data = await apiCall('/api/admin/fake-votes', {
            method: 'POST',
            body: JSON.stringify({ candidateId, count })
        });

        showToast(`Injected ${count} fake votes`, 'warning');
        fetchCandidates();

        if (data.isTie) {
            showToast('Tie detected!', 'warning');
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function endElection() {
    if (!confirm('Are you sure you want to end the election? Voting will be closed and final results displayed.')) {
        return;
    }

    try {
        const data = await apiCall('/api/admin/end-election', {
            method: 'POST'
        });

        showToast('Election ended successfully!', 'success');
        closeAdminModal();

        showFinalResults(data);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showFinalResults(data) {
    const modal = document.createElement('div');
    modal.id = 'final-results-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="text-center mb-8">
                <div class="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                    <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <h2 class="text-3xl font-bold text-white mb-2">ðŸ† Final Results</h2>
                <p class="text-white/60">${data.electionName || 'Election'} - Voting Closed</p>
            </div>
            
            ${data.isTie ? `
                <div class="mb-6 p-4 bg-amber-500/20 border border-amber-500/30 rounded-xl text-center">
                    <p class="text-amber-400 font-semibold">âš¡ Tie Detected - Runoff Required</p>
                    <p class="text-white/70 text-sm mt-1">${data.tiedCandidates.map(c => c.name).join(' & ')} are tied</p>
                </div>
            ` : data.leader ? `
                <div class="mb-6 p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl text-center">
                    <p class="text-green-400 text-sm font-medium mb-2">WINNER</p>
                    <p class="text-3xl font-bold text-white">${data.leader.name}</p>
                    <p class="text-white/70 mt-2">${data.leader.votes} votes (${data.leader.percentage}%)</p>
                </div>
            ` : ''}
            
            <div class="space-y-3 mb-8">
                <h3 class="text-lg font-semibold text-white">All Results</h3>
                ${data.candidates.map((c, i) => `
                    <div class="flex items-center justify-between p-4 rounded-xl ${i === 0 ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30' : 'bg-white/5'}">                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style="background: ${c.color_code}">
                                ${i + 1}
                            </div>
                            <span class="text-white font-medium">${c.name}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-white font-bold">${c.votes}</span>
                            <span class="text-white/50 ml-2">(${c.percentage}%)</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="text-center">
                <p class="text-white/50 text-sm mb-4">Total Votes: ${data.totalVotes}</p>
                <button onclick="closeFinalResults()" class="px-8 py-3 bg-gradient-to-r from-primary-500 to-accent-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeFinalResults() {
    const modal = document.getElementById('final-results-modal');
    if (modal) modal.remove();
}

function switchAdminTab(tabName) {
    elements.adminTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const tabs = ['election', 'candidates', 'monitoring', 'testing'];
    tabs.forEach(tab => {
        const content = document.getElementById(`tab-${tab}`);
        if (content) {
            content.classList.toggle('hidden', tab !== tabName);
            content.classList.toggle('active', tab === tabName);
        }
    });

    if (tabName === 'candidates') {
        renderCandidatesList();
    }
}

async function updateQuickStats() {
    try {
        const data = await apiCall('/api/results');

        elements.statTotalVotes.textContent = data.totalVotes || 0;
        elements.statTotalVoters.textContent = data.totalVotes || 0; // Using votes as proxy

        if (data.isTie && data.tiedCandidates?.length > 0) {
            elements.statLeader.textContent = 'Tie!';
        } else if (data.leader) {
            elements.statLeader.textContent = data.leader.name;
        } else {
            elements.statLeader.textContent = '--';
        }

        const status = await apiCall('/api/status');
        elements.statStatus.textContent = status.electionStatus || 'Active';
    } catch (error) {
        console.error('Failed to update quick stats:', error);
    }
}

function renderCandidatesList() {
    if (!elements.candidatesList) return;

    if (state.candidates.length === 0) {
        elements.candidatesList.innerHTML = `
            <div class="text-center py-8 text-white/50">
                <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                <p>No candidates registered</p>
            </div>
        `;
        return;
    }

    elements.candidatesList.innerHTML = state.candidates.map(candidate => `
        <div class="candidate-list-item">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold" style="background: ${candidate.color_code}">
                    ${getInitials(candidate.name)}
                </div>
                <div>
                    <p class="text-white font-medium">${candidate.name}</p>
                    <p class="text-white/50 text-sm">${candidate.votes || 0} votes</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="deleteCandidate(${candidate.id})" class="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title="Delete candidate">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function addCandidate() {
    const name = elements.newCandidateName?.value?.trim();

    if (!name) {
        showToast('Please enter a candidate name', 'error');
        return;
    }

    try {
        await apiCall('/api/admin/candidates', {
            method: 'POST',
            body: JSON.stringify({ name })
        });

        showToast(`Candidate "${name}" added!`, 'success');
        elements.newCandidateName.value = '';
        toggleAddCandidateForm(false);
        await fetchCandidates();
        renderCandidatesList();
        updateQuickStats();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteCandidate(id) {
    if (!confirm('Are you sure you want to delete this candidate? This will also remove all their votes.')) {
        return;
    }

    try {
        await apiCall(`/api/admin/ban/${id}`, {
            method: 'DELETE'
        });

        showToast('Candidate deleted', 'success');
        await fetchCandidates();
        renderCandidatesList();
        updateQuickStats();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function toggleAddCandidateForm(show) {
    if (elements.addCandidateForm) {
        elements.addCandidateForm.classList.toggle('hidden', !show);
        if (show && elements.newCandidateName) {
            elements.newCandidateName.focus();
        }
    }
}

function setupTestingTabToggle() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            if (elements.testingTabBtn) {
                const isHidden = elements.testingTabBtn.classList.contains('hidden');
                elements.testingTabBtn.classList.toggle('hidden', !isHidden);
                showToast(isHidden ? 'Testing mode enabled' : 'Testing mode disabled', 'info');
            }
        }
    });
}

elements.btnVoterView.addEventListener('click', () => switchView('voter'));
elements.btnAnalyticsView.addEventListener('click', () => switchView('analytics'));
elements.btnAdmin.addEventListener('click', openAdminModal);

elements.registrationForm.addEventListener('submit', handleRegistration);

elements.adminModalBackdrop.addEventListener('click', closeAdminModal);
elements.adminModalClose.addEventListener('click', closeAdminModal);
elements.adminPanelClose.addEventListener('click', closeAdminModal);
elements.adminLoginForm.addEventListener('submit', handleAdminLogin);

elements.btnNewElection.addEventListener('click', () => toggleNewElectionForm(true));
elements.btnCancelElection.addEventListener('click', () => toggleNewElectionForm(false));
elements.btnCreateElection.addEventListener('click', createNewElection);
elements.btnEndElection.addEventListener('click', endElection);
elements.btnReset.addEventListener('click', resetElection);
elements.btnDetectFraud.addEventListener('click', () => {
    detectFraud();
    if (elements.noFraudData) {
        elements.noFraudData.classList.add('hidden');
    }
});

elements.fakeVoteCount?.addEventListener('input', (e) => {
    if (elements.fakeVoteCountDisplay) {
        elements.fakeVoteCountDisplay.textContent = e.target.value;
    }
});
elements.btnInjectVotes?.addEventListener('click', injectFakeVotes);

elements.adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchAdminTab(tab.dataset.tab);
    });
});

elements.btnAddCandidate?.addEventListener('click', () => toggleAddCandidateForm(true));
elements.btnCancelAddCandidate?.addEventListener('click', () => toggleAddCandidateForm(false));
elements.btnConfirmAddCandidate?.addEventListener('click', addCandidate);

elements.newCandidateName?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addCandidate();
    }
});

async function init() {
    const savedVoter = sessionStorage.getItem('voter');
    if (savedVoter) {
        state.voter = JSON.parse(savedVoter);
        showVotingSection();
    }

    await fetchStatus();
    await fetchCandidates();

    setupTestingTabToggle();

    startPolling();
}

window.castVote = castVote;
window.banCandidate = banCandidate;
window.closeFinalResults = closeFinalResults;
window.deleteCandidate = deleteCandidate;

init();

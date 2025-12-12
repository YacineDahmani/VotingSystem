const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

db.initializeDatabase().then(() => {
    console.log('Database initialized');
}).catch(err => {
    console.error('Database initialization error:', err);
});

// ==================== PUBLIC ENDPOINTS ====================

app.get('/api/status', async (req, res) => {
    try {
        res.json({
            status: 'online',
            system: 'VotingSystem v2.0'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Join election via code
app.post('/api/elections/join', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Election code is required' });

        const election = await db.getElectionByCode(code);

        if (!election) {
            return res.status(404).json({ error: 'Election not found. Please check the code.' });
        }

        if (election.status === 'closed') {
            return res.status(403).json({ error: 'This election is closed.' });
        }

        if (election.status === 'draft') {
            return res.status(403).json({ error: 'This election has not started yet.' });
        }

        res.json({ success: true, election });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get candidates for an election
app.get('/api/elections/:id/candidates', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const candidates = await db.getCandidatesByElection(electionId);
        res.json({ candidates });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register voter for an election (check age/name)
app.post('/api/elections/:id/register', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const { name, age } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (!age || typeof age !== 'number' || age < 18) {
            return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
        }

        // We don't check for existing voter name here to allow same names,
        // duplicate prevention is done via session/local storage on client 
        // and per-session voting. In a real system, we'd have auth.
        // The unique constraint in DB is (election_id, voter_id), 
        // so we just return success and let client handle the voting step.

        // Just create a voter record for this session
        const voter = await db.addVoter(electionId, name.trim(), age, false);

        res.json({
            success: true,
            voter,
            message: 'Registration successful'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cast vote
app.post('/api/elections/:id/vote', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const { candidateId, voterId } = req.body;

        if (!candidateId || !voterId) {
            return res.status(400).json({ error: 'Missing candidate or voter ID' });
        }

        const candidate = await db.getCandidateById(candidateId);
        if (!candidate || candidate.election_id !== electionId) {
            return res.status(400).json({ error: 'Invalid candidate for this election' });
        }

        await db.recordVote(electionId, voterId, candidateId);

        const results = await db.getElectionResults(electionId);

        res.json({
            success: true,
            message: `Vote cast for ${candidate.name}`,
            isTie: results.isTie
        });
    } catch (err) {
        res.status(400).json({ error: err.message }); // 400 for duplicate vote
    }
});

// Get results (public, but frontend may restrict visibility)
app.get('/api/elections/:id/results', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const results = await db.getElectionResults(electionId);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const adminPassword = await db.getSetting('admin_password');

        if (password === adminPassword) {
            res.json({ success: true, message: 'Admin authenticated' });
        } else {
            res.status(401).json({ error: 'Wrong password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all elections
app.get('/api/admin/elections', async (req, res) => {
    try {
        const elections = await db.getAllElections();

        // Enhance with stats
        const electionsWithStats = await Promise.all(elections.map(async (e) => {
            const stats = await db.getElectionStats(e.id);
            return { ...e, ...stats };
        }));

        res.json({ elections: electionsWithStats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create election
app.post('/api/admin/elections', async (req, res) => {
    try {
        const { title, description, candidates } = req.body;

        if (!title) return res.status(400).json({ error: 'Election title is required' });

        const election = await db.createElection(title, description);

        // Add initial candidates if provided
        if (candidates && Array.isArray(candidates)) {
            for (const name of candidates) {
                if (name && name.trim()) {
                    await db.addCandidateToElection(election.id, name.trim());
                }
            }
        }

        res.json({ success: true, election });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update election details
app.put('/api/admin/elections/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;

        await db.updateElection(id, updates);
        const election = await db.getElectionById(id);

        res.json({ success: true, election });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update election status
app.patch('/api/admin/elections/:id/status', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        await db.updateElectionStatus(id, status);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Regenerate code
app.post('/api/admin/elections/:id/regenerate-code', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const newCode = await db.regenerateElectionCode(id);
        res.json({ success: true, code: newCode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete election
app.delete('/api/admin/elections/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.deleteElection(id);
        res.json({ success: true, message: 'Election deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add candidate to election
app.post('/api/admin/elections/:id/candidates', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const { name } = req.body;

        if (!name) return res.status(400).json({ error: 'Candidate name is required' });

        const candidate = await db.addCandidateToElection(electionId, name);
        res.json({ success: true, candidate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete candidate
app.delete('/api/admin/candidates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.deleteCandidate(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inject fake votes (testing/demo)
app.post('/api/admin/elections/:id/fake-votes', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const { candidateId, count } = req.body;

        await db.addFakeVotes(electionId, candidateId, count);
        const results = await db.getElectionResults(electionId);

        res.json({ success: true, ...results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fraud detection
app.get('/api/admin/elections/:id/fraud', async (req, res) => {
    try {
        const electionId = parseInt(req.params.id);
        const data = await db.detectFraud(electionId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`🗳️  Voting System running at http://localhost:${PORT}`);
    console.log(`Prepared for multiple elections.`);
});

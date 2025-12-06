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


app.get('/api/status', async (req, res) => {
    try {
        const [electionName, electionStatus, isTie, version] = await Promise.all([
            db.getSetting('election_name'),
            db.getSetting('election_status'),
            db.getSetting('is_tie'),
            db.getSetting('version')
        ]);

        res.json({
            electionName,
            electionStatus,
            isTie: isTie === 'true',
            version: parseInt(version) || 1
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, age } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (!age || typeof age !== 'number' || age < 18) {
            return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
        }

        const voter = await db.addVoter(name.trim(), age, false);
        res.json({
            success: true,
            voter,
            message: 'Age verified! You can vote'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/candidates', async (req, res) => {
    try {
        const candidates = await db.getAllCandidates();
        res.json({ candidates });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vote', async (req, res) => {
    try {
        const { candidateId, voterId } = req.body;

        if (!candidateId) {
            return res.status(400).json({ error: 'Candidate ID is required' });
        }

        const candidate = await db.getCandidateById(candidateId);
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        await db.incrementVote(candidateId);

        const tieResult = await db.checkForTie();
        const updatedCandidate = await db.getCandidateById(candidateId);

        res.json({
            success: true,
            message: `Vote cast for ${candidate.name}`,
            candidate: updatedCandidate,
            ...tieResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/results', async (req, res) => {
    try {
        const candidates = await db.getAllCandidates();
        const tieResult = await db.checkForTie();
        const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
        const version = await db.getSetting('version');

        const resultsWithPercentages = candidates.map(c => ({
            ...c,
            percentage: totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : 0
        }));

        res.json({
            candidates: resultsWithPercentages,
            totalVotes,
            version: parseInt(version) || 1,
            ...tieResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


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

app.post('/api/admin/reset', async (req, res) => {
    try {
        const { electionName, candidates } = req.body;

        await db.resetElection();

        if (electionName) {
            await db.setSetting('election_name', electionName);
        }

        if (candidates && Array.isArray(candidates)) {
            for (const name of candidates) {
                await db.addCandidate(name);
            }
        }

        const version = await db.getSetting('version');

        res.json({
            success: true,
            message: 'Election reset successfully',
            version: parseInt(version)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/ban/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const candidate = await db.getCandidateById(parseInt(id));

        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        await db.deleteCandidate(parseInt(id));

        res.json({
            success: true,
            message: `Candidate ${candidate.name} has been banned`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/fake-votes', async (req, res) => {
    try {
        const { candidateId, count } = req.body;

        if (!candidateId || !count || count < 1 || count > 100) {
            return res.status(400).json({ error: 'Invalid candidate ID or vote count (1-100)' });
        }

        const result = await db.addFakeVotes(candidateId, count);
        const updatedCandidate = await db.getCandidateById(candidateId);
        const tieResult = await db.checkForTie();

        res.json({
            success: true,
            message: `Added ${count} fake votes`,
            candidate: updatedCandidate,
            ...tieResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/fraud', async (req, res) => {
    try {
        const fraudData = await db.detectFraud();
        res.json(fraudData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/candidates', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Candidate name is required' });
        }

        const candidate = await db.addCandidate(name.trim());
        res.json({
            success: true,
            candidate
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/settings', async (req, res) => {
    try {
        const { electionName, electionStatus } = req.body;

        if (electionName) {
            await db.setSetting('election_name', electionName);
        }

        if (electionStatus && ['OPEN', 'CLOSED', 'PAUSED'].includes(electionStatus)) {
            await db.setSetting('election_status', electionStatus);
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/end-election', async (req, res) => {
    try {
        await db.setSetting('election_status', 'CLOSED');

        const candidates = await db.getAllCandidates();
        const tieResult = await db.checkForTie();
        const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
        const electionName = await db.getSetting('election_name');

        const resultsWithPercentages = candidates.map(c => ({
            ...c,
            percentage: totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : '0.0'
        }));

        res.json({
            success: true,
            message: 'Election ended successfully',
            electionName,
            candidates: resultsWithPercentages,
            totalVotes,
            ...tieResult,
            electionStatus: 'CLOSED'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🗳️  Voting System running at http://localhost:${PORT}`);
});

const express = require('express');

function createPublicRoutes({ db, ensureDefaultElection, issueAuthToken, requireVoterAuth, emitElectionUpdate, adminMasterKey }) {
    const router = express.Router();

    router.get('/status', async (req, res) => {
        try {
            res.json({
                status: 'online',
                system: 'VotingSystem v2.0',
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/active', async (req, res) => {
        try {
            let election = await db.getActiveElection();
            if (!election) {
                election = await ensureDefaultElection(db);
            }

            const candidates = await db.getCandidatesByElection(election.id);
            const totalVotes = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);

            res.json({ election, candidates, totalVotes });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/session/identity', async (req, res) => {
        try {
            const { name, age, code } = req.body;
            const normalizedCode = typeof code === 'string' ? code.trim() : '';

            if (!normalizedCode) {
                return res.status(400).json({ error: 'Unique code is required' });
            }

            if (normalizedCode === adminMasterKey) {
                const token = issueAuthToken({ role: 'admin' });
                return res.json({ role: 'admin', success: true, token });
            }

            if (!name || typeof name !== 'string' || name.trim().length < 2) {
                return res.status(400).json({ error: 'Name is required' });
            }

            if (!age || typeof age !== 'number' || age < 18) {
                return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
            }

            const election = await db.getActiveElection();
            if (!election) {
                return res.status(403).json({ error: 'No active election is currently open' });
            }

            const voter = await db.addVoter(election.id, name.trim(), age, normalizedCode, false);
            const token = issueAuthToken({
                role: 'voter',
                voterId: voter.id,
                electionId: election.id,
            });

            return res.json({
                role: 'voter',
                success: true,
                election,
                voter,
                token,
            });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    });

    router.post('/elections/join', async (req, res) => {
        try {
            const { code } = req.body;
            if (!code) {
                return res.status(400).json({ error: 'Election code is required' });
            }

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

            return res.json({ success: true, election });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/candidates', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const candidates = await db.getCandidatesByElection(electionId);
            res.json({ candidates });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/register', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const { name, age, identifier } = req.body;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({ error: 'Name is required' });
            }

            if (!age || typeof age !== 'number' || age < 18) {
                return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
            }

            if (!identifier || typeof identifier !== 'string') {
                return res.status(400).json({ error: 'Voter ID is required' });
            }

            const voter = await db.addVoter(electionId, name.trim(), age, identifier.trim(), false);

            return res.json({
                success: true,
                voter,
                message: 'Registration successful',
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/vote', requireVoterAuth, async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const { candidateId } = req.body;
            const voterId = Number.parseInt(req.auth?.voterId, 10);
            const tokenElectionId = Number.parseInt(req.auth?.electionId, 10);

            if (!candidateId || Number.isNaN(voterId) || Number.isNaN(tokenElectionId)) {
                return res.status(400).json({ error: 'Missing candidate or voter credentials' });
            }

            if (tokenElectionId !== electionId) {
                return res.status(403).json({ error: 'Election mismatch for this voter session' });
            }

            const candidate = await db.getCandidateById(candidateId);
            if (!candidate || candidate.election_id !== electionId) {
                return res.status(400).json({ error: 'Invalid candidate for this election' });
            }

            const voter = await db.getVoterByIdAndElection(voterId, electionId);
            if (!voter || voter.is_fake) {
                return res.status(403).json({ error: 'Invalid voter identity for this election' });
            }

            const election = await db.getElectionById(electionId);
            if (election.status !== 'open') {
                return res.status(403).json({ error: 'Election is not open' });
            }

            const now = new Date();
            if (election.start_date && now < new Date(election.start_date)) {
                return res.status(403).json({ error: 'Election has not started yet' });
            }
            if (election.end_date && now > new Date(election.end_date)) {
                return res.status(403).json({ error: 'Election has ended' });
            }

            await db.recordVote(electionId, voterId, candidateId);
            const results = await emitElectionUpdate(electionId, 'vote:kick');

            return res.json({
                success: true,
                message: `Vote cast for ${candidate.name}`,
                isTie: results.isTie,
                totalVotes: results.totalVotes,
            });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    });

    router.get('/elections/:id/results', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const results = await db.getElectionResults(electionId);

            if (results?.election?.status === 'closed' && results?.isTie) {
                const activeElection = await db.getActiveElection();
                if (activeElection && activeElection.id !== electionId) {
                    results.runoffElection = activeElection;
                }
            }

            return res.json(results);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = {
    createPublicRoutes,
};

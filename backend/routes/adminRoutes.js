const express = require('express');

function createAdminRoutes({ db, issueAuthToken, requireAdminAuth, emitElectionUpdate, adminMasterKey }) {
    const router = express.Router();

    router.post('/login', async (req, res) => {
        try {
            const { password } = req.body;

            if (password === adminMasterKey) {
                const token = issueAuthToken({ role: 'admin' });
                return res.json({ success: true, message: 'Admin authenticated', token });
            }

            return res.status(401).json({ error: 'Wrong password' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.use(requireAdminAuth);

    router.get('/elections', async (req, res) => {
        try {
            const elections = await db.getAllElections();
            const electionsWithStats = await Promise.all(elections.map(async (election) => {
                const stats = await db.getElectionStats(election.id);
                return { ...election, ...stats };
            }));

            return res.json({ elections: electionsWithStats });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections', async (req, res) => {
        try {
            const {
                title,
                description,
                candidates,
                start_date: startDate,
                end_date: endDate,
            } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Election title is required' });
            }

            const election = await db.createElection(title, description, startDate, endDate);

            if (Array.isArray(candidates)) {
                for (const name of candidates) {
                    if (name && name.trim()) {
                        await db.addCandidateToElection(election.id, name.trim());
                    }
                }
            }

            return res.json({ success: true, election });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.put('/elections/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const updates = req.body;

            await db.updateElection(id, updates);
            const election = await db.getElectionById(id);

            return res.json({ success: true, election });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.patch('/elections/:id/status', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const { status } = req.body;

            await db.updateElectionStatus(id, status);
            await emitElectionUpdate(id, 'election:status');
            return res.json({ success: true, status });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/regenerate-code', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const newCode = await db.regenerateElectionCode(id);
            return res.json({ success: true, code: newCode });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.delete('/elections/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            await db.deleteElection(id);
            return res.json({ success: true, message: 'Election deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/candidates', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Candidate name is required' });
            }

            const candidate = await db.addCandidateToElection(electionId, name);
            return res.json({ success: true, candidate });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.delete('/candidates/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            await db.deleteCandidate(id);
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/fake-votes', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const { candidateId, count } = req.body;

            const parsedCount = Number.parseInt(count, 10);
            if (!candidateId || Number.isNaN(parsedCount) || parsedCount <= 0) {
                return res.status(400).json({ error: 'candidateId and positive count are required' });
            }

            await db.addFakeVotes(electionId, candidateId, parsedCount);
            const results = await emitElectionUpdate(electionId, 'vote:kick');

            return res.json({ success: true, ...results });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/fraud', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.detectFraud(electionId);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = {
    createAdminRoutes,
};

const express = require('express');

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeDateValue(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
}

function normalizeCandidateList(candidates) {
    if (!Array.isArray(candidates)) {
        return [];
    }

    return candidates
        .map((candidate) => {
            if (typeof candidate === 'string') {
                return {
                    name: normalizeText(candidate),
                    description: '',
                };
            }

            if (candidate && typeof candidate === 'object') {
                return {
                    name: normalizeText(candidate.name),
                    description: normalizeText(candidate.description),
                };
            }

            return { name: '', description: '' };
        })
        .filter((candidate) => !!candidate.name)
        .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
}

function buildElectionSignature({ title, description, startDate, endDate, candidates }) {
    return JSON.stringify({
        title: normalizeText(title).toLowerCase(),
        description: normalizeText(description).toLowerCase(),
        startDate: normalizeDateValue(startDate),
        endDate: normalizeDateValue(endDate),
        candidates: normalizeCandidateList(candidates).map((candidate) => ({
            name: candidate.name.toLowerCase(),
            description: candidate.description.toLowerCase(),
        })),
    });
}

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
                replace_existing: replaceExisting,
            } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Election title is required' });
            }

            const normalizedCandidates = normalizeCandidateList(candidates);
            if (!normalizedCandidates.length) {
                return res.status(400).json({ error: 'At least one candidate is required' });
            }

            const requestedSignature = buildElectionSignature({
                title,
                description,
                startDate,
                endDate,
                candidates: normalizedCandidates,
            });

            const existingElections = await db.getAllElections();
            const duplicateMatches = [];

            for (const existingElection of existingElections) {
                const existingCandidates = await db.getCandidatesByElection(existingElection.id);
                const existingSignature = buildElectionSignature({
                    title: existingElection.title,
                    description: existingElection.description,
                    startDate: existingElection.start_date,
                    endDate: existingElection.end_date,
                    candidates: existingCandidates,
                });

                if (existingSignature === requestedSignature) {
                    duplicateMatches.push(existingElection);
                }
            }

            if (duplicateMatches.length && !replaceExisting) {
                const latestDuplicate = duplicateMatches[0];
                return res.status(409).json({
                    error: 'A matching voting session already exists. Clear or replace it before creating another one.',
                    duplicateSession: {
                        id: latestDuplicate.id,
                        title: latestDuplicate.title,
                        code: latestDuplicate.code,
                        status: latestDuplicate.status,
                    },
                });
            }

            if (duplicateMatches.length && replaceExisting) {
                for (const duplicate of duplicateMatches) {
                    await db.deleteElection(duplicate.id);
                }
            }

            const election = await db.createElection(title, description, startDate, endDate);

            for (const candidate of normalizedCandidates) {
                await db.addCandidateToElection(election.id, candidate.name, candidate.description || '');
            }

            if (replaceExisting && duplicateMatches.length) {
                return res.json({
                    success: true,
                    election,
                    replaced: duplicateMatches.map((item) => ({
                        id: item.id,
                        title: item.title,
                        code: item.code,
                        status: item.status,
                    })),
                });
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
            const { name, description = '' } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Candidate name is required' });
            }

            const candidate = await db.addCandidateToElection(electionId, name, description);
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
            const integrity = await db.getElectionIntegrityReport(electionId);

            return res.json({ success: true, ...results, integrity });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/integrity-report', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.getElectionIntegrityReport(electionId);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/fake-voters', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.getFakeVoterAudit(electionId);
            return res.json(data);
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

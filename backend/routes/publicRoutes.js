const express = require('express');

function parseBirthdate(rawBirthdate) {
    if (typeof rawBirthdate !== 'string' || !rawBirthdate.trim()) {
        return null;
    }

    const normalized = rawBirthdate.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    if (!match) {
        return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const parsed = new Date(year, month - 1, day);

    if (
        Number.isNaN(parsed.getTime())
        || parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
        || parsed > new Date()
    ) {
        return null;
    }

    return normalized;
}

function calculateAgeFromBirthdate(birthdate) {
    const [yearString, monthString, dayString] = birthdate.split('-');
    const birthYear = Number.parseInt(yearString, 10);
    const birthMonth = Number.parseInt(monthString, 10);
    const birthDay = Number.parseInt(dayString, 10);
    const today = new Date();

    const parsed = new Date(birthYear, birthMonth - 1, birthDay);
    if (
        Number.isNaN(parsed.getTime())
        || parsed.getFullYear() !== birthYear
        || parsed.getMonth() !== birthMonth - 1
        || parsed.getDate() !== birthDay
    ) {
        return null;
    }

    let years = today.getFullYear() - birthYear;
    const hasReachedBirthday = (today.getMonth() + 1 > birthMonth)
        || ((today.getMonth() + 1 === birthMonth) && today.getDate() >= birthDay);

    if (!hasReachedBirthday) {
        years -= 1;
    }

    return years;
}

function hasElectionEnded(election) {
    if (!election) {
        return false;
    }

    if (election.status === 'closed') {
        return true;
    }

    if (!election.end_date) {
        return false;
    }

    const endDate = new Date(election.end_date);
    return !Number.isNaN(endDate.getTime()) && Date.now() >= endDate.getTime();
}

function resolveVoterPhase(election, hasVoted) {
    if (hasElectionEnded(election)) {
        return 'results';
    }

    if (hasVoted) {
        return 'waiting';
    }

    return 'ballot';
}

function resolveSessionStatus(election) {
    if (!election) {
        return 'waiting';
    }

    if (hasElectionEnded(election) || election.status === 'closed') {
        return 'closed';
    }

    if (election.status === 'draft') {
        return 'waiting';
    }

    if (election.status === 'open') {
        if (!election.start_date) {
            return 'open';
        }

        const startDate = new Date(election.start_date);
        if (Number.isNaN(startDate.getTime())) {
            return 'open';
        }

        return Date.now() >= startDate.getTime() ? 'open' : 'waiting';
    }

    return 'waiting';
}

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

    router.get('/elections/session-status', async (req, res) => {
        try {
            const activeElection = await db.getActiveElection();
            const election = activeElection || await db.getLatestElection();

            res.json({
                state: resolveSessionStatus(election),
                election,
                serverTime: new Date().toISOString(),
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/session/identity', async (req, res) => {
        try {
            const {
                name,
                birthdate,
                sessionCode,
                voterIdCode,
                adminKey,
                code,
            } = req.body;

            const normalizedAdminKey = typeof adminKey === 'string'
                ? adminKey.trim()
                : (typeof code === 'string' ? code.trim() : '');

            if (normalizedAdminKey) {
                if (normalizedAdminKey === adminMasterKey) {
                    const token = issueAuthToken({ role: 'admin' });
                    return res.json({ role: 'admin', success: true, token });
                }

                return res.status(401).json({ error: 'Wrong admin key' });
            }

            const normalizedSessionCode = typeof sessionCode === 'string' ? sessionCode.trim().toUpperCase() : '';
            const normalizedVoterIdCode = typeof voterIdCode === 'string'
                ? voterIdCode.trim()
                : (typeof code === 'string' ? code.trim() : '');

            if (!normalizedSessionCode) {
                return res.status(400).json({ error: 'Session code is required' });
            }

            if (!normalizedVoterIdCode) {
                return res.status(400).json({ error: 'Voter ID code is required' });
            }

            if (!name || typeof name !== 'string' || name.trim().length < 2) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const normalizedBirthdate = parseBirthdate(birthdate);
            if (!normalizedBirthdate) {
                return res.status(400).json({ error: 'A valid birthdate is required' });
            }

            const parsedAge = calculateAgeFromBirthdate(normalizedBirthdate);
            if (parsedAge === null || parsedAge < 18) {
                return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
            }

            const election = await db.getElectionByCode(normalizedSessionCode);
            if (!election) {
                return res.status(404).json({ error: 'Election not found. Please check the session code.' });
            }

            const existingVoter = await db.findVoterByIdentifier(election.id, normalizedVoterIdCode);

            if (hasElectionEnded(election) && (!existingVoter || existingVoter.is_fake)) {
                return res.status(403).json({
                    error: 'This voting session has already ended.',
                    election,
                    reason: 'ended',
                });
            }

            if (election.status === 'closed') {
                if (!existingVoter || existingVoter.is_fake) {
                    return res.status(403).json({ error: 'This election is closed.' });
                }
            }

            if (election.status === 'draft') {
                return res.status(403).json({ error: 'This election has not started yet.' });
            }

            let voter = existingVoter;

            if (!existingVoter) {
                voter = await db.addVoter(election.id, name.trim(), parsedAge, normalizedVoterIdCode, false, normalizedBirthdate);
            } else {
                if (existingVoter.is_fake) {
                    return res.status(403).json({ error: 'Invalid voter identity for this election' });
                }

                await db.updateVoterIdentity(existingVoter.id, name.trim(), parsedAge, normalizedBirthdate);
                voter = await db.getVoterByIdAndElection(existingVoter.id, election.id);
            }

            const voterProgress = await db.getVoterProgress(voter.id, election.id);
            const hasVoted = !!voterProgress?.has_voted || await db.hasVoted(election.id, voter.id);
            const phase = resolveVoterPhase(election, hasVoted);

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
                sessionCode: election.code,
                hasVoted,
                phase,
                selectedCandidateId: voterProgress?.voted_candidate_id || null,
                votedAt: voterProgress?.voted_at || null,
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

            if (hasElectionEnded(election)) {
                return res.status(403).json({
                    error: 'This voting session has already ended.',
                    election,
                    reason: 'ended',
                });
            }

            if (election.status === 'closed') {
                return res.status(403).json({
                    error: 'This voting session has already ended.',
                    election,
                    reason: 'closed',
                });
            }

            if (election.status === 'draft') {
                return res.status(403).json({
                    error: 'This election has not started yet.',
                    election,
                    reason: 'draft',
                });
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
            const { name, birthdate, age, identifier } = req.body;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({ error: 'Name is required' });
            }

            let parsedAge = Number.isFinite(age) ? age : null;
            let normalizedBirthdate = null;

            if (birthdate) {
                normalizedBirthdate = parseBirthdate(birthdate);
                if (!normalizedBirthdate) {
                    return res.status(400).json({ error: 'A valid birthdate is required' });
                }
                parsedAge = calculateAgeFromBirthdate(normalizedBirthdate);
            }

            if (parsedAge === null || parsedAge < 18) {
                return res.status(400).json({ error: 'You must be at least 18 years old to vote' });
            }

            if (!identifier || typeof identifier !== 'string') {
                return res.status(400).json({ error: 'Voter ID is required' });
            }

            const voter = await db.addVoter(electionId, name.trim(), parsedAge, identifier.trim(), false, normalizedBirthdate);

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

            if (voter.has_voted) {
                return res.status(400).json({ error: 'You have already voted in this election' });
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
                nextPhase: 'waiting',
                notification: {
                    type: 'success',
                    title: 'Vote Registered',
                    body: `Your vote for ${candidate.name} has been securely recorded.`,
                },
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

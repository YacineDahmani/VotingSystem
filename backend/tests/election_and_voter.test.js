const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const db = require('../database');
const { createAuthMiddleware } = require('../middleware/auth');
const { createPublicRoutes } = require('../routes/publicRoutes');
const { createAdminRoutes } = require('../routes/adminRoutes');

describe('Elections & Voter Workflow Test Suite', () => {
    let server;
    let baseUrl;
    let testElection;
    let candidateAlpha;
    let candidateBeta;
    let voterToken;
    let voterRecord;

    const testSecret = 'test-jwt-secret-key-12345';
    const auth = createAuthMiddleware(testSecret);

    before(async () => {
        await db.initializeDatabase();

        const app = express();
        app.use(express.json());

        const mockEmitter = async (electionId) => {
            return db.getElectionResults(electionId);
        };
        const mockEnsureDefault = async () => null;

        app.use('/api', createPublicRoutes({
            db,
            ensureDefaultElection: mockEnsureDefault,
            issueAuthToken: auth.issueAuthToken,
            requireVoterAuth: auth.requireVoterAuth,
            emitElectionUpdate: mockEmitter,
            adminMasterKey: 'master-key',
        }));

        app.use('/api/admin', createAdminRoutes({
            db,
            issueAuthToken: auth.issueAuthToken,
            requireAdminAuth: auth.requireAdminAuth,
            emitElectionUpdate: mockEmitter,
            adminMasterKey: 'master-key',
        }));

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });

        // Create test election
        const now = new Date();
        const end = new Date(now.getTime() + 24 * 3600 * 1000);
        testElection = await db.createElection(
            'Test Municipal vote 2026',
            'Automated testing session',
            now.toISOString(),
            end.toISOString(),
            1,
            500
        );

        candidateAlpha = await db.addCandidateToElection(testElection.id, 'Candidate Alpha', 'Platform description Alpha');
        candidateBeta = await db.addCandidateToElection(testElection.id, 'Candidate Beta', 'Platform description Beta');
        await db.updateElectionStatus(testElection.id, 'open');
    });

    after(async () => {
        if (testElection?.id) {
            await db.deleteElection(testElection.id).catch(() => null);
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('should validate election session code', async () => {
        const response = await fetch(`${baseUrl}/api/elections/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: testElection.code }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.election.id, testElection.id);
    });

    it('should reject underage voter (<18 years old) during identity verification', async () => {
        const response = await fetch(`${baseUrl}/api/session/identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Minor Citizen',
                birthdate: '2015-05-15', // Underage
                voterIdCode: 'ID-MINOR-99',
                sessionCode: testElection.code,
            }),
        });

        assert.strictEqual(response.status, 400);
        const data = await response.json();
        assert.ok(data.error.includes('18 years old'));
    });

    it('should register eligible adult voter and issue voter token', async () => {
        const response = await fetch(`${baseUrl}/api/session/identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Elena Rostova',
                birthdate: '1995-04-12',
                voterIdCode: 'NAT-ID-88219',
                sessionCode: testElection.code,
            }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.role, 'voter');
        assert.ok(data.token, 'Must return JWT voter token');
        assert.strictEqual(data.voter.name, 'Elena Rostova');
        assert.strictEqual(data.hasVoted, false);
        assert.strictEqual(data.phase, 'vote');

        voterToken = data.token;
        voterRecord = data.voter;
    });

    it('should cast vote for Candidate Alpha and record vote', async () => {
        const response = await fetch(`${baseUrl}/api/elections/${testElection.id}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${voterToken}`,
            },
            body: JSON.stringify({
                candidateId: candidateAlpha.id,
            }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.nextPhase, 'waiting');
        assert.ok(data.receiptCode, 'Response must include cryptographic receiptCode');
        assert.match(data.receiptCode, /^SWISS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
        assert.ok(data.totalVotes >= 1);
    });

    it('should prevent double voting by the same voter', async () => {
        const response = await fetch(`${baseUrl}/api/elections/${testElection.id}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${voterToken}`,
            },
            body: JSON.stringify({
                candidateId: candidateBeta.id,
            }),
        });

        assert.strictEqual(response.status, 400);
        const data = await response.json();
        assert.ok(data.error.includes('already voted'));
    });

    it('should retrieve accurate election results with winner tally', async () => {
        const response = await fetch(`${baseUrl}/api/elections/${testElection.id}/results`);
        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.totalVotes, 1);
        const winner = data.candidates.find((c) => c.id === candidateAlpha.id);
        assert.strictEqual(winner.votes, 1);
    });

    it('should properly reopen an expired election when admin sets new end time', async () => {
        // 1. Manually expire and close the election
        const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
        await db.updateElection(testElection.id, { end_date: pastDate });
        await db.updateElectionStatus(testElection.id, 'closed');

        // Verify join fails with ended status
        const joinBeforeReopen = await fetch(`${baseUrl}/api/elections/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: testElection.code }),
        });
        assert.strictEqual(joinBeforeReopen.status, 403);
        const joinBeforeData = await joinBeforeReopen.json();
        assert.ok(joinBeforeData.reason === 'ended' || joinBeforeData.reason === 'closed');

        // 2. Admin reopens with a future end date
        const adminToken = auth.issueAuthToken({ role: 'admin', adminId: 1, username: 'admin' });
        const futureDate = new Date(Date.now() + 7200 * 1000).toISOString();
        const reopenResponse = await fetch(`${baseUrl}/api/admin/elections/${testElection.id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                status: 'open',
                endDate: futureDate,
            }),
        });

        assert.strictEqual(reopenResponse.status, 200);
        const reopenData = await reopenResponse.json();
        assert.strictEqual(reopenData.status, 'open');
        assert.strictEqual(reopenData.election.status, 'open');
        assert.strictEqual(new Date(reopenData.election.end_date).toISOString(), futureDate);

        // 3. Voter should now be able to validate and join the reopened session
        const joinAfterReopen = await fetch(`${baseUrl}/api/elections/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: testElection.code }),
        });
        assert.strictEqual(joinAfterReopen.status, 200);
        const joinAfterData = await joinAfterReopen.json();
        assert.strictEqual(joinAfterData.success, true);
        assert.strictEqual(joinAfterData.election.status, 'open');
    });

    it('should handle tie, automatically spawn runoff, and allow voter to enter and vote in Round 2', async () => {
        // Register a second voter to vote for Candidate Beta to create a 1-1 tie
        const voter2IdCode = 'CH-RUNOFF-002';
        const voter2Reg = await fetch(`${baseUrl}/api/session/identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionCode: testElection.code,
                name: 'Marcus Vance',
                age: 28,
                voterIdCode: voter2IdCode,
                birthdate: '1998-05-12',
            }),
        });
        assert.strictEqual(voter2Reg.status, 200);
        const voter2Data = await voter2Reg.json();

        // Voter 2 votes for Candidate Beta
        const vote2Res = await fetch(`${baseUrl}/api/elections/${testElection.id}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${voter2Data.token}`,
            },
            body: JSON.stringify({
                candidateId: candidateBeta.id,
            }),
        });
        assert.strictEqual(vote2Res.status, 200);

        // Manually close election to trigger final tie calculation
        await db.updateElectionStatus(testElection.id, 'closed');

        // Results should show tie and auto-generated runoff
        const resultsRes = await fetch(`${baseUrl}/api/elections/${testElection.id}/results`);
        assert.strictEqual(resultsRes.status, 200);
        const resultsData = await resultsRes.json();
        assert.strictEqual(resultsData.isTie, true);
        assert.strictEqual(resultsData.tiedCandidates.length, 2);
        assert.ok(resultsData.runoffElection);
        assert.strictEqual(resultsData.runoffElection.round, 2);

        // Voter 1 enters runoff via /runoff/enter
        const enterRes = await fetch(`${baseUrl}/api/elections/${testElection.id}/runoff/enter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${voterToken}`,
            },
        });
        assert.strictEqual(enterRes.status, 200);
        const enterData = await enterRes.json();
        assert.strictEqual(enterData.success, true);
        assert.ok(enterData.token);
        assert.strictEqual(enterData.round, 2);
        assert.strictEqual(enterData.hasVoted, false);

        // Get candidates for runoff election
        const runoffCandidatesRes = await fetch(`${baseUrl}/api/elections/${enterData.election.id}/candidates`);
        assert.strictEqual(runoffCandidatesRes.status, 200);
        const runoffCandData = await runoffCandidatesRes.json();
        assert.strictEqual(runoffCandData.candidates.length, 2);

        // Voter 1 votes in Round 2!
        const runoffVoteRes = await fetch(`${baseUrl}/api/elections/${enterData.election.id}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${enterData.token}`,
            },
            body: JSON.stringify({
                candidateId: runoffCandData.candidates[0].id,
            }),
        });
        assert.strictEqual(runoffVoteRes.status, 200);
        const runoffVoteData = await runoffVoteRes.json();
        assert.strictEqual(runoffVoteData.success, true);
        assert.ok(runoffVoteData.receiptCode);
    });
});

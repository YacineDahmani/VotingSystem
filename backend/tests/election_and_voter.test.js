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
});

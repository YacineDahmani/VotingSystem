const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const db = require('../database');
const { createAuthMiddleware } = require('../middleware/auth');
const { createPublicRoutes } = require('../routes/publicRoutes');
const { createAdminRoutes } = require('../routes/adminRoutes');

describe('Security & Privacy Test Suite', () => {
    let server;
    let baseUrl;
    let testElection;
    let candidateAlpha;
    let voterToken;
    let castReceiptCode;

    const testSecret = 'test-security-jwt-secret-98765';
    const auth = createAuthMiddleware(testSecret);

    before(async () => {
        await db.initializeDatabase();

        const app = express();
        app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
        }));
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
            adminMasterKey: 'master-sec-key',
        }));

        app.use('/api/admin', createAdminRoutes({
            db,
            issueAuthToken: auth.issueAuthToken,
            requireAdminAuth: auth.requireAdminAuth,
            emitElectionUpdate: mockEmitter,
            adminMasterKey: 'master-sec-key',
        }));

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });

        // Seed test election
        const now = new Date();
        const end = new Date(now.getTime() + 24 * 3600 * 1000);
        testElection = await db.createElection(
            'Security Audit Ballot 2026',
            'Election for cryptographic and privacy verification',
            now.toISOString(),
            end.toISOString(),
            1,
            100
        );

        candidateAlpha = await db.addCandidateToElection(testElection.id, 'Candidate Cipher', 'Security Platform');
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

    it('should include Helmet security headers in HTTP responses', async () => {
        const response = await fetch(`${baseUrl}/api/status`);
        assert.strictEqual(response.status, 200);

        // Verify standard Helmet headers
        const nosniff = response.headers.get('x-content-type-options');
        const frameguard = response.headers.get('x-frame-options');
        const dnsPrefetch = response.headers.get('x-dns-prefetch-control');

        assert.strictEqual(nosniff, 'nosniff', 'Must enforce nosniff header');
        assert.strictEqual(frameguard, 'SAMEORIGIN', 'Must enforce frameguard header');
        assert.strictEqual(dnsPrefetch, 'off', 'Must disable DNS prefetch');
    });

    it('should register eligible adult voter and authenticate securely', async () => {
        const response = await fetch(`${baseUrl}/api/session/identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Auditor Person',
                birthdate: '1990-01-01',
                voterIdCode: 'SEC-ID-7711',
                sessionCode: testElection.code,
            }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.role, 'voter');
        assert.strictEqual(data.hasVoted, false);
        assert.strictEqual(data.selectedCandidateId, null);
        assert.ok(data.token);

        voterToken = data.token;
    });

    it('should cast ballot and receive a verifiable cryptographic receipt code', async () => {
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
        assert.ok(data.receiptCode, 'Must return a cryptographic receipt code');
        assert.match(data.receiptCode, /^SWISS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);

        castReceiptCode = data.receiptCode;
    });

    it('should maintain secret ballot privacy upon subsequent identity verification', async () => {
        const response = await fetch(`${baseUrl}/api/session/identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Auditor Person',
                birthdate: '1990-01-01',
                voterIdCode: 'SEC-ID-7711',
                sessionCode: testElection.code,
            }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.hasVoted, true);
        // Voter choice must be secret and never exposed in voter identity queries
        assert.strictEqual(data.selectedCandidateId, null, 'Ballot secrecy: candidate ID must not be leaked');
        assert.strictEqual(data.phase, 'waiting');
    });

    it('should cryptographically verify cast ballot receipt without revealing candidate', async () => {
        const response = await fetch(`${baseUrl}/api/elections/${testElection.id}/receipts/${castReceiptCode}`);
        assert.strictEqual(response.status, 200);
        const data = await response.json();

        assert.strictEqual(data.verified, true);
        assert.strictEqual(data.receiptCode, castReceiptCode);
        assert.ok(data.recordedAt);
        assert.strictEqual(data.candidateId, undefined, 'Receipt verification must be zero-knowledge (no candidate ID exposed)');
    });

    it('should reject invalid or fraudulent ballot receipt codes with 404', async () => {
        const response = await fetch(`${baseUrl}/api/elections/${testElection.id}/receipts/SWISS-FFFF-0000-9999`);
        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.verified, false);
    });

    it('should enforce rate limiting after repeated burst requests', async () => {
        // Send 35 rapid requests to trigger 30 req/min rate limit
        let rateLimitedResponse = null;

        for (let i = 0; i < 35; i++) {
            const res = await fetch(`${baseUrl}/api/session/identity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Spam Requester',
                    birthdate: '1990-01-01',
                    voterIdCode: `SPAM-ID-${i}`,
                    sessionCode: testElection.code,
                }),
            });

            if (res.status === 429) {
                rateLimitedResponse = res;
                break;
            }
        }

        assert.ok(rateLimitedResponse, 'Rate limiter must return HTTP 429 when burst limit is exceeded');
        assert.strictEqual(rateLimitedResponse.status, 429);
        const data = await rateLimitedResponse.json();
        assert.ok(data.error.includes('Too many'));
        assert.ok(rateLimitedResponse.headers.get('retry-after'));
    });
});

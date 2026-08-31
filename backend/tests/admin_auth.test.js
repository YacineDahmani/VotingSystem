const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const db = require('../database');
const { createAuthMiddleware } = require('../middleware/auth');
const { createAdminRoutes } = require('../routes/adminRoutes');
const { createPublicRoutes } = require('../routes/publicRoutes');

describe('Admin Authentication & Setup Test Suite', () => {
    let server;
    let baseUrl;
    const testSecret = 'test-jwt-secret-key-12345';
    const auth = createAuthMiddleware(testSecret);
    const testAdminUsername = `officer_${Date.now()}`;
    const testAdminEmail = `officer_${Date.now()}@elections.swiss`;
    const testAdminPassword = 'StrongPassword987!';

    before(async () => {
        await db.initializeDatabase();

        // Spin up an Express test server on ephemeral port
        const app = express();
        app.use(express.json());

        const mockEmitter = async () => ({ isTie: false, totalVotes: 0 });
        const mockEnsureDefault = async () => null;

        app.use('/api', createPublicRoutes({
            db,
            ensureDefaultElection: mockEnsureDefault,
            issueAuthToken: auth.issueAuthToken,
            requireVoterAuth: auth.requireVoterAuth,
            emitElectionUpdate: mockEmitter,
            adminMasterKey: 'master-fallback-key',
        }));

        app.use('/api/admin', createAdminRoutes({
            db,
            issueAuthToken: auth.issueAuthToken,
            requireAdminAuth: auth.requireAdminAuth,
            emitElectionUpdate: mockEmitter,
            adminMasterKey: 'master-fallback-key',
        }));

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        // Clean up test admin from database
        await new Promise((resolve) => {
            db.db.run('DELETE FROM admins WHERE username = ?', [testAdminUsername], () => resolve());
        });

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('should verify database password hashing with unique salt', async () => {
        const admin = await db.createAdmin(testAdminUsername, testAdminEmail, testAdminPassword, 'super_admin');
        assert.ok(admin.id, 'Admin ID should exist');
        assert.strictEqual(admin.username, testAdminUsername);
        assert.strictEqual(admin.email, testAdminEmail);
        assert.strictEqual(admin.role, 'super_admin');

        // Test valid password verification
        const verified = await db.verifyAdminCredentials(testAdminUsername, testAdminPassword);
        assert.ok(verified, 'Credentials should verify successfully');
        assert.strictEqual(verified.username, testAdminUsername);

        // Test verification with email
        const verifiedByEmail = await db.verifyAdminCredentials(testAdminEmail, testAdminPassword);
        assert.ok(verifiedByEmail, 'Email credential should verify successfully');

        // Test invalid password rejection
        const wrongPassword = await db.verifyAdminCredentials(testAdminUsername, 'WrongPassword123');
        assert.strictEqual(wrongPassword, null, 'Wrong password must return null');

        // Test non-existent user rejection
        const nonExistent = await db.verifyAdminCredentials('ghost_user', testAdminPassword);
        assert.strictEqual(nonExistent, null, 'Non-existent user must return null');
    });

    it('GET /api/admin/setup-status should report initialized when admin exists', async () => {
        const response = await fetch(`${baseUrl}/api/admin/setup-status`);
        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.isInitialized, true);
        assert.ok(data.adminCount >= 1);
    });

    it('POST /api/admin/setup should reject registration when admin already exists', async () => {
        const response = await fetch(`${baseUrl}/api/admin/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'another_admin',
                email: 'another@test.gov',
                password: 'Password123',
            }),
        });

        assert.strictEqual(response.status, 403);
        const data = await response.json();
        assert.ok(data.error.includes('already been initialized'));
    });

    it('POST /api/admin/login should authenticate valid admin and issue JWT', async () => {
        const response = await fetch(`${baseUrl}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: testAdminUsername,
                password: testAdminPassword,
            }),
        });

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.success, true);
        assert.ok(data.token, 'Response must include JWT token');
        assert.strictEqual(data.admin.username, testAdminUsername);
        assert.strictEqual(data.admin.role, 'super_admin');

        // Verify protected endpoint GET /api/admin/me with issued token
        const meResponse = await fetch(`${baseUrl}/api/admin/me`, {
            headers: {
                Authorization: `Bearer ${data.token}`,
            },
        });

        assert.strictEqual(meResponse.status, 200);
        const meData = await meResponse.json();
        assert.strictEqual(meData.admin.username, testAdminUsername);
    });

    it('POST /api/admin/login should reject invalid credentials with 401', async () => {
        const response = await fetch(`${baseUrl}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: testAdminUsername,
                password: 'IncorrectPassword',
            }),
        });

        assert.strictEqual(response.status, 401);
        const data = await response.json();
        assert.strictEqual(data.error, 'Invalid admin credentials');
    });

    it('Protected routes should reject requests without token with 401', async () => {
        const response = await fetch(`${baseUrl}/api/admin/elections`);
        assert.strictEqual(response.status, 401);
    });
});

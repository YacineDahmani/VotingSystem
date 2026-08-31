const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ClientIo } = require('socket.io-client');
const db = require('../database');
const { createAuthMiddleware } = require('../middleware/auth');
const { configureSocket, createElectionEmitter } = require('../services/realtime');

describe('Database Optimization & Real-Time Socket Resilience Suite', () => {
    let server;
    let ioServer;
    let port;
    let testElection;
    let candidateOne;
    let candidateTwo;
    let voterAlpha;
    let adminToken;
    let emitElectionUpdate;

    const jwtSecret = 'test-concurrency-socket-secret-4433';
    const auth = createAuthMiddleware(jwtSecret);

    before(async () => {
        await db.initializeDatabase();

        const app = express();
        server = http.createServer(app);
        ioServer = new Server(server, { cors: { origin: '*' } });

        configureSocket(ioServer, { db, jwtSecret });
        emitElectionUpdate = createElectionEmitter({ io: ioServer, db });

        await new Promise((resolve) => {
            server.listen(0, () => {
                port = server.address().port;
                resolve();
            });
        });

        // Create test election
        testElection = await db.createElection(
            'Concurrency & Socket Ballot 2026',
            'Testing SQLite transactions and realtime socket rooms',
            new Date().toISOString(),
            new Date(Date.now() + 86400000).toISOString(),
            1,
            500
        );

        candidateOne = await db.addCandidateToElection(testElection.id, 'Candidate Quantum', 'Quantum platform');
        candidateTwo = await db.addCandidateToElection(testElection.id, 'Candidate Alpine', 'Alpine platform');
        await db.updateElectionStatus(testElection.id, 'open');

        // Create test voter
        voterAlpha = await db.addVoter(testElection.id, 'Concurrent Voter', 28, 'CONCUR-ID-01', false, '1998-05-10');

        // Create admin token
        adminToken = auth.issueAuthToken({
            role: 'admin',
            adminId: 99,
            username: 'TestAdmin',
            email: 'admin@concurrency.local',
            adminRole: 'super_admin',
        });
    });

    after(async () => {
        if (testElection?.id) {
            await db.deleteElection(testElection.id).catch(() => null);
        }
        if (ioServer) {
            await new Promise((resolve) => ioServer.close(resolve));
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('should have created database indexes for rapid querying and constraint checks', async () => {
        const indexes = await new Promise((resolve, reject) => {
            db.db.all("SELECT name FROM sqlite_master WHERE type = 'index'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map((r) => r.name));
            });
        });

        assert.ok(indexes.includes('idx_elections_status'), 'Must have idx_elections_status');
        assert.ok(indexes.includes('idx_elections_code'), 'Must have idx_elections_code');
        assert.ok(indexes.includes('idx_voters_election_identifier'), 'Must have idx_voters_election_identifier');
        assert.ok(indexes.includes('idx_votes_election_voter'), 'Must have idx_votes_election_voter');
        assert.ok(indexes.includes('idx_votes_election_candidate'), 'Must have idx_votes_election_candidate');
        assert.ok(indexes.includes('idx_candidates_election'), 'Must have idx_candidates_election');
    });

    it('should atomically handle concurrent vote submissions and prevent double voting under race conditions', async () => {
        // Dispatch 10 parallel vote calls for the same voter at the exact same moment
        const concurrentPromises = Array.from({ length: 10 }).map((_, index) => {
            const candidateId = index % 2 === 0 ? candidateOne.id : candidateTwo.id;
            const receiptCode = `SWISS-CONC-0000-${String(index).padStart(4, '0')}`;
            return db.recordVote(testElection.id, voterAlpha.id, candidateId, receiptCode)
                .then((res) => ({ success: true, res }))
                .catch((err) => ({ success: false, error: err.message }));
        });

        const results = await Promise.all(concurrentPromises);
        const successes = results.filter((r) => r.success);
        const failures = results.filter((r) => !r.success);

        assert.strictEqual(successes.length, 1, 'Exactly one concurrent vote must succeed');
        assert.strictEqual(failures.length, 9, 'All competing duplicate votes must be safely rolled back');
        failures.forEach((f) => {
            assert.ok(f.error.includes('already voted'), `Expected 'already voted' error but got: ${f.error}`);
        });

        // Verify total votes in DB
        const electionResults = await db.getElectionResults(testElection.id);
        assert.strictEqual(electionResults.totalVotes, 1, 'Total votes recorded must strictly equal 1');
    });

    it('should immediately deliver election:sync payload on socket election:watch subscription', async () => {
        const clientSocket = ClientIo(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            forceNew: true,
        });

        try {
            const syncPayload = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Timed out waiting for election:sync')), 3000);

                clientSocket.on('connect', () => {
                    clientSocket.emit('election:watch', testElection.id);
                });

                clientSocket.on('election:sync', (payload) => {
                    clearTimeout(timer);
                    resolve(payload);
                });
            });

            assert.strictEqual(syncPayload.electionId, testElection.id);
            assert.strictEqual(syncPayload.status, 'open');
            assert.strictEqual(syncPayload.totalVotes, 1);
            assert.ok(syncPayload.serverTime);
        } finally {
            clientSocket.close();
        }
    });

    it('should selectively broadcast live candidate breakdowns to admin room while sending kinetic pulses to public room', async () => {
        const voterSocket = ClientIo(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            forceNew: true,
        });
        const adminSocket = ClientIo(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            forceNew: true,
        });

        try {
            await new Promise((resolve) => {
                let connectedCount = 0;
                const onConnect = () => {
                    connectedCount += 1;
                    if (connectedCount === 2) resolve();
                };
                voterSocket.on('connect', onConnect);
                adminSocket.on('connect', onConnect);
            });

            voterSocket.emit('election:watch', testElection.id);
            adminSocket.emit('admin:watch', { electionId: testElection.id, token: adminToken });

            // Wait for subscription joins
            await new Promise((r) => setTimeout(r, 100));

            // Set up event captures
            const voterReceivedPromise = new Promise((resolve) => {
                let receivedUpdate = null;
                let receivedKick = null;
                voterSocket.on('election:update', (payload) => {
                    receivedUpdate = payload;
                    if (receivedKick) resolve({ update: receivedUpdate, kick: receivedKick });
                });
                voterSocket.on('vote:kick', (payload) => {
                    receivedKick = payload;
                    if (receivedUpdate) resolve({ update: receivedUpdate, kick: receivedKick });
                });
            });

            const adminReceivedPromise = new Promise((resolve) => {
                adminSocket.on('election:admin-update', (payload) => {
                    resolve(payload);
                });
            });

            // Trigger broadcast
            await emitElectionUpdate(testElection.id, 'vote:kick');

            const voterData = await voterReceivedPromise;
            const adminData = await adminReceivedPromise;

            // Voter public room: receives totalVotes and kinetic impulse, NO live candidate tally during active voting
            assert.strictEqual(voterData.update.totalVotes, 1);
            assert.strictEqual(voterData.update.candidates, undefined, 'Public update must not leak candidate tallies while open');
            assert.strictEqual(voterData.kick.totalVotes, 1);

            // Admin room: receives full live candidate tallies
            assert.strictEqual(adminData.totalVotes, 1);
            assert.ok(Array.isArray(adminData.candidates), 'Admin room must receive candidates tally');
            assert.strictEqual(adminData.candidates.length, 2);
        } finally {
            voterSocket.close();
            adminSocket.close();
        }
    });
});

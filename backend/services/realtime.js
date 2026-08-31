const jwt = require('jsonwebtoken');

function configureSocket(io, { db, jwtSecret } = {}) {
    io.on('connection', (socket) => {
        // Voter / Public room subscription
        socket.on('election:watch', async (electionId) => {
            const id = Number.parseInt(electionId, 10);
            if (Number.isNaN(id)) {
                return;
            }

            socket.join(`election:${id}`);

            // Fast state synchronization on join / reconnection
            if (db) {
                try {
                    const election = await db.getElectionById(id);
                    if (election) {
                        const candidates = await db.getCandidatesByElection(id);
                        const totalVotes = candidates.reduce((sum, c) => sum + (c.votes || 0), 0);

                        socket.emit('election:sync', {
                            electionId: id,
                            status: election.status,
                            totalVotes,
                            startDate: election.start_date,
                            endDate: election.end_date,
                            serverTime: new Date().toISOString(),
                        });
                    }
                } catch (err) {
                    // Suppress synchronization error to keep socket alive
                }
            }
        });

        // Authenticated Admin room subscription
        socket.on('admin:watch', async (payload) => {
            try {
                const electionId = Number.parseInt(payload?.electionId, 10);
                const token = payload?.token;

                if (Number.isNaN(electionId) || !token || !jwtSecret) {
                    socket.emit('admin:error', { error: 'Authentication required for administrative channel' });
                    return;
                }

                const decoded = jwt.verify(token, jwtSecret);
                if (decoded?.role !== 'admin') {
                    socket.emit('admin:error', { error: 'Admin privileges required' });
                    return;
                }

                socket.join(`election:${electionId}:admin`);

                // Send immediate administrative sync with live candidate tallies
                if (db) {
                    const results = await db.getElectionResults(electionId);
                    socket.emit('election:admin-sync', {
                        electionId,
                        totalVotes: results.totalVotes,
                        status: results.election.status,
                        candidates: results.candidates,
                        isTie: results.isTie,
                        runoffElection: results.runoffElection,
                        serverTime: new Date().toISOString(),
                    });
                }
            } catch (err) {
                socket.emit('admin:error', { error: 'Invalid or expired administrative token' });
            }
        });
    });
}

function createElectionEmitter({ io, db }) {
    return async function emitElectionUpdate(electionId, eventType = 'vote:kick') {
        const results = await db.getElectionResults(electionId);
        const isClosed = results.election.status === 'closed';

        // Public room payload: sanitized summary while active; full candidates when closed
        const publicPayload = {
            electionId,
            totalVotes: results.totalVotes,
            status: results.election.status,
            serverTime: new Date().toISOString(),
            ...(isClosed ? { candidates: results.candidates, isTie: results.isTie, runoffElection: results.runoffElection } : {}),
        };

        // Admin room payload: always includes candidate distribution & live tallies
        const adminPayload = {
            electionId,
            totalVotes: results.totalVotes,
            status: results.election.status,
            candidates: results.candidates,
            isTie: results.isTie,
            runoffElection: results.runoffElection,
            serverTime: new Date().toISOString(),
        };

        // 1. Broadcast kinetic impulse and public sync to voter room
        io.to(`election:${electionId}`).emit('election:update', publicPayload);
        io.to(`election:${electionId}`).emit(eventType, { electionId, totalVotes: results.totalVotes });

        // 2. Broadcast comprehensive live statistics to admin room
        io.to(`election:${electionId}:admin`).emit('election:admin-update', adminPayload);

        // 3. Broadcast closure event when election reaches finality
        if (isClosed) {
            io.to(`election:${electionId}`).emit('election:closed', { electionId, results });
            io.to(`election:${electionId}:admin`).emit('election:closed', { electionId, results });
        }

        return results;
    };
}

module.exports = {
    configureSocket,
    createElectionEmitter,
};

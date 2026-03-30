const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');
const { createAuthMiddleware } = require('./middleware/auth');
const { configureSocket, createElectionEmitter } = require('./services/realtime');
const { ensureDefaultElection } = require('./services/electionBootstrap');
const { createPublicRoutes } = require('./routes/publicRoutes');
const { createAdminRoutes } = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-local-jwt-secret-change-me';
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY;
const auth = createAuthMiddleware(JWT_SECRET);
const emitElectionUpdate = createElectionEmitter({ io, db });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

configureSocket(io);

app.use('/api', createPublicRoutes({
    db,
    ensureDefaultElection,
    issueAuthToken: auth.issueAuthToken,
    requireVoterAuth: auth.requireVoterAuth,
    emitElectionUpdate,
    adminMasterKey: ADMIN_MASTER_KEY,
}));

app.use('/api/admin', createAdminRoutes({
    db,
    issueAuthToken: auth.issueAuthToken,
    requireAdminAuth: auth.requireAdminAuth,
    emitElectionUpdate,
    adminMasterKey: ADMIN_MASTER_KEY,
}));


// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

async function startServer() {
    try {
        if (!ADMIN_MASTER_KEY) {
            throw new Error('Missing required ADMIN_MASTER_KEY environment variable');
        }

        await db.initializeDatabase();
        await ensureDefaultElection(db);
        console.log('Database initialized');

        server.listen(PORT, () => {
            console.log(`Voting System running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
}

startServer();

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'voting.db');
const db = new sqlite3.Database(dbPath);

const CHART_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6'
];

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS candidates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    votes INTEGER DEFAULT 0,
                    color_code TEXT,
                    last_vote_timestamp DATETIME,
                    fraud_suspected BOOLEAN DEFAULT 0
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS voters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    age INTEGER,
                    is_fake BOOLEAN DEFAULT 0,
                    voted_for INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `);

            const defaults = [
                ['election_name', 'Election'],
                ['election_status', 'OPEN'],
                ['is_tie', 'false'],
                ['version', '1'],
                ['admin_password', process.env.ADMIN_PASSWORD || 'admin']
            ];

            const stmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
            defaults.forEach(([key, value]) => stmt.run(key, value));
            stmt.finalize();

            resolve();
        });
    });
}

function getSetting(key) {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
}

function setSetting(key, value) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getAllCandidates() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM candidates ORDER BY votes DESC, last_vote_timestamp ASC', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getCandidateById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM candidates WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function addCandidate(name) {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM candidates', (err, row) => {
            if (err) return reject(err);
            const colorIndex = row.count % CHART_COLORS.length;
            const color = CHART_COLORS[colorIndex];

            db.run(
                'INSERT INTO candidates (name, color_code, votes) VALUES (?, ?, 0)',
                [name, color],
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, name, color_code: color, votes: 0 });
                }
            );
        });
    });
}

function incrementVote(candidateId) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString();
        db.run(
            'UPDATE candidates SET votes = votes + 1, last_vote_timestamp = ? WHERE id = ?',
            [timestamp, candidateId],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            }
        );
    });
}

function addVoter(name, age, isFake = false, votedFor = null) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO voters (name, age, is_fake, voted_for) VALUES (?, ?, ?, ?)',
            [name, age, isFake ? 1 : 0, votedFor],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, name, age });
            }
        );
    });
}

function countRealVoters() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM voters WHERE is_fake = 0', (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
        });
    });
}

function countTotalVoters() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM voters', (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
        });
    });
}

function deleteCandidate(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM candidates WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function addFakeVotes(candidateId, count) {
    return new Promise(async (resolve, reject) => {
        try {
            const candidate = await getCandidateById(candidateId);
            if (!candidate) return reject(new Error('Candidate not found'));

            const timestamp = new Date().toISOString();

            await new Promise((res, rej) => {
                db.run(
                    'UPDATE candidates SET votes = votes + ?, last_vote_timestamp = ? WHERE id = ?',
                    [count, timestamp, candidateId],
                    (err) => err ? rej(err) : res()
                );
            });

            const stmt = db.prepare('INSERT INTO voters (name, age, is_fake, voted_for) VALUES (?, ?, 1, ?)');
            for (let i = 0; i < count; i++) {
                stmt.run('Fake', 0, candidateId);
            }
            stmt.finalize();

            resolve({ candidateId, addedVotes: count });
        } catch (err) {
            reject(err);
        }
    });
}

function detectFraud() {
    return new Promise(async (resolve, reject) => {
        try {
            const realVoterCount = await countRealVoters();
            const candidates = await getAllCandidates();

            const fraudResults = candidates.map(c => ({
                ...c,
                fraud_suspected: c.votes > realVoterCount
            }));

            const stmt = db.prepare('UPDATE candidates SET fraud_suspected = ? WHERE id = ?');
            fraudResults.forEach(c => stmt.run(c.fraud_suspected ? 1 : 0, c.id));
            stmt.finalize();

            resolve({ realVoterCount, candidates: fraudResults });
        } catch (err) {
            reject(err);
        }
    });
}

function checkForTie() {
    return new Promise(async (resolve, reject) => {
        try {
            const candidates = await getAllCandidates();
            if (candidates.length < 2) {
                return resolve({ isTie: false, tiedCandidates: [] });
            }

            const maxVotes = candidates[0].votes;
            if (maxVotes === 0) {
                return resolve({ isTie: false, tiedCandidates: [] });
            }

            const topCandidates = candidates.filter(c => c.votes === maxVotes);
            const isTie = topCandidates.length > 1;

            await setSetting('is_tie', isTie.toString());

            const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
            const leader = isTie ? null : {
                ...candidates[0],
                percentage: totalVotes > 0 ? ((candidates[0].votes / totalVotes) * 100).toFixed(1) : '0.0'
            };

            resolve({
                isTie,
                tiedCandidates: isTie ? topCandidates : [],
                leader
            });
        } catch (err) {
            reject(err);
        }
    });
}

function resetElection() {
    return new Promise(async (resolve, reject) => {
        try {
            await new Promise((res, rej) => {
                db.serialize(() => {
                    db.run('DROP TABLE IF EXISTS candidates', (err) => {
                        if (err) return rej(err);
                    });
                    db.run(`
                        CREATE TABLE candidates (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            votes INTEGER DEFAULT 0,
                            color_code TEXT,
                            last_vote_timestamp DATETIME,
                            fraud_suspected BOOLEAN DEFAULT 0
                        )
                    `, (err) => {
                        if (err) return rej(err);
                        res();
                    });
                    db.run('DELETE FROM voters');
                });
            });

            const currentVersion = await getSetting('version');
            const newVersion = (parseInt(currentVersion) || 0) + 1;
            await setSetting('version', newVersion.toString());
            await setSetting('is_tie', 'false');
            await setSetting('election_status', 'OPEN');

            resolve({ version: newVersion });
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    db,
    initializeDatabase,
    getSetting,
    setSetting,
    getAllCandidates,
    getCandidateById,
    addCandidate,
    incrementVote,
    addVoter,
    countRealVoters,
    countTotalVoters,
    deleteCandidate,
    addFakeVotes,
    detectFraud,
    checkForTie,
    resetElection,
    CHART_COLORS
};

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'voting_v2.db');
const db = new sqlite3.Database(dbPath);

const CHART_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6'
];

function generateElectionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const randomBytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
        code += chars[randomBytes[i] % chars.length];
    }
    return code;
}

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tables
            db.run(`
                CREATE TABLE IF NOT EXISTS elections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    code TEXT UNIQUE NOT NULL,
                    status TEXT DEFAULT 'draft',
                    start_date DATETIME,
                    end_date DATETIME,
                    round INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS candidates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    election_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    votes INTEGER DEFAULT 0,
                    color_code TEXT,
                    last_vote_timestamp DATETIME,
                    fraud_suspected BOOLEAN DEFAULT 0,
                    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS voters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    election_id INTEGER,
                    name TEXT NOT NULL,
                    age INTEGER,
                    identifier TEXT,
                    is_fake BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
                    UNIQUE(election_id, identifier)
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    election_id INTEGER NOT NULL,
                    voter_id INTEGER NOT NULL,
                    candidate_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(election_id, voter_id),
                    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
                    FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE,
                    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `);

            // Schema Migrations (safely add columns if missing in existing DB)
            const migrations = [
                'ALTER TABLE elections ADD COLUMN round INTEGER DEFAULT 1',
                'ALTER TABLE voters ADD COLUMN identifier TEXT'
            ];

            migrations.forEach(query => {
                db.run(query, (err) => {
                    // Ignore "duplicate column name" errors
                    if (err && !err.message.includes('duplicate column name')) {
                        console.warn('Migration warning:', err.message);
                    }
                });
            });

            const defaults = [
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

// ==================== ELECTIONS ====================

function createElection(title, description = '', startDate = null, endDate = null, round = 1) {
    return new Promise(async (resolve, reject) => {
        try {
            let code = generateElectionCode();
            let attempts = 0;

            while (attempts < 10) {
                const existing = await getElectionByCode(code);
                if (!existing) break;
                code = generateElectionCode();
                attempts++;
            }

            db.run(
                `INSERT INTO elections (title, description, code, status, start_date, end_date, round) 
                 VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
                [title, description, code, startDate, endDate, round],
                function (err) {
                    if (err) reject(err);
                    else resolve({
                        id: this.lastID,
                        title,
                        description,
                        code,
                        status: 'draft',
                        start_date: startDate,
                        end_date: endDate,
                        round
                    });
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

function getElectionByCode(code) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM elections WHERE code = ?', [code.toUpperCase()], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function getElectionById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM elections WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function getAllElections() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM elections ORDER BY created_at DESC', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function updateElection(id, updates) {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];

        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
        if (updates.start_date !== undefined) { fields.push('start_date = ?'); values.push(updates.start_date); }
        if (updates.end_date !== undefined) { fields.push('end_date = ?'); values.push(updates.end_date); }

        if (fields.length === 0) return resolve(false);

        values.push(id);
        db.run(`UPDATE elections SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function updateElectionStatus(id, status) {
    return new Promise((resolve, reject) => {
        if (!['draft', 'open', 'closed'].includes(status)) {
            return reject(new Error('Invalid status. Must be: draft, open, or closed'));
        }
        db.run('UPDATE elections SET status = ? WHERE id = ?', [status, id], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function regenerateElectionCode(id) {
    return new Promise(async (resolve, reject) => {
        try {
            let code = generateElectionCode();
            let attempts = 0;

            while (attempts < 10) {
                const existing = await getElectionByCode(code);
                if (!existing) break;
                code = generateElectionCode();
                attempts++;
            }

            db.run('UPDATE elections SET code = ? WHERE id = ?', [code, id], function (err) {
                if (err) reject(err);
                else resolve(this.changes > 0 ? code : null);
            });
        } catch (err) {
            reject(err);
        }
    });
}

function deleteElection(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM elections WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getElectionStats(id) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                (SELECT COUNT(*) FROM candidates WHERE election_id = ?) as candidate_count,
                (SELECT SUM(votes) FROM candidates WHERE election_id = ?) as total_votes,
                (SELECT COUNT(*) FROM voters WHERE election_id = ? AND is_fake = 0) as voter_count
        `, [id, id, id], (err, row) => {
            if (err) reject(err);
            else resolve({
                candidateCount: row?.candidate_count || 0,
                totalVotes: row?.total_votes || 0,
                voterCount: row?.voter_count || 0
            });
        });
    });
}

// ==================== CANDIDATES ====================

function getCandidatesByElection(electionId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM candidates WHERE election_id = ? ORDER BY votes DESC, last_vote_timestamp ASC',
            [electionId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
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

function addCandidateToElection(electionId, name) {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM candidates WHERE election_id = ?', [electionId], (err, row) => {
            if (err) return reject(err);
            const colorIndex = row.count % CHART_COLORS.length;
            const color = CHART_COLORS[colorIndex];

            db.run(
                'INSERT INTO candidates (election_id, name, color_code, votes) VALUES (?, ?, ?, 0)',
                [electionId, name, color],
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, election_id: electionId, name, color_code: color, votes: 0 });
                }
            );
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

// ==================== VOTERS & VOTING ====================

function addVoter(electionId, name, age, identifier = null, isFake = false) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO voters (election_id, name, age, identifier, is_fake) VALUES (?, ?, ?, ?, ?)',
            [electionId, name, age, identifier, isFake ? 1 : 0],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        reject(new Error('This ID has already been used to vote in this election.'));
                    } else {
                        reject(err);
                    }
                }
                else resolve({ id: this.lastID, election_id: electionId, name, age, identifier });
            }
        );
    });
}

function hasVoted(electionId, voterId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT id FROM votes WHERE election_id = ? AND voter_id = ?',
            [electionId, voterId],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
}

function recordVote(electionId, voterId, candidateId) {
    return new Promise(async (resolve, reject) => {
        try {
            const alreadyVoted = await hasVoted(electionId, voterId);
            if (alreadyVoted) {
                return reject(new Error('You have already voted in this election'));
            }

            db.run(
                'INSERT INTO votes (election_id, voter_id, candidate_id) VALUES (?, ?, ?)',
                [electionId, voterId, candidateId],
                async function (err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            reject(new Error('You have already voted in this election'));
                        } else {
                            reject(err);
                        }
                    } else {
                        await incrementVote(candidateId);
                        resolve({ voteId: this.lastID });
                    }
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

function countRealVoters(electionId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT COUNT(*) as count FROM voters WHERE election_id = ? AND is_fake = 0',
            [electionId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.count : 0);
            }
        );
    });
}

// ==================== RESULTS & FRAUD ====================

function getElectionResults(electionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const election = await getElectionById(electionId);
            if (!election) return reject(new Error('Election not found'));

            // Auto-Close Logic
            const now = new Date();
            let justClosed = false;

            if (election.status === 'open' && election.end_date) {
                const endDate = new Date(election.end_date);
                if (now > endDate) {
                    console.log(`[Auto-Close] Closing election ${electionId} (Time expired)`);
                    await updateElectionStatus(electionId, 'closed');
                    election.status = 'closed';
                    justClosed = true;
                }
            }

            const candidates = await getCandidatesByElection(electionId);
            const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

            const resultsWithPercentages = candidates.map(c => ({
                ...c,
                percentage: totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : '0.0'
            }));

            let isTie = false;
            let tiedCandidates = [];
            let leader = null;

            if (candidates.length >= 2 && candidates[0].votes > 0) {
                const maxVotes = candidates[0].votes;
                const topCandidates = candidates.filter(c => c.votes === maxVotes);

                // Tie if more than 1 candidate has maxVotes
                isTie = topCandidates.length > 1;

                if (isTie) {
                    tiedCandidates = topCandidates;
                } else {
                    leader = {
                        ...resultsWithPercentages[0],
                        percentage: totalVotes > 0 ? ((candidates[0].votes / totalVotes) * 100).toFixed(1) : '0.0'
                    };
                }
            }

            // Auto-Runoff Logic
            if (justClosed && isTie) {
                console.log(`[Auto-Runoff] Tie detected in election ${electionId}, creating runoff...`);
                await createRunoffElection(election, tiedCandidates);
            }

            resolve({
                election,
                candidates: resultsWithPercentages,
                totalVotes,
                isTie,
                tiedCandidates,
                leader
            });
        } catch (err) {
            reject(err);
        }
    });
}

function createRunoffElection(originalElection, tiedCandidates) {
    return new Promise(async (resolve, reject) => {
        try {
            const newTitle = `[Runoff] ${originalElection.title}`;
            // Set start now, end in 24h by default for runoff (or same duration as original)
            // For simplicity, let's default to 1 hour for runoffs in this demo context
            const now = new Date();
            const endDate = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

            const runoff = await createElection(
                newTitle,
                `Runoff for election #${originalElection.id}`,
                now.toISOString(),
                endDate.toISOString(),
                (originalElection.round || 1) + 1
            );

            // Copy tied candidates
            for (const cand of tiedCandidates) {
                await addCandidateToElection(runoff.id, cand.name);
            }

            // Auto-open the runoff
            await updateElectionStatus(runoff.id, 'open');
            resolve(runoff);
        } catch (e) {
            console.error('Failed to create runoff', e);
            resolve(null); // Don't fail the results fetch
        }
    });
}

function detectFraud(electionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const realVoterCount = await countRealVoters(electionId);
            const candidates = await getCandidatesByElection(electionId);

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

function addFakeVotes(electionId, candidateId, count) {
    return new Promise(async (resolve, reject) => {
        try {
            const candidate = await getCandidateById(candidateId);
            if (!candidate) return reject(new Error('Candidate not found'));
            if (candidate.election_id !== electionId) return reject(new Error('Candidate not in this election'));

            const timestamp = new Date().toISOString();

            await new Promise((res, rej) => {
                db.run(
                    'UPDATE candidates SET votes = votes + ?, last_vote_timestamp = ? WHERE id = ?',
                    [count, timestamp, candidateId],
                    (err) => err ? rej(err) : res()
                );
            });

            const stmt = db.prepare('INSERT INTO voters (election_id, name, age, is_fake) VALUES (?, ?, 0, 1)');
            for (let i = 0; i < count; i++) {
                stmt.run(electionId, 'Fake');
            }
            stmt.finalize();

            resolve({ candidateId, addedVotes: count });
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    db,
    initializeDatabase,
    generateElectionCode,
    // Settings
    getSetting,
    setSetting,
    // Elections
    createElection,
    getElectionByCode,
    getElectionById,
    getAllElections,
    updateElection,
    updateElectionStatus,
    regenerateElectionCode,
    deleteElection,
    getElectionStats,
    // Candidates
    getCandidatesByElection,
    getCandidateById,
    addCandidateToElection,
    deleteCandidate,
    incrementVote,
    // Voters & Voting
    addVoter,
    hasVoted,
    recordVote,
    countRealVoters,
    // Results & Fraud
    getElectionResults,
    detectFraud,
    addFakeVotes,
    CHART_COLORS
};

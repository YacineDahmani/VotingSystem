const express = require('express');

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value) {
    const normalized = normalizeText(value);
    return normalized ? normalized : null;
}

function normalizeDateValue(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
}

function normalizeCandidateList(candidates) {
    if (!Array.isArray(candidates)) {
        return [];
    }

    return candidates
        .map((candidate) => {
            if (typeof candidate === 'string') {
                return {
                    name: normalizeText(candidate),
                    description: '',
                };
            }

            if (candidate && typeof candidate === 'object') {
                return {
                    name: normalizeText(candidate.name),
                    description: normalizeText(candidate.description),
                };
            }

            return { name: '', description: '' };
        })
        .filter((candidate) => !!candidate.name)
        .sort((a, b) => a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
}

function parseDelimitedLine(line, delimiter = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === '"') {
            if (inQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function detectDelimitedTextFormat(content) {
    const sample = (content || '').split(/\r?\n/).find((line) => line.trim());
    if (!sample) {
        return { delimiter: ',', type: 'csv' };
    }

    const commaCount = (sample.match(/,/g) || []).length;
    const tabCount = (sample.match(/\t/g) || []).length;
    const semicolonCount = (sample.match(/;/g) || []).length;

    if (tabCount > commaCount && tabCount >= semicolonCount) {
        return { delimiter: '\t', type: 'tsv' };
    }

    if (semicolonCount > commaCount) {
        return { delimiter: ';', type: 'csv' };
    }

    return { delimiter: ',', type: 'csv' };
}

function parseStructuredRecords(rawPayload, fallbackKey = 'records') {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return [];
    }

    if (Array.isArray(rawPayload)) {
        return rawPayload;
    }

    if (Array.isArray(rawPayload.records)) {
        return rawPayload.records;
    }

    if (Array.isArray(rawPayload.voters)) {
        return rawPayload.voters;
    }

    if (Array.isArray(rawPayload.candidates)) {
        return rawPayload.candidates;
    }

    if (Array.isArray(rawPayload[fallbackKey])) {
        return rawPayload[fallbackKey];
    }

    return [];
}

function parseDataContent(input) {
    const content = typeof input?.content === 'string' ? input.content : '';
    const fileName = normalizeText(input?.fileName).toLowerCase();
    const explicitFormat = normalizeText(input?.format).toLowerCase();

    if (!content.trim()) {
        return { format: explicitFormat || 'unknown', records: [] };
    }

    const asJson = () => {
        const parsed = JSON.parse(content);
        const records = parseStructuredRecords(parsed);
        return { format: 'json', records };
    };

    if (explicitFormat === 'json' || fileName.endsWith('.json')) {
        return asJson();
    }

    if (explicitFormat === 'ndjson' || fileName.endsWith('.ndjson')) {
        const records = content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        return { format: 'ndjson', records };
    }

    try {
        return asJson();
    } catch {
        const { delimiter, type } = detectDelimitedTextFormat(content);
        const rows = content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => parseDelimitedLine(line, delimiter));

        if (!rows.length) {
            return { format: type, records: [] };
        }

        const headers = rows[0].map((header) => normalizeText(header).toLowerCase());
        const records = rows.slice(1).map((row) => {
            const item = {};
            headers.forEach((header, index) => {
                item[header] = row[index] ?? '';
            });
            return item;
        });

        return { format: type, records };
    }
}

function normalizeVoterImportRecords(rawRecords) {
    if (!Array.isArray(rawRecords)) {
        return [];
    }

    return rawRecords
        .map((record) => {
            if (!record || typeof record !== 'object') {
                return null;
            }

            const rawName = record.name ?? record.full_name ?? record.fullName;
            const rawIdentifier = record.id ?? record.identifier ?? record.voterId ?? record.voter_id ?? record.code;
            const rawBirthdate = record.birthdate ?? record.birthday ?? record.dob ?? record.date_of_birth;

            const normalizedBirthdate = normalizeText(rawBirthdate);
            const parsedBirthdate = normalizeDateValue(normalizedBirthdate);

            return {
                name: normalizeNullableText(rawName),
                identifier: normalizeNullableText(rawIdentifier),
                birthdate: parsedBirthdate ? parsedBirthdate.slice(0, 10) : null,
            };
        })
        .filter((record) => !!record)
        .filter((record) => record.name || record.identifier || record.birthdate);
}

function normalizeCandidateImportRecords(rawRecords) {
    if (!Array.isArray(rawRecords)) {
        return [];
    }

    return rawRecords
        .map((record) => {
            if (!record || typeof record !== 'object') {
                return null;
            }

            const name = normalizeText(record.name ?? record.candidate ?? record.title);
            const description = normalizeText(record.description ?? record.summary ?? record.statement);

            if (!name) {
                return null;
            }

            return { name, description };
        })
        .filter((record) => !!record);
}

function parseMaxVoters(value) {
    if (value === undefined) {
        return { isProvided: false, value: null };
    }

    if (value === null || value === '') {
        return { isProvided: true, value: null };
    }

    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        throw new Error('max_voters must be a positive integer or null');
    }

    return { isProvided: true, value: parsed };
}

function buildElectionSignature({ title, description, startDate, endDate, candidates }) {
    return JSON.stringify({
        title: normalizeText(title).toLowerCase(),
        description: normalizeText(description).toLowerCase(),
        startDate: normalizeDateValue(startDate),
        endDate: normalizeDateValue(endDate),
        candidates: normalizeCandidateList(candidates).map((candidate) => ({
            name: candidate.name.toLowerCase(),
            description: candidate.description.toLowerCase(),
        })),
    });
}

function createAdminRoutes({ db, issueAuthToken, requireAdminAuth, emitElectionUpdate, adminMasterKey }) {
    const router = express.Router();

    router.post('/login', async (req, res) => {
        try {
            const { password } = req.body;

            if (password === adminMasterKey) {
                const token = issueAuthToken({ role: 'admin' });
                return res.json({ success: true, message: 'Admin authenticated', token });
            }

            return res.status(401).json({ error: 'Wrong password' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.use(requireAdminAuth);

    router.get('/elections', async (req, res) => {
        try {
            const elections = await db.getAllElections();
            const electionsWithStats = await Promise.all(elections.map(async (election) => {
                const stats = await db.getElectionStats(election.id);
                return { ...election, ...stats };
            }));

            return res.json({ elections: electionsWithStats });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections', async (req, res) => {
        try {
            const {
                title,
                description,
                candidates,
                start_date: startDate,
                end_date: endDate,
                replace_existing: replaceExisting,
                max_voters: maxVotersInput,
                voter_rules: voterRulesInput,
            } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Election title is required' });
            }

            const normalizedCandidates = normalizeCandidateList(candidates);
            if (!normalizedCandidates.length) {
                return res.status(400).json({ error: 'At least one candidate is required' });
            }

            const parsedMaxVoters = parseMaxVoters(maxVotersInput);

            const requestedSignature = buildElectionSignature({
                title,
                description,
                startDate,
                endDate,
                candidates: normalizedCandidates,
            });

            const existingElections = await db.getAllElections();
            const duplicateMatches = [];

            for (const existingElection of existingElections) {
                const existingCandidates = await db.getCandidatesByElection(existingElection.id);
                const existingSignature = buildElectionSignature({
                    title: existingElection.title,
                    description: existingElection.description,
                    startDate: existingElection.start_date,
                    endDate: existingElection.end_date,
                    candidates: existingCandidates,
                });

                if (existingSignature === requestedSignature) {
                    duplicateMatches.push(existingElection);
                }
            }

            if (duplicateMatches.length && !replaceExisting) {
                const latestDuplicate = duplicateMatches[0];
                return res.status(409).json({
                    error: 'A matching voting session already exists. Clear or replace it before creating another one.',
                    duplicateSession: {
                        id: latestDuplicate.id,
                        title: latestDuplicate.title,
                        code: latestDuplicate.code,
                        status: latestDuplicate.status,
                    },
                });
            }

            if (duplicateMatches.length && replaceExisting) {
                for (const duplicate of duplicateMatches) {
                    await db.deleteElection(duplicate.id);
                }
            }

            const election = await db.createElection(
                title,
                description,
                startDate,
                endDate,
                1,
                parsedMaxVoters.value,
            );

            for (const candidate of normalizedCandidates) {
                await db.addCandidateToElection(election.id, candidate.name, candidate.description || '');
            }

            const normalizedVoterRules = normalizeVoterImportRecords(voterRulesInput);
            if (normalizedVoterRules.length) {
                await db.replaceElectionEligibilityRules(election.id, normalizedVoterRules);
            }

            if (replaceExisting && duplicateMatches.length) {
                return res.json({
                    success: true,
                    election,
                    replaced: duplicateMatches.map((item) => ({
                        id: item.id,
                        title: item.title,
                        code: item.code,
                        status: item.status,
                    })),
                });
            }

            return res.json({ success: true, election });
        } catch (err) {
            if (err?.message && err.message.includes('max_voters')) {
                return res.status(400).json({ error: err.message });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    router.put('/elections/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const updates = { ...req.body };

            if (Object.prototype.hasOwnProperty.call(updates, 'max_voters')) {
                const parsedMaxVoters = parseMaxVoters(updates.max_voters);
                updates.max_voters = parsedMaxVoters.value;
            }

            await db.updateElection(id, updates);
            const election = await db.getElectionById(id);

            return res.json({ success: true, election });
        } catch (err) {
            if (err?.message && err.message.includes('max_voters')) {
                return res.status(400).json({ error: err.message });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    router.patch('/elections/:id/status', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const { status } = req.body;

            await db.updateElectionStatus(id, status);
            await emitElectionUpdate(id, 'election:status');
            return res.json({ success: true, status });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/regenerate-code', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const newCode = await db.regenerateElectionCode(id);
            return res.json({ success: true, code: newCode });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.delete('/elections/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            await db.deleteElection(id);
            return res.json({ success: true, message: 'Election deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/candidates', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const election = await db.getElectionById(electionId);
            if (!election) {
                return res.status(404).json({ error: 'Election not found' });
            }

            const { name, description = '' } = req.body;
            const normalizedName = normalizeText(name);

            if (!normalizedName) {
                return res.status(400).json({ error: 'Candidate name is required' });
            }

            const candidate = await db.addCandidateToElection(electionId, normalizedName, normalizeText(description));
            await emitElectionUpdate(electionId, 'election:candidates');
            return res.json({ success: true, candidate });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/import-voters', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const election = await db.getElectionById(electionId);
            if (!election) {
                return res.status(404).json({ error: 'Election not found' });
            }

            const { replaceExisting = true } = req.body;
            const { records } = parseDataContent(req.body);
            const normalizedRecords = normalizeVoterImportRecords(records);

            if (!normalizedRecords.length) {
                return res.status(400).json({ error: 'No valid voter records found in file' });
            }

            if (replaceExisting) {
                await db.replaceElectionEligibilityRules(electionId, normalizedRecords);
            } else {
                await db.appendElectionEligibilityRules(electionId, normalizedRecords);
            }

            const totalRules = await db.getElectionEligibilityRuleCount(electionId);
            return res.json({
                success: true,
                imported: normalizedRecords.length,
                totalRules,
                mode: replaceExisting ? 'replace' : 'append',
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/import-candidates', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const election = await db.getElectionById(electionId);
            if (!election) {
                return res.status(404).json({ error: 'Election not found' });
            }

            const { replaceExisting = false } = req.body;
            const { records } = parseDataContent(req.body);
            const normalizedCandidates = normalizeCandidateImportRecords(records);

            if (!normalizedCandidates.length) {
                return res.status(400).json({ error: 'No valid candidate records found in file' });
            }

            if (replaceExisting) {
                const existingCandidates = await db.getCandidatesByElection(electionId);
                for (const candidate of existingCandidates) {
                    await db.deleteCandidate(candidate.id);
                }
            }

            for (const candidate of normalizedCandidates) {
                await db.addCandidateToElection(electionId, candidate.name, candidate.description);
            }

            const nextCandidates = await db.getCandidatesByElection(electionId);
            await emitElectionUpdate(electionId, 'election:candidates');
            return res.json({
                success: true,
                imported: normalizedCandidates.length,
                totalCandidates: nextCandidates.length,
                mode: replaceExisting ? 'replace' : 'append',
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.delete('/candidates/:id', async (req, res) => {
        try {
            const id = Number.parseInt(req.params.id, 10);
            const candidate = await db.getCandidateById(id);
            if (!candidate) {
                return res.status(404).json({ error: 'Candidate not found' });
            }

            await db.deleteCandidate(id);
            await emitElectionUpdate(candidate.election_id, 'election:candidates');
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/elections/:id/fake-votes', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const { candidateId, count } = req.body;

            const parsedCount = Number.parseInt(count, 10);
            if (!candidateId || Number.isNaN(parsedCount) || parsedCount <= 0) {
                return res.status(400).json({ error: 'candidateId and positive count are required' });
            }

            await db.addFakeVotes(electionId, candidateId, parsedCount);
            const results = await emitElectionUpdate(electionId, 'vote:kick');
            const integrity = await db.getElectionIntegrityReport(electionId);

            return res.json({ success: true, ...results, integrity });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/integrity-report', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.getElectionIntegrityReport(electionId);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/fake-voters', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.getFakeVoterAudit(electionId);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/elections/:id/fraud', async (req, res) => {
        try {
            const electionId = Number.parseInt(req.params.id, 10);
            const data = await db.detectFraud(electionId);
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = {
    createAdminRoutes,
};

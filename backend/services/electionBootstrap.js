async function ensureDefaultElection(db) {
    const activeElection = await db.getActiveElection();
    if (activeElection) {
        return activeElection;
    }

    const now = new Date();
    const end = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    const election = await db.createElection(
        'Editorial Ballot 2026',
        'Analog Swiss ceremonial election session',
        now.toISOString(),
        end.toISOString(),
        1,
    );

    const seedCandidates = [
        'Julian Thorne',
        'Elena Vance',
        'Marcus Aris',
        'Sienna Blake',
    ];

    for (const candidateName of seedCandidates) {
        await db.addCandidateToElection(election.id, candidateName);
    }

    await db.updateElectionStatus(election.id, 'open');
    return db.getElectionById(election.id);
}

module.exports = {
    ensureDefaultElection,
};

async function ensureDefaultElection(db) {
    const activeElection = await db.getActiveElection();
    if (activeElection) {
        return activeElection;
    }

    const now = new Date();
    const end = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    const election = await db.createElection(
        'Municipal Council 2026',
        'Annual municipal administration and public council election',
        now.toISOString(),
        end.toISOString(),
        1,
    );

    const seedCandidates = [
        { name: 'Helena Vane', description: 'Public transit electrification and urban pedestrian zones.' },
        { name: 'Dr. Arthur Pendelton', description: 'Municipal budget oversight and renewable energy infrastructure.' },
        { name: 'Marcella Dubois', description: 'Civic digital archives and educational facility modernization.' },
        { name: 'Julian Althaus', description: 'Heritage preservation and local enterprise development.' },
    ];

    for (const candidate of seedCandidates) {
        await db.addCandidateToElection(election.id, candidate.name, candidate.description);
    }

    await db.updateElectionStatus(election.id, 'open');
    return db.getElectionById(election.id);
}

module.exports = {
    ensureDefaultElection,
};

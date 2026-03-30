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
        { name: 'Yacine Dahmani', description: 'Progressive policies for a better tomorrow.' },
        { name: 'Abdelmadjid Tebboune', description: 'Experience and stability you can trust.' },
        { name: 'Donald Trump', description: 'A fresh perspective on economic reform.' },
        { name: 'Lionel Messi', description: 'Dedicated to education and healthcare.' },
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

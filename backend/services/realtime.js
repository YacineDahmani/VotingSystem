function configureSocket(io) {
    io.on('connection', (socket) => {
        socket.on('election:watch', (electionId) => {
            const id = Number.parseInt(electionId, 10);
            if (!Number.isNaN(id)) {
                socket.join(`election:${id}`);
            }
        });
    });
}

function createElectionEmitter({ io, db }) {
    return async function emitElectionUpdate(electionId, eventType = 'vote:kick') {
        const results = await db.getElectionResults(electionId);
        const payload = {
            electionId,
            totalVotes: results.totalVotes,
            status: results.election.status,
            candidates: results.candidates,
        };

        io.to(`election:${electionId}`).emit('election:update', payload);
        io.to(`election:${electionId}`).emit(eventType, { electionId, totalVotes: results.totalVotes });

        if (results.election.status === 'closed') {
            io.to(`election:${electionId}`).emit('election:closed', { electionId });
        }

        return results;
    };
}

module.exports = {
    configureSocket,
    createElectionEmitter,
};

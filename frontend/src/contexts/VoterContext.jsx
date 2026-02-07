import { createContext, useContext, useState, useEffect } from 'react';

const VoterContext = createContext(null);

export const VoterProvider = ({ children }) => {
    const [voterSession, setVoterSession] = useState(null);
    const [activeElectionCode, setActiveElectionCode] = useState(null);

    // Restore session on mount if valid
    useEffect(() => {
        // Logic to restore could go here, but since we handle multiple elections,
        // we might just keep it simple in memory or handle per-election storage in components.
        // For now, simple state.
    }, []);

    const loginVoter = (electionId, voterData) => {
        setVoterSession({ electionId, ...voterData });
        sessionStorage.setItem(`voter_${electionId}`, JSON.stringify(voterData));
    };

    const logoutVoter = () => {
        setVoterSession(null);
    };

    return (
        <VoterContext.Provider value={{ voterSession, activeElectionCode, setActiveElectionCode, loginVoter, logoutVoter }}>
            {children}
        </VoterContext.Provider>
    );
};

export const useVoter = () => {
    const context = useContext(VoterContext);
    if (!context) throw new Error('useVoter must be used within a VoterProvider');
    return context;
};

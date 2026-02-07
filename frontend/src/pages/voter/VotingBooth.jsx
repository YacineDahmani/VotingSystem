import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useElection, useRegisterVoter, useCastVote } from '@/lib/api'; // Removed useVoter import conflict
import { useVoter as useVoterContext } from '@/contexts/VoterContext'; // Renamed import
import { useToast } from '@/contexts/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BallotCard } from '@/components/election/BallotCard';
import { ResultsChart } from '@/components/election/ResultsChart';
import { Skeleton } from '@/components/ui/Skeleton';
import { UserCheck, AlertCircle } from 'lucide-react';

export default function VotingBooth() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { voterSession, loginVoter } = useVoterContext();
    const { addToast } = useToast();

    const { data: electionData, isLoading } = useElection(id);
    const registerMutation = useRegisterVoter();
    const castVoteMutation = useCastVote();

    const [regForm, setRegForm] = useState({ name: '', age: '', identifier: '' });
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);

    // Check if session exists for this election
    useEffect(() => {
        if (voterSession?.electionId && voterSession.electionId !== parseInt(id)) {
            // Different election session? Reset or redirect?
            // For now, let's assume if they have session for THIS election, use it.
        }
    }, [voterSession, id]);

    const onRegister = async (e) => {
        e.preventDefault();
        if (parseInt(regForm.age) < 18) {
            addToast('You must be 18+ to vote', 'error');
            return;
        }

        try {
            const data = await registerMutation.mutateAsync({
                electionId: id,
                name: regForm.name,
                age: parseInt(regForm.age),
                identifier: regForm.identifier
            });
            loginVoter(parseInt(id), { ...data.voter, hasVoted: false });
            addToast('Registration successful', 'success');
        } catch (error) {
            addToast(error.response?.data?.error || 'Registration failed', 'error');
        }
    };

    const onVote = async () => {
        if (!selectedCandidate) return;
        try {
            await castVoteMutation.mutateAsync({
                electionId: parseInt(id),
                candidateId: selectedCandidate,
                voterId: voterSession.id
            });
            setHasVoted(true);
            // Update session
            loginVoter(parseInt(id), { ...voterSession, hasVoted: true });
            addToast('Vote cast successfully!', 'success');
        } catch (error) {
            addToast(error.response?.data?.error || 'Failed to cast vote', 'error');
            if (error.response?.data?.error?.includes('already voted')) {
                setHasVoted(true);
            }
        }
    };

    if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
    if (!electionData) return <div className="p-8 text-center">Election not found</div>;

    const { election, candidates, isTie, leader } = electionData;
    const isRegistered = !!voterSession?.id;
    const showResults = hasVoted || election.status === 'closed' || voterSession?.hasVoted;

    // Header Title
    const Header = () => (
        <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">{election.title}</h1>
            <p className="text-slate-400">{election.description}</p>
        </div>
    );

    // 1. Registration View
    if (!isRegistered) {
        return (
            <div className="space-y-6">
                <Header />
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserCheck className="text-sky-500" /> Voter Registration
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onRegister} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Full Name</label>
                                <Input
                                    required
                                    value={regForm.name}
                                    onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Age</label>
                                <Input
                                    required
                                    type="number"
                                    min="18"
                                    value={regForm.age}
                                    onChange={e => setRegForm({ ...regForm, age: e.target.value })}
                                    placeholder="18"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Voter ID / Student ID</label>
                                <Input
                                    required
                                    value={regForm.identifier}
                                    onChange={e => setRegForm({ ...regForm, identifier: e.target.value })}
                                    placeholder="ID-12345"
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                                Proceed to Vote
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 2. Results View (Post-Vote)
    if (showResults) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <Header />

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full mb-4">
                        <UserCheck size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Thank you for voting!</h2>
                    <p className="text-slate-400">Your vote has been securely recorded.</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Live Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResultsChart candidates={candidates} totalVotes={electionData.totalVotes} realVoterCount={electionData.totalVotes} />
                        {/* passing totalVotes as realVoterCount just for vis if backend doesn't send it in this payload, 
                        actually fetchElection (results) returns electionData which might NOT have realVoterCount unless we fetch it. 
                        Safe default. */}
                    </CardContent>
                </Card>

                <div className="text-center">
                    <Button variant="outline" onClick={() => navigate('/')}>Return to Home</Button>
                </div>
            </div>
        );
    }

    // 3. Voting View
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <Header />

            <div className="bg-sky-500/10 border border-sky-500/20 p-4 rounded-lg flex items-start gap-3 mb-6">
                <AlertCircle className="text-sky-500 shrink-0 mt-0.5" />
                <div className="text-sm text-sky-200">
                    <p className="font-bold">Select your candidate carefully.</p>
                    <p className="opacity-80">You cannot change your vote once submitted.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {candidates.map(candidate => (
                    <BallotCard
                        key={candidate.id}
                        candidate={candidate}
                        onVote={() => setSelectedCandidate(candidate.id)}
                        isSelected={selectedCandidate === candidate.id}
                        disabled={castVoteMutation.isPending}
                    />
                ))}
            </div>

            {selectedCandidate && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-center animate-in slide-in-from-bottom-full">
                    <div className="w-full max-w-md">
                        <Button
                            size="lg"
                            className="w-full text-lg shadow-xl shadow-sky-500/20"
                            onClick={onVote}
                            disabled={castVoteMutation.isPending}
                        >
                            {castVoteMutation.isPending ? 'Submitting...' : 'Confirm & Cast Vote'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

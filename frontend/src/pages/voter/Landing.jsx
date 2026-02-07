import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJoinElection } from '@/lib/api';
import { useVoter } from '@/contexts/VoterContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Lock } from 'lucide-react';

export default function Landing() {
    const [code, setCode] = useState('');
    const joinMutation = useJoinElection();
    const { loginVoter } = useVoter();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!code.trim()) return;

        try {
            const { election } = await joinMutation.mutateAsync(code);
            // Initialize voter session (even without voter ID yet)
            loginVoter(election.id, { electionCode: code });
            addToast(`Joined ${election.title}`, 'success');
            navigate(`/vote/${election.id}`);
        } catch (error) {
            addToast(error.response?.data?.error || 'Invalid election code', 'error');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500 rounded-2xl shadow-lg shadow-sky-500/20 mb-4 transform rotate-3">
                    <span className="text-3xl font-bold text-white">V</span>
                </div>
                <h1 className="text-4xl font-bold text-white tracking-tight">SecureVote</h1>
                <p className="text-slate-400">Enter your secure election code to begin.</p>
            </div>

            <Card className="w-full max-w-md bg-slate-900/50 backdrop-blur-sm border-slate-700">
                <CardContent className="p-8">
                    <form onSubmit={handleJoin} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Election Code</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 text-slate-500" size={18} />
                                <Input
                                    value={code}
                                    onChange={e => setCode(e.target.value.toUpperCase())}
                                    placeholder="e.g. AB12XY"
                                    className="pl-10 text-center font-mono tracking-widest text-lg uppercase"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-12 text-lg font-semibold"
                            disabled={joinMutation.isPending}
                        >
                            {joinMutation.isPending ? 'Verifying...' : 'Access Election'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

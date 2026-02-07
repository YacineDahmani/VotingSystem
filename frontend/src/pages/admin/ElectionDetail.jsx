import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useElection, useUpdateElectionStatus, useRegenerateCode, useFraudDetection } from '@/lib/api';
import { CandidateList } from '@/components/admin/CandidateList';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { RefreshCw, Play, Square, AlertTriangle, Terminal, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ElectionDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: electionData, isLoading } = useElection(id);
    const { data: fraudData } = useFraudDetection(id);

    const statusMutation = useUpdateElectionStatus();
    const codeMutation = useRegenerateCode();
    const { addToast } = useToast();

    const [isDevMode, setIsDevMode] = useState(false);

    if (isLoading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
    if (!electionData) return <div className="p-8">Election not found</div>;

    const { election, candidates, leader, isTie } = electionData;

    const handleStatusChange = async (newStatus) => {
        try {
            await statusMutation.mutateAsync({ id, status: newStatus });
            addToast(`Election ${newStatus}`, 'success');
        } catch (error) {
            addToast('Failed to update status', 'error');
        }
    };

    const handleRegenCode = async () => {
        if (!confirm('Regenerate code? The old code will stop working.')) return;
        try {
            await codeMutation.mutateAsync(id);
            addToast('Code regenerated', 'success');
        } catch (error) {
            addToast('Failed to regenerate code', 'error');
        }
    };

    // Fraud Detection Logic
    const suspiciousCandidates = fraudData?.candidates?.filter(c => c.fraud_suspected) || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <Link to="/admin/elections" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2 text-sm">
                        <ArrowLeft size={16} /> Back to Elections
                    </Link>
                    <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        {election.title}
                        <Badge variant={
                            election.status === 'open' ? 'success' :
                                election.status === 'closed' ? 'danger' : 'default'
                        }>
                            {election.status}
                        </Badge>
                    </h2>
                    <p className="text-slate-400 font-mono text-sm mt-1 flex items-center gap-2">
                        Code: <span className="text-sky-400 font-bold">{election.code}</span>
                        <button onClick={handleRegenCode} className="text-slate-500 hover:text-white" title="Regenerate Code">
                            <RefreshCw size={14} />
                        </button>
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4">
                        <span className="text-xs text-slate-500 uppercase font-bold">Dev Mode</span>
                        <button
                            onClick={() => setIsDevMode(!isDevMode)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${isDevMode ? 'bg-amber-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isDevMode ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>

                    {election.status === 'draft' || election.status === 'closed' ? (
                        <Button onClick={() => handleStatusChange('open')} className="bg-emerald-600 hover:bg-emerald-500">
                            <Play size={18} className="mr-2" /> Start Election
                        </Button>
                    ) : (
                        <Button onClick={() => handleStatusChange('closed')} variant="destructive">
                            <Square size={18} className="mr-2 fill-current" /> End Election
                        </Button>
                    )}
                </div>
            </div>

            {/* Fraud Alert */}
            {suspiciousCandidates.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-4 animate-in slide-in-from-top-2">
                    <AlertTriangle className="text-red-500 shrink-0" />
                    <div>
                        <h4 className="text-red-400 font-bold">Fraud Pattern Detected</h4>
                        <p className="text-sm text-red-300/80">
                            The following candidates have more votes than verified voters in the system:
                        </p>
                        <ul className="list-disc list-inside text-sm text-red-300 mt-1">
                            {suspiciousCandidates.map(c => <li key={c.id}>{c.name}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
                {/* Main Stats / Results */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Live Results</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {candidates.map(candidate => {
                                const isSuspicious = suspiciousCandidates.some(sc => sc.id === candidate.id);
                                return (
                                    <div key={candidate.id} className={`space-y-2 ${isSuspicious ? 'p-2 rounded border border-amber-500/30 bg-amber-500/5' : ''}`}>
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium text-slate-200 flex items-center gap-2">
                                                {candidate.name}
                                                {isSuspicious && <Badge variant="warning" className="text-[10px] h-4 px-1">SUSPICIOUS</Badge>}
                                                {leader?.id === candidate.id && election.status === 'closed' && <Badge variant="success" className="text-[10px] h-4 px-1">WINNER</Badge>}
                                            </span>
                                            <span className="text-slate-400">{candidate.votes} ({candidate.percentage}%)</span>
                                        </div>
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 ${isSuspicious ? 'bg-amber-500' : 'bg-sky-500'}`}
                                                style={{ width: `${candidate.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="text-3xl font-bold text-white">{electionData.totalVotes}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Total Votes</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="text-3xl font-bold text-white">{fraudData?.realVoterCount || 0}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Active Voters</div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Sidebar Controls */}
                <div className="space-y-6">
                    <CandidateList electionId={id} candidates={candidates} isDevMode={isDevMode} />

                    {isDevMode && (
                        <Card className="border-amber-500/20 bg-amber-950/10">
                            <CardHeader>
                                <CardTitle className="text-amber-500 flex items-center gap-2">
                                    <Terminal size={18} /> Developer Console
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-amber-400/80 mb-2">
                                    Injecting votes bypasses voter verification. Use for testing fraud detection.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

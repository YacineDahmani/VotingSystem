import { useState } from 'react';
import { useAddCandidate, useDeleteCandidate, useAddFakeVotes } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Trash2, UserPlus, Zap } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export function CandidateList({ electionId, candidates, isDevMode }) {
    const [newName, setNewName] = useState('');
    const addMutation = useAddCandidate();
    const deleteMutation = useDeleteCandidate();
    const fakeVoteMutation = useAddFakeVotes();
    const { addToast } = useToast();

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            await addMutation.mutateAsync({ electionId, name: newName });
            setNewName('');
            addToast('Candidate added', 'success');
        } catch (error) {
            addToast('Failed to add candidate', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this candidate?')) return;
        try {
            await deleteMutation.mutateAsync(id);
            addToast('Candidate deleted', 'success');
            // Force refresh or relying on query invalidation
            window.location.reload(); // Quick fix for query invalidation without passing electionId to delete hook cleanly
        } catch (error) {
            addToast('Failed to delete', 'error');
        }
    };

    const handleFakeVote = async (candidateId) => {
        try {
            await fakeVoteMutation.mutateAsync({ electionId, candidateId, count: 1 });
            addToast('+1 Fake Vote added', 'info');
        } catch (error) {
            addToast('Failed to add fake vote', 'error');
        }
    };

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <form onSubmit={handleAdd} className="flex gap-2">
                    <Input
                        placeholder="Candidate Name"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <Button type="submit" size="icon" disabled={addMutation.isPending}>
                        <UserPlus size={18} />
                    </Button>
                </form>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {candidates?.map(candidate => (
                        <div key={candidate.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                                    style={{ backgroundColor: candidate.color_code }}
                                >
                                    {candidate.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-200">{candidate.name}</p>
                                    <p className="text-xs text-slate-500">{candidate.votes} votes</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isDevMode && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                        title="Add Fake Vote"
                                        onClick={() => handleFakeVote(candidate.id)}
                                    >
                                        <Zap size={16} />
                                    </Button>
                                )}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => handleDelete(candidate.id)}
                                >
                                    <Trash2 size={16} />
                                </Button>
                            </div>
                        </div>
                    ))}
                    {candidates?.length === 0 && (
                        <p className="text-center text-slate-500 text-sm py-4">No candidates yet.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

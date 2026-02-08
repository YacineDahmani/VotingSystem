import { useState } from 'react';
import { useCreateElection } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export function CreateElectionModal({ isOpen, onClose }) {
    const [formData, setFormData] = useState(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return {
            title: '',
            description: '',
            candidates: '',
            start_date: now.toISOString().slice(0, 16),
            end_date: tomorrow.toISOString().slice(0, 16)
        };
    });

    const createMutation = useCreateElection();
    const { addToast } = useToast();

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const candidatesList = formData.candidates.split('\n').map(c => c.trim()).filter(Boolean);
            await createMutation.mutateAsync({
                ...formData,
                candidates: candidatesList
            });
            addToast('Election created successfully', 'success');
            onClose();
        } catch (error) {
            addToast(error.response?.data?.error || 'Failed to create election', 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <Card className="w-full max-w-lg bg-slate-900 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Create New Election</CardTitle>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Election Title</label>
                            <Input
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g. Student Council 2026"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Description</label>
                            <Input
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional description"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Start Date</label>
                                <Input
                                    type="datetime-local"
                                    value={formData.start_date}
                                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">End Date</label>
                                <Input
                                    type="datetime-local"
                                    value={formData.end_date}
                                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Candidates (One per line)</label>
                            <textarea
                                className="w-full h-32 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                placeholder="Alice Smith&#10;Bob Jones&#10;Charlie Brown"
                                value={formData.candidates}
                                onChange={e => setFormData({ ...formData, candidates: e.target.value })}
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending ? 'Creating...' : 'Launch Election'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

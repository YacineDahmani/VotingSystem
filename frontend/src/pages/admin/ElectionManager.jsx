import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminElections } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { CreateElectionModal } from '@/components/admin/CreateElectionModal';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, MoreHorizontal, ChevronRight } from 'lucide-react';

export default function ElectionManager() {
    const { data: elections, isLoading } = useAdminElections();
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Elections</h2>
                    <p className="text-slate-400">Manage voting events and candidates</p>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} className="mr-2" />
                    Create Election
                </Button>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b [&_tr]:border-slate-800">
                                <tr className="border-b border-slate-800 transition-colors hover:bg-slate-800/50 data-[state=selected]:bg-slate-800">
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400">Title</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400">Code</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400">Status</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400 text-right">Votes</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400 text-right">Candidates</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-400"></th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {isLoading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <tr key={i} className="border-b border-slate-800">
                                            <td className="p-4"><Skeleton className="h-4 w-[250px]" /></td>
                                            <td className="p-4"><Skeleton className="h-4 w-[100px]" /></td>
                                            <td className="p-4"><Skeleton className="h-4 w-[80px]" /></td>
                                            <td className="p-4"><Skeleton className="h-4 w-[50px] ml-auto" /></td>
                                            <td className="p-4"><Skeleton className="h-4 w-[50px] ml-auto" /></td>
                                            <td className="p-4"></td>
                                        </tr>
                                    ))
                                ) : elections?.map((election) => (
                                    <tr key={election.id} className="border-b border-slate-800 transition-colors hover:bg-slate-800/50">
                                        <td className="p-4 font-medium text-slate-200">
                                            {election.title}
                                            {election.round > 1 && <span className="ml-2 text-xs text-slate-500">(Round {election.round})</span>}
                                        </td>
                                        <td className="p-4 font-mono text-xs text-slate-400">{election.code}</td>
                                        <td className="p-4">
                                            <Badge variant={
                                                election.status === 'open' ? 'success' :
                                                    election.status === 'closed' ? 'danger' : 'default'
                                            }>
                                                {election.status}
                                            </Badge>
                                        </td>
                                        <td className="p-4 text-right">{election.total_votes || 0}</td>
                                        <td className="p-4 text-right">{election.candidate_count || 0}</td>
                                        <td className="p-4 text-right">
                                            <Link to={`/admin/elections/${election.id}`}>
                                                <Button variant="ghost" size="sm">
                                                    Manage <ChevronRight size={16} className="ml-1" />
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {elections?.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            No elections found. Create one to get started.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <CreateElectionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
}

import { Link } from 'react-router-dom';
import { useAdminElections, useSystemStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Activity, Users, Vote, Server } from 'lucide-react';

export default function DashboardHome() {
    const { data: elections, isLoading: loadingElections } = useAdminElections();
    const { data: status, isLoading: loadingStatus } = useSystemStatus();

    // Aggregate stats
    const totalVotes = elections?.reduce((acc, curr) => acc + (curr.total_votes || 0), 0) || 0;
    const activeElections = elections?.filter(e => e.status === 'open').length || 0;
    const totalCandidates = elections?.reduce((acc, curr) => acc + (curr.candidate_count || 0), 0) || 0;

    const StatCard = ({ title, value, icon: Icon, color, loading }) => (
        <Card>
            <CardContent className="flex items-center p-6">
                <div className={`p-4 rounded-full bg-${color}-500/10 text-${color}-500 mr-4`}>
                    <Icon size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-400">{title}</p>
                    {loading ? (
                        <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                        <h3 className="text-2xl font-bold text-slate-100">{value}</h3>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">System Overview</h2>
                <p className="text-slate-400">Real-time monitoring of voting infrastructure</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Active Elections"
                    value={activeElections}
                    icon={Activity}
                    color="emerald"
                    loading={loadingElections}
                />
                <StatCard
                    title="Total Votes Cast"
                    value={totalVotes.toLocaleString()}
                    icon={Vote}
                    color="sky"
                    loading={loadingElections}
                />
                <StatCard
                    title="Candidates"
                    value={totalCandidates}
                    icon={Users}
                    color="purple"
                    loading={loadingElections}
                />
                <StatCard
                    title="System Status"
                    value={status?.status === 'online' ? 'Healthy' : 'Issues'}
                    icon={Server}
                    color={status?.status === 'online' ? 'emerald' : 'amber'}
                    loading={loadingStatus}
                />
            </div>

            {/* Recent Activity Placeholder (User asked for it, but API doesn't support a log yet. 
          The backend only has elections list. I will use a dummy placeholder or list recent elections) */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Recent Elections</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {loadingElections ? Array(3).fill(0).map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 round-full" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-[200px]" />
                                        <Skeleton className="h-4 w-[150px]" />
                                    </div>
                                </div>
                            )) : elections?.slice(0, 5).map(election => (
                                <div key={election.id} className="flex items-center justify-between p-2 hover:bg-slate-900/50 rounded-lg transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2 h-2 rounded-full ${election.status === 'open' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                                        <div>
                                            <p className="text-sm font-medium text-white">{election.title}</p>
                                            <p className="text-xs text-slate-500">{election.code}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-slate-400 font-mono">
                                        {election.total_votes} votes
                                    </div>
                                </div>
                            ))}
                            {elections?.length === 0 && (
                                <p className="text-sm text-slate-500 text-center py-4">No elections found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Quick links to actions */}
                        <p className="text-sm text-slate-400">Manage your deployment directly from here.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <Link to="/admin/elections" className="p-4 bg-slate-900 rounded-lg border border-slate-800 text-center hover:bg-slate-800 transition-colors block">
                                <Vote className="mx-auto mb-2 text-sky-500" />
                                <span className="text-xs text-slate-300">New Election</span>
                            </Link>
                            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 text-center opacity-50 cursor-not-allowed" title="Coming Soon">
                                <Users className="mx-auto mb-2 text-purple-500" />
                                <span className="text-xs text-slate-300">Voters</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

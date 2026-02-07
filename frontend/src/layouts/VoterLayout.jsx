import { Outlet } from 'react-router-dom';
import { useVoter } from '@/contexts/VoterContext';
import { useElection } from '@/lib/api';
import { ElectionTimer } from '@/components/election/ElectionTimer';
import { ShieldCheck, HelpCircle, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function VoterLayout() {
    const { voterSession } = useVoter();
    const electionId = voterSession?.electionId;
    const { data: election } = useElection(electionId);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30 flex flex-col md:flex-row">

            {/* Sidebar Info Panel (Hidden on mobile initally, but let's show it for layout completeness) */}
            <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/30 p-6 flex flex-col gap-8 order-2 md:order-1">
                <div className="hidden md:block">
                    <h1 className="text-xl font-bold text-white mb-1">SecureVote</h1>
                    <p className="text-sm text-slate-500">Official Voting Portal</p>
                </div>

                {election && (
                    <div className="space-y-6">
                        <ElectionTimer election={election} />

                        <div className="space-y-4">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Election Rules</span>
                            <Card className="bg-slate-900/50 border-slate-700/50 p-4 space-y-3 text-sm text-slate-400">
                                <div className="flex gap-3">
                                    <ShieldCheck size={18} className="text-sky-500 shrink-0" />
                                    <p>Your vote is anonymous and encrypted.</p>
                                </div>
                                <div className="flex gap-3">
                                    <FileText size={18} className="text-sky-500 shrink-0" />
                                    <p>You may only cast one vote per election.</p>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                <div className="mt-auto text-xs text-slate-600 flex items-center gap-2">
                    <HelpCircle size={14} />
                    Need help? Contact Election Admin
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 p-6 md:p-12 order-1 md:order-2 overflow-y-auto">
                <div className="max-w-3xl mx-auto animate-in slide-in-from-bottom-4 duration-500 fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

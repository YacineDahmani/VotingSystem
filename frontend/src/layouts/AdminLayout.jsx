import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Vote, LogOut, Activity, Users, Globe } from 'lucide-react';
import { useSystemStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/contexts/AdminContext';
import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminLayout() {
    const location = useLocation();
    const { data: status, isLoading } = useSystemStatus();
    const { logout } = useAdmin();

    const navItems = [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
        { label: 'Manage Elections', icon: Vote, path: '/admin/elections' },
    ];

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30">
            {/* Sidebar navigation */}
            <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-6 hidden md:flex flex-col">
                <div className="mb-10 flex items-center gap-3">
                    <div className="h-8 w-8 bg-sky-500 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-sky-500/20">
                        V
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-tight">SecureVote</h1>
                </div>

                <nav className="space-y-2 flex-1">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-3">Menu</div>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-sky-500/10 text-sky-400"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                                )}
                            >
                                <item.icon size={18} />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>

                <div className="mt-auto pt-6 border-t border-slate-800">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg w-full transition-colors"
                    >
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-10 px-8 flex items-center justify-between">
                    <div className="flex-1"></div> {/* Spacer or Breadcrumbs */}

                    <div className="flex items-center gap-6">
                        {/* System Stats Widget */}
                        <div className="flex items-center gap-4 text-xs font-medium">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800">
                                <Activity size={14} className={cn("text-emerald-500", isLoading && "animate-pulse")} />
                                <span className="text-slate-400">System:</span>
                                <span className={cn(status?.status === 'online' ? "text-emerald-400" : "text-amber-400")}>
                                    {status?.status === 'online' ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

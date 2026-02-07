import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Clock, Calendar } from 'lucide-react';

export function ElectionTimer({ election }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [status, setStatus] = useState('loading'); // loading, upcoming, running, ended

    useEffect(() => {
        if (!election) return;

        const updateTimer = () => {
            const now = new Date().getTime();
            const start = election.start_date ? new Date(election.start_date).getTime() : null;
            const end = election.end_date ? new Date(election.end_date).getTime() : null;
            const isClosed = election.status === 'closed';

            if (isClosed) {
                setStatus('ended');
                setTimeLeft('Ended');
                return;
            }

            if (start && now < start) {
                setStatus('upcoming');
                setTimeLeft(formatTime(start - now));
            } else if (end) {
                if (now < end) {
                    setStatus('running');
                    setTimeLeft(formatTime(end - now));
                } else {
                    setStatus('ended');
                    setTimeLeft('Time Expired');
                }
            } else {
                setStatus('running');
                setTimeLeft('Unlimited');
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [election]);

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const d = Math.floor(totalSeconds / (3600 * 24));
        const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    if (!election) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Election Status</span>
                {status === 'upcoming' && <Badge variant="info">Upcoming</Badge>}
                {status === 'running' && <Badge variant="success">Live</Badge>}
                {status === 'ended' && <Badge variant="danger">Closed</Badge>}
            </div>

            <Card className="p-4 bg-slate-900 border-none bg-opacity-50">
                <div className="flex items-center gap-3 text-slate-200">
                    <Clock size={20} className="text-sky-500" />
                    <div>
                        <div className="text-xs text-slate-400">
                            {status === 'upcoming' ? 'Starts In' : (status === 'ended' ? 'Status' : 'Time Remaining')}
                        </div>
                        <div className="text-xl font-bold font-mono tracking-wide">
                            {timeLeft}
                        </div>
                    </div>
                </div>
            </Card>

            {election.start_date && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar size={12} />
                    <span>Started: {new Date(election.start_date).toLocaleDateString()}</span>
                </div>
            )}
        </div>
    );
}

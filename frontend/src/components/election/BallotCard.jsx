import { CheckCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export function BallotCard({ candidate, onVote, disabled, isSelected }) {
    return (
        <div
            className={cn(
                "relative group bg-slate-800 border transition-all duration-200 rounded-xl overflow-hidden",
                "hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10",
                isSelected ? "border-sky-500 ring-1 ring-sky-500 bg-sky-500/5" : "border-slate-700"
            )}
        >
            <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-inner"
                        style={{ backgroundColor: candidate.color_code }}
                    >
                        {candidate.name.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors">
                            {candidate.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">
                            <User size={12} /> Official Candidate
                        </div>
                    </div>
                </div>

                <Button
                    onClick={() => onVote(candidate.id)}
                    disabled={disabled}
                    className={cn(
                        "w-full transition-all duration-300",
                        disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98]"
                    )}
                    variant={isSelected ? "primary" : "outline"}
                >
                    <CheckCircle size={18} className="mr-2" />
                    {isSelected ? "Confirm Vote" : "Select Candidate"}
                </Button>
            </div>
        </div>
    );
}

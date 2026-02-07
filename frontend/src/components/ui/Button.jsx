import { cn } from '@/lib/utils';

export function Button({ className, variant = 'primary', size = 'default', ...props }) {
    const variants = {
        primary: "bg-sky-500 hover:bg-sky-400 text-white shadow-sm shadow-sky-500/20",
        secondary: "bg-slate-700 hover:bg-slate-600 text-slate-100",
        outline: "border border-slate-700 hover:bg-slate-800 text-slate-300",
        ghost: "hover:bg-slate-800 text-slate-400 hover:text-white",
        destructive: "bg-red-500 hover:bg-red-600 text-white",
        emerald: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm shadow-emerald-500/20"
    };

    const sizes = {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4 py-2",
        lg: "h-12 px-8 text-lg",
        icon: "h-10 w-10 p-2 flex items-center justify-center"
    };

    return (
        <button
            className={cn(
                "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        />
    );
}

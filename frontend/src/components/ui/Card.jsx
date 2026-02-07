import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }) {
    return (
        <div
            className={cn(
                "bg-slate-800 border border-slate-700 rounded-xl shadow-sm text-slate-100 overflow-hidden",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export function CardHeader({ className, children, ...props }) {
    return <div className={cn("p-6 pb-2", className)} {...props}>{children}</div>
}

export function CardTitle({ className, children, ...props }) {
    return <h3 className={cn("text-lg font-semibold leading-none tracking-tight text-white", className)} {...props}>{children}</h3>
}

export function CardContent({ className, children, ...props }) {
    return <div className={cn("p-6 pt-2", className)} {...props}>{children}</div>
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext } from './ToastContext';

const STATUS_CONFIGS = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    badgeClass: 'text-emerald-800 dark:text-emerald-300 border-emerald-600/30 bg-emerald-500/10',
    barClass: 'bg-emerald-600 dark:bg-emerald-400',
    accentBorder: 'border-t-2 border-t-emerald-600 dark:border-t-emerald-400',
    defaultTitle: 'Success',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    badgeClass: 'text-rose-800 dark:text-rose-300 border-rose-600/30 bg-rose-500/10',
    barClass: 'bg-rose-600 dark:bg-rose-400',
    accentBorder: 'border-t-2 border-t-rose-600 dark:border-t-rose-400',
    defaultTitle: 'Error',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    badgeClass: 'text-amber-800 dark:text-amber-300 border-amber-600/30 bg-amber-500/10',
    barClass: 'bg-amber-600 dark:bg-amber-400',
    accentBorder: 'border-t-2 border-t-amber-600 dark:border-t-amber-400',
    defaultTitle: 'Warning',
  },
  info: {
    label: 'Notice',
    icon: Info,
    badgeClass: 'text-[var(--blueprint)] dark:text-sky-300 border-[var(--blueprint)]/30 bg-sky-500/10',
    barClass: 'bg-[var(--blueprint)] dark:bg-sky-400',
    accentBorder: 'border-t-2 border-t-[var(--blueprint)] dark:border-t-sky-400',
    defaultTitle: 'Notice',
  },
};

function ToastItem({ toast, onDismiss, onPause, onResume }) {
  const config = STATUS_CONFIGS[toast.type] || STATUS_CONFIGS.info;
  const isError = toast.type === 'error';
  const IconComponent = config.icon;
  const progressRef = useRef(null);

  return (
    <Motion.div
      layout
      initial={{ opacity: 0, x: 16, y: -2, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.96, transition: { duration: 0.16, ease: 'easeOut' } }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className={`pointer-events-auto relative w-full bg-[var(--surface-container-lowest)] border border-[var(--on-surface)]/20 dark:border-[var(--on-surface)]/30 shadow-lg p-4 flex flex-col gap-2 ${config.accentBorder}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={() => onPause(toast.id)}
      onMouseLeave={() => onResume(toast.id)}
    >
      {/* Header bar with status badge and dismiss button */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--on-surface)]/10 pb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono font-medium tracking-wide uppercase border ${config.badgeClass}`}>
            <IconComponent size={12} strokeWidth={2} />
            <span>{config.label}</span>
          </span>
          {toast.timestamp && (
            <span className="font-mono text-xs text-[var(--on-surface)]/50 select-none">
              {toast.timestamp}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="p-1 text-[var(--on-surface)]/50 hover:text-[var(--on-surface)] hover:bg-[var(--on-surface)]/10 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>

      {/* Main Content */}
      <div className="pt-0.5">
        <h4 className="font-sans text-sm font-bold text-[var(--on-surface)] leading-snug">
          {toast.title}
        </h4>
        {toast.message ? (
          <p className="mt-1 text-xs text-[var(--on-surface)]/80 font-sans leading-relaxed break-words">
            {toast.message}
          </p>
        ) : null}
      </div>

      {/* Hairline countdown progress indicator */}
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--on-surface)]/10 overflow-hidden">
          <div
            ref={progressRef}
            className={`h-full ${config.barClass}`}
            style={{
              animation: `shrinkWidth ${toast.duration}ms linear forwards`,
              animationPlayState: toast.isPaused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </Motion.div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const theme = STATUS_CONFIGS[toast.type] || STATUS_CONFIGS.info;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const nextToast = {
      id,
      type: toast.type || 'info',
      title: toast.title || theme.defaultTitle,
      message: toast.message || '',
      duration: typeof toast.duration === 'number' ? toast.duration : 5500,
      timestamp: timeStr,
      isPaused: false,
    };

    setToasts((current) => [...current, nextToast]);
    return id;
  }, []);

  useEffect(() => {
    const activeTimers = new Map();

    toasts.forEach((toast) => {
      if (toast.duration > 0 && !toast.isPaused) {
        const timer = window.setTimeout(() => {
          dismissToast(toast.id);
        }, toast.duration);
        activeTimers.set(toast.id, timer);
      }
    });

    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, dismissToast]);

  const pauseToast = useCallback((id) => {
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, isPaused: true } : t))
    );
  }, []);

  const resumeToast = useCallback((id) => {
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, isPaused: false } : t))
    );
  }, []);

  const value = useMemo(() => ({
    pushToast,
    dismissToast,
  }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 sm:right-6 top-20 z-[150] flex w-[min(24rem,92vw)] flex-col gap-3 pointer-events-none"
        aria-live="polite"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={dismissToast}
              onPause={pauseToast}
              onResume={resumeToast}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
